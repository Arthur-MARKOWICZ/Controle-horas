import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as authService from '../services/authService'
import { setUnauthorizedHandler } from '../services/api'
import { clearSession, readSession, saveSession } from '../services/sessionStorage'
import { clearBiometricLogin, enableBiometricLogin, isBiometricLoginAvailable, readBiometricSession } from '../services/localCredentialsService'

const emptySession = { token: null, user: null, ready: false, isBiometricSession: false }
const AuthContext = createContext(null)
export function AuthProvider({ children }) {
  const [session, setSession] = useState(emptySession)
  const clear = useCallback(async ({ clearBiometric = false } = {}) => {
    await clearSession()
    if (clearBiometric) await clearBiometricLogin()
    setSession({ ...emptySession, ready: true })
  }, [])
  useEffect(() => {
    setUnauthorizedHandler(() => clear({ clearBiometric: session.isBiometricSession }))
    return () => setUnauthorizedHandler(null)
  }, [clear, session.isBiometricSession])
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        if (await isBiometricLoginAvailable()) {
          await clearSession()
          if (active) setSession({ ...emptySession, ready: true })
          return
        }
        const stored = await readSession()
        const data = await authService.refresh(stored.refreshToken)
        const user = await saveSession(data)
        if (active) setSession({ token: data.token, user, ready: true, isBiometricSession: false })
      } catch {
        await clearSession()
        if (active) setSession({ ...emptySession, ready: true })
      }
    })()
    return () => { active = false }
  }, [])
  const authenticate = useCallback(async (method, payload) => {
    const response = await authService[method](payload)
    if (!response.success || !response.data) throw new Error(response.message || 'Falha na autenticação.')
    const user = await saveSession(response.data)
    setSession({ token: response.data.token, user, ready: true, isBiometricSession: false })
    return response.data
  }, [])
  const loginWithBiometrics = useCallback(async () => {
    try {
      const biometricSession = await readBiometricSession()
      const data = await authService.refresh(biometricSession.refreshToken)
      await enableBiometricLogin(data)
      const user = await saveSession(data)
      setSession({ token: data.token, user, ready: true, isBiometricSession: true })
    } catch (error) {
      await clearBiometricLogin()
      throw error
    }
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
    logout: async () => { try { await authService.logout() } finally { await clear({ clearBiometric: true }) } },
  }), [session, authenticate, clear, loginWithBiometrics])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
