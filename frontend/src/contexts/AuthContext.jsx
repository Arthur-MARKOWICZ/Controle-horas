import { createContext, useCallback, useMemo, useState } from 'react'
import * as authService from '../services/authService'
import { TOKEN_STORAGE_KEY } from '../services/api'

const USER_STORAGE_KEY = 'controle_horas_user'

const AuthContext = createContext(null)

function readStoredUser() {
  const rawUser = localStorage.getItem(USER_STORAGE_KEY)
  if (!rawUser) {
    return null
  }

  try {
    return JSON.parse(rawUser)
  } catch {
    localStorage.removeItem(USER_STORAGE_KEY)
    return null
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY))
  const [user, setUser] = useState(() => readStoredUser())

  const persistSession = useCallback((authData) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, authData.token)
    const sessionUser = {
      userId: authData.userId,
      name: authData.name,
      email: authData.email,
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

  const login = useCallback(async ({ email, password }) => {
    const response = await authService.login({ email, password })
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Unable to login')
    }
    persistSession(response.data)
    return response.data
  }, [persistSession])

  const register = useCallback(async ({ name, email, password }) => {
    const response = await authService.register({ name, email, password })
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Unable to register')
    }
    persistSession(response.data)
    return response.data
  }, [persistSession])

  const logout = useCallback(() => {
    clearSession()
  }, [clearSession])

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token),
      login,
      register,
      logout,
    }),
    [token, user, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthContext
