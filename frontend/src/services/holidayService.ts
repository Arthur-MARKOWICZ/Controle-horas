import { apiRequest } from './api'
import type {
  ApiResponse, HolidayCalendarData, HolidayDay, HolidayRule, HolidayRulePayload,
  HolidaySyncResult, ManualHolidayPayload,
} from '../types/api'

export const getHolidays = (startDate: string, endDate: string, userId?: string): Promise<ApiResponse<HolidayCalendarData>> => {
  const period = `startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
  return apiRequest(`/api/holidays?${period}${userId ? `&userId=${encodeURIComponent(userId)}` : ''}`)
}

export const syncHolidays = (year: number): Promise<ApiResponse<HolidaySyncResult>> =>
  apiRequest('/api/holidays/sync', { method: 'POST', body: JSON.stringify({ year }) })

export const listHolidayRules = (): Promise<ApiResponse<HolidayRule[]>> =>
  apiRequest('/api/holidays/rules')

export const saveHolidayRule = (holidayId: string, payload: HolidayRulePayload): Promise<ApiResponse<HolidayRule[]>> =>
  apiRequest(`/api/holidays/${holidayId}/rule`, { method: 'PUT', body: JSON.stringify(payload) })

export const deleteHolidayRule = (ruleId: string): Promise<ApiResponse<null>> =>
  apiRequest(`/api/holidays/rules/${ruleId}`, { method: 'DELETE' })

export const createHoliday = (payload: ManualHolidayPayload): Promise<ApiResponse<HolidayDay>> =>
  apiRequest('/api/holidays', { method: 'POST', body: JSON.stringify(payload) })

export const deleteHoliday = (holidayId: string): Promise<ApiResponse<null>> =>
  apiRequest(`/api/holidays/${holidayId}`, { method: 'DELETE' })
