import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as authService from '../services/authService'
import * as userService from '../services/userService'
import { refreshSession, setAccessToken, setRefreshedHandler, setUnauthorizedHandler } from '../services/api'
import type { AuthData, SessionUser } from '../types/api'

export interface AuthContextValue {
  token: string | null; user: SessionUser | null; isAuthenticated: boolean; isSessionReady: boolean
  isAdmin: boolean; isManager: boolean; canManageUsers: boolean
  login: (data: { email: string; password: string }) => Promise<AuthData>
  register: (data: { name: string; email: string; password: string }) => Promise<AuthData>
  logout: () => Promise<void>; refreshCurrentUser: () => Promise<SessionUser>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function sessionUser(data: AuthData): SessionUser {
  return { userId: data.userId, name: data.name, email: data.email, role: data.role }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<SessionUser | null>(null)
  const [isSessionReady, setIsSessionReady] = useState(false)

  const persistSession = useCallback((data: AuthData) => {
    setAccessToken(data.token); setToken(data.token); setUser(sessionUser(data))
  }, [])
  const clearSession = useCallback(() => { setAccessToken(null); setToken(null); setUser(null) }, [])

  useEffect(() => {
    setUnauthorizedHandler(clearSession)
    setRefreshedHandler(persistSession)
    return () => { setUnauthorizedHandler(null); setRefreshedHandler(null) }
  }, [clearSession, persistSession])

  const refreshCurrentUser = useCallback(async () => {
    const response = await userService.getCurrentUser()
    if (!response.success || !response.data) throw new Error(response.message || 'Unable to load current user')
    const current: SessionUser = { userId: response.data.id, name: response.data.name, email: response.data.email, role: response.data.role }
    setUser(current); return current
  }, [])

  useEffect(() => {
    let cancelled = false
    void refreshSession().then((data) => {
      if (!cancelled && data) persistSession(data)
    }).finally(() => { if (!cancelled) setIsSessionReady(true) })
    return () => { cancelled = true }
  }, [persistSession])

  const login = useCallback(async (credentials: { email: string; password: string }) => {
    const response = await authService.login(credentials)
    if (!response.success || !response.data) throw new Error(response.message || 'Unable to login')
    persistSession(response.data); setIsSessionReady(true); return response.data
  }, [persistSession])
  const register = useCallback(async (data: { name: string; email: string; password: string }) => {
    const response = await authService.register(data)
    if (!response.success || !response.data) throw new Error(response.message || 'Unable to register')
    persistSession(response.data); setIsSessionReady(true); return response.data
  }, [persistSession])
  const logout = useCallback(async () => {
    try { await authService.logout() } finally { clearSession(); setIsSessionReady(true) }
  }, [clearSession])

  const value = useMemo<AuthContextValue>(() => ({
    token, user, isAuthenticated: Boolean(token), isSessionReady,
    isAdmin: user?.role === 'ADMIN', isManager: user?.role === 'MANAGER',
    canManageUsers: user?.role === 'ADMIN' || user?.role === 'MANAGER',
    login, register, logout, refreshCurrentUser,
  }), [token, user, isSessionReady, login, register, logout, refreshCurrentUser])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthContext
