import { apiRequest } from './api'
import type { ApiResponse, AuthData } from '../types/api'

export function register(payload: { name: string; email: string; password: string }): Promise<ApiResponse<AuthData>> {
  return apiRequest('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) }, false)
}
export function login(payload: { email: string; password: string }): Promise<ApiResponse<AuthData>> {
  return apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) }, false)
}
export function logout(): Promise<ApiResponse<null>> { return apiRequest('/api/auth/logout', { method: 'POST' }, false) }
