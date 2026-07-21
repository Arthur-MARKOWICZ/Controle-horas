import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import * as authService from '../services/authService'
import * as userService from '../services/userService'
import { TOKEN_STORAGE_KEY } from '../services/api'

const USER_STORAGE_KEY = 'controle_horas_user'

const AuthContext = createContext(null)

function extractRoleFromToken(token) {
  if (!token) {
    return null
  }
  try {
    const payloadPart = token.split('.')[1]
    if (!payloadPart) {
      return null
    }
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(window.atob(normalized))
    return payload.role || null
  } catch {
    return null
  }
}

function readStoredUser(token) {
  const rawUser = localStorage.getItem(USER_STORAGE_KEY)
  if (!rawUser) {
    return null
  }

  try {
    const storedUser = JSON.parse(rawUser)
    if (storedUser?.role) {
      return storedUser
    }
    const roleFromToken = extractRoleFromToken(token)
    if (!roleFromToken) {
      return storedUser
    }
    const hydratedUser = { ...storedUser, role: roleFromToken }
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(hydratedUser))
    return hydratedUser
  } catch {
    localStorage.removeItem(USER_STORAGE_KEY)
    return null
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY))
  const [user, setUser] = useState(() => readStoredUser(localStorage.getItem(TOKEN_STORAGE_KEY)))
  const [isSessionReady, setIsSessionReady] = useState(() => !localStorage.getItem(TOKEN_STORAGE_KEY))

  const persistSession = useCallback((authData) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, authData.token)
    const sessionUser = {
      userId: authData.userId,
      name: authData.name,
      email: authData.email,
      role: authData.role,
    }
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(sessionUser))
    setToken(authData.token)
    setUser(sessionUser)
  }, [])

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    localStorage.removeItem(USER_STORAGE_KEY)
    setToken(null)
    setUser(null)
  }, [])

  const refreshCurrentUser = useCallback(async () => {
    const response = await userService.getCurrentUser()
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Unable to load current user')
    }
    const current = response.data
    const sessionUser = {
      userId: current.id,
      name: current.name,
      email: current.email,
      role: current.role,
    }
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(sessionUser))
    setUser(sessionUser)
    return sessionUser
  }, [])

  useEffect(() => {
    let cancelled = false

    async function hydrateSession() {
      if (!token) {
        setIsSessionReady(true)
        return
      }
      try {
        await refreshCurrentUser()
      } catch {
        if (!cancelled) {
          clearSession()
        }
      } finally {
        if (!cancelled) {
          setIsSessionReady(true)
        }
      }
    }

    hydrateSession()
    return () => {
      cancelled = true
    }
  }, [token, refreshCurrentUser, clearSession])

  const login = useCallback(async ({ email, password }) => {
    const response = await authService.login({ email, password })
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Unable to login')
    }
    persistSession(response.data)
    setIsSessionReady(true)
    return response.data
  }, [persistSession])

  const register = useCallback(async ({ name, email, password }) => {
    const response = await authService.register({ name, email, password })
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Unable to register')
    }
    persistSession(response.data)
    setIsSessionReady(true)
    return response.data
  }, [persistSession])

  const logout = useCallback(async () => {
    try {
      await authService.logout()
    } catch {
      // Always clear local session even if the API call fails.
    } finally {
      clearSession()
      setIsSessionReady(true)
    }
  }, [clearSession])

  const canManageUsers = user?.role === 'ADMIN' || user?.role === 'MANAGER'
  const isAdmin = user?.role === 'ADMIN'
  const isManager = user?.role === 'MANAGER'

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token),
      isSessionReady,
      isAdmin,
      isManager,
      canManageUsers,
      login,
      register,
      logout,
      refreshCurrentUser,
    }),
    [token, user, isSessionReady, isAdmin, isManager, canManageUsers, login, register, logout, refreshCurrentUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthContext
