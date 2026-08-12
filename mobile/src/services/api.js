import axios from 'axios'
import { Platform } from 'react-native'
import { clearSession, readSession, saveSession } from './sessionStorage'

const baseURL = process.env.EXPO_PUBLIC_API_BASE_URL
if (!baseURL) console.warn('EXPO_PUBLIC_API_BASE_URL is not configured')
const api = axios.create({ baseURL, timeout: 15000, withCredentials: Platform.OS === 'web', headers: { 'Content-Type': 'application/json' } })
const authClient = axios.create({ baseURL, timeout: 15000, withCredentials: Platform.OS === 'web' })
let onUnauthorized = null
let refreshInFlight = null

export function setUnauthorizedHandler(handler) { onUnauthorized = handler }
export async function refreshSession(explicitRefreshToken) {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const stored = await readSession()
      const refreshToken = explicitRefreshToken || stored.refreshToken
      const path = Platform.OS === 'web' ? '/api/auth/refresh' : '/api/auth/mobile/refresh'
      if (Platform.OS !== 'web' && !refreshToken) throw new Error('Refresh token não encontrado.')
      const response = await authClient.post(path, Platform.OS === 'web' ? {} : { refreshToken })
      if (!response.data?.success || !response.data.data) throw new Error(response.data?.message || 'Falha ao renovar sessão.')
      await saveSession(response.data.data)
      return response.data.data
    })().finally(() => { refreshInFlight = null })
  }
  return refreshInFlight
}

api.interceptors.request.use(async (config) => {
  const { token } = await readSession()
  if (token) config.headers.Authorization = `Bearer ${token}`
  if (config.data instanceof FormData) delete config.headers['Content-Type']
  return config
})
api.interceptors.response.use((response) => response, async (error) => {
  const request = error.config
  const isAuthRequest = request?.url?.startsWith('/api/auth/')
  if (error.response?.status === 401 && request && !request._refreshRetried && !isAuthRequest) {
    request._refreshRetried = true
    try {
      const data = await refreshSession()
      request.headers.Authorization = `Bearer ${data.token}`
      return api(request)
    } catch {
      await clearSession()
      onUnauthorized?.()
    }
  }
  return Promise.reject(error)
})
export default api
