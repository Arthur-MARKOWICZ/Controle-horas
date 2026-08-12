import { Platform } from 'react-native'
import api, { refreshSession } from './api'
import { readSession } from './sessionStorage'

const prefix = Platform.OS === 'web' ? '/api/auth' : '/api/auth/mobile'
export const login = async (payload) => (await api.post(`${prefix}/login`, payload)).data
export const register = async (payload) => (await api.post(`${prefix}/register`, payload)).data
export const refresh = async (refreshToken) => refreshSession(refreshToken)
export const logout = async () => {
  const { refreshToken } = await readSession()
  return (await api.post(`${prefix}/logout`, Platform.OS === 'web' ? {} : { refreshToken })).data
}
