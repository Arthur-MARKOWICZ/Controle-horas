import { apiRequest } from './api'
import type { ApiResponse, AuthData } from '../types/api'

export function register(payload: { name: string; email: string; password: string }): Promise<ApiResponse<AuthData>> {
  return apiRequest('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) }, false)
}
export function login(payload: { email: string; password: string }): Promise<ApiResponse<AuthData>> {
  return apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) }, false)
}
export function logout(): Promise<ApiResponse<null>> { return apiRequest('/api/auth/logout', { method: 'POST' }, false) }
export function requestPasswordReset(email: string): Promise<ApiResponse<null>> {
  return apiRequest('/api/auth/password-reset/request', { method: 'POST', body: JSON.stringify({ email }) }, false)
}
export function resetPassword(token: string, newPassword: string): Promise<ApiResponse<null>> {
  return apiRequest('/api/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify({ token, newPassword }) }, false)
}
export function changePassword(payload: { currentPassword: string; newPassword: string }): Promise<ApiResponse<null>> {
  return apiRequest('/api/auth/password', { method: 'POST', body: JSON.stringify(payload) })
}
