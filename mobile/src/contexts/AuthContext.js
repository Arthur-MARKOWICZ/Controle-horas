import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as authService from '../services/authService'
import { setUnauthorizedHandler } from '../services/api'
import { clearSession, saveSession } from '../services/sessionStorage'
import {
  clearBiometricLogin,
  enableBiometricLogin,
  isBiometricLoginAvailable,
  readBiometricSession,
} from '../services/localCredentialsService'

const AuthContext = createContext(null)
export function AuthProvider({ children }) {
  const [session, setSession] = useState({ token: null, user: null, ready: true, isBiometricSession: false })
  const clear = useCallback(async ({ clearBiometric = false } = {}) => {
    await clearSession()
    if (clearBiometric) await clearBiometricLogin()
    setSession({ token: null, user: null, ready: true, isBiometricSession: false })
  }, [])
  useEffect(() => {
    setUnauthorizedHandler(() => clear({ clearBiometric: session.isBiometricSession }))
    return () => setUnauthorizedHandler(null)
  }, [clear, session.isBiometricSession])
  // The application deliberately starts unauthenticated. This keeps Login available
  // immediately and prevents any API request before the user explicitly signs in.
  useEffect(() => { clearSession() }, [clear])
  const authenticate = useCallback(async (method, payload) => {
    const response = await authService[method](payload)
    if (!response.success || !response.data) throw new Error(response.message || 'Falha na autenticação.')
    const user = await saveSession(response.data)
    setSession({ token: response.data.token, user, ready: true, isBiometricSession: false })
    return response.data
  }, [])
  const loginWithBiometrics = useCallback(async () => {
    const biometricSession = await readBiometricSession()
    await saveSession({ token: biometricSession.token, ...biometricSession.user })
    setSession({ ...biometricSession, ready: true, isBiometricSession: true })
  }, [])
  const value = useMemo(() => ({
    ...session,
    isAuthenticated: Boolean(session.token),
    isAdmin: session.user?.role === 'ADMIN',
    canManageUsers: ['ADMIN', 'MANAGER'].includes(session.user?.role),
    login: (data) => authenticate('login', data),
    register: (data) => authenticate('register', data),
    loginWithBiometrics,
    enableBiometricLogin,
    isBiometricLoginAvailable,
    logout: async () => { try { await authService.logout() } finally { await clear() } },
  }), [session, authenticate, clear, loginWithBiometrics])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error('useAuth must be used within AuthProvider'); return context }
