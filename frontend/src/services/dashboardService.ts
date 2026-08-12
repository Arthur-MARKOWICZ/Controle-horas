import { apiRequest } from './api'
import type { ApiResponse, DashboardData, SchedulePayload } from '../types/api'

export const getTodayDashboard = (): Promise<ApiResponse<DashboardData>> => apiRequest('/api/dashboard/today')
export const registerEntry = (): Promise<ApiResponse<DashboardData>> => apiRequest('/api/work-logs/entry', { method: 'POST' })
export const registerPause = (): Promise<ApiResponse<DashboardData>> => apiRequest('/api/work-logs/pause', { method: 'POST' })
export const registerLunch = (): Promise<ApiResponse<DashboardData>> => apiRequest('/api/work-logs/lunch', { method: 'POST' })
export const registerResume = (): Promise<ApiResponse<DashboardData>> => apiRequest('/api/work-logs/resume', { method: 'POST' })
export const registerExit = (): Promise<ApiResponse<DashboardData>> => apiRequest('/api/work-logs/exit', { method: 'POST' })
export const updateDailyWorkload = (payload: SchedulePayload): Promise<ApiResponse<SchedulePayload & { dailyWorkloadMinutes: number }>> =>
  apiRequest('/api/users/me/daily-workload', { method: 'PUT', body: JSON.stringify(payload) })
