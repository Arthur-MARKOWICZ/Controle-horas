import { apiRequest } from './api'
import type { ApiResponse, CurrentUser, ManagedUser } from '../types/api'

export const getCurrentUser = (): Promise<ApiResponse<CurrentUser>> => apiRequest('/api/users/me')
export const listUsers = (): Promise<ApiResponse<ManagedUser[]>> => apiRequest('/api/users')
export const createUser = (payload: Record<string, unknown>): Promise<ApiResponse<ManagedUser>> =>
  apiRequest('/api/users', { method: 'POST', body: JSON.stringify(payload) })
export const updateUser = (userId: string, payload: Record<string, unknown>): Promise<ApiResponse<ManagedUser>> =>
  apiRequest(`/api/users/${userId}`, { method: 'PUT', body: JSON.stringify(payload) })
export const assignManager = (userId: string, managerId: string | null): Promise<ApiResponse<ManagedUser>> =>
  apiRequest(`/api/users/${userId}/manager`, { method: 'PUT', body: JSON.stringify({ managerId }) })
