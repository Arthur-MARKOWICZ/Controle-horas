import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as authService from '../services/authService'
import { setUnauthorizedHandler } from '../services/api'
import { clearSession, readSession, saveSession } from '../services/sessionStorage'
import {
  clearBiometricLogin,
  isBiometricLoginAvailable,
  migrateLegacyBiometricLogin,
  readBiometricCredential,
  readBiometricMetadata,
  saveBiometricCredential,
} from '../services/localCredentialsService'

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
    setUnauthorizedHandler(() => clear())
    return () => setUnauthorizedHandler(null)
  }, [clear])
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        if (await migrateLegacyBiometricLogin()) {
          await clearSession()
          if (active) setSession({ ...emptySession, ready: true })
          return
        }
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
  const enableBiometricLogin = useCallback(async () => {
    const response = await authService.createBiometricCredential()
    if (!response.success || !response.data) throw new Error(response.message || 'Falha ao criar a credencial biométrica.')
    try {
      await saveBiometricCredential(response.data)
    } catch (error) {
      await clearBiometricLogin()
      await authService.revokeBiometricCredential(response.data.credentialId).catch(() => undefined)
      throw error
    }
  }, [])
  const loginWithBiometrics = useCallback(async (email) => {
    try {
      const credential = await readBiometricCredential(email)
      const response = await authService.biometricLogin(credential)
      if (!response.success || !response.data) throw new Error(response.message || 'Falha na autenticação biométrica.')
      const user = await saveSession(response.data)
      setSession({ token: response.data.token, user, ready: true, isBiometricSession: true })
    } catch (error) {
      if (error?.response?.status === 401 || error?.biometricReason === 'invalidated') await clearBiometricLogin()
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
    logout: async () => {
      try {
        const metadata = await readBiometricMetadata()
        if (metadata) await authService.revokeBiometricCredential(metadata.credentialId)
        await authService.logout()
      } finally {
        await clear({ clearBiometric: true })
      }
    },
  }), [session, authenticate, clear, enableBiometricLogin, loginWithBiometrics])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
