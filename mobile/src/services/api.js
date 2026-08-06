import axios from 'axios'
import { clearSession, readSession } from './sessionStorage'

const baseURL = process.env.EXPO_PUBLIC_API_BASE_URL
if (!baseURL) console.warn('EXPO_PUBLIC_API_BASE_URL is not configured')
const api = axios.create({ baseURL, timeout: 15000, headers: { 'Content-Type': 'application/json' } })
let onUnauthorized = null
export function setUnauthorizedHandler(handler) { onUnauthorized = handler }
api.interceptors.request.use(async (config) => {
  const { token } = await readSession()
  if (token) config.headers.Authorization = `Bearer ${token}`
  if (config.data instanceof FormData) delete config.headers['Content-Type']
  return config
})
api.interceptors.response.use((response) => response, async (error) => {
  if (error.response?.status === 401) { await clearSession(); onUnauthorized?.() }
  return Promise.reject(error)
})
export default api
