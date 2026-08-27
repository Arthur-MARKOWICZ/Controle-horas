import { apiBlob, apiRequest } from './api'
import type { AdministrativeWorkLogPayload, ApiResponse, HistoryData, WorkLog } from '../types/api'
import { triggerBrowserDownload } from './migrationService'

const periodQuery = (startDate: string, endDate: string) => `startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
const historyQuery = (startDate: string, endDate: string, limit: number, offset: number) => `${periodQuery(startDate, endDate)}&limit=${limit}&offset=${offset}`
export const getHistory = (startDate: string, endDate: string, limit = 10, offset = 0): Promise<ApiResponse<HistoryData>> =>
  apiRequest(`/api/history?${historyQuery(startDate, endDate, limit, offset)}`)
export const getUserHistory = (userId: string, startDate: string, endDate: string, limit = 10, offset = 0): Promise<ApiResponse<HistoryData>> =>
  apiRequest(`/api/users/${userId}/history?${historyQuery(startDate, endDate, limit, offset)}`)
export const createUserWorkLog = (userId: string, payload: AdministrativeWorkLogPayload): Promise<ApiResponse<WorkLog>> =>
  apiRequest(`/api/users/${userId}/work-logs`, { method: 'POST', body: JSON.stringify(payload) })
export const updateUserWorkLog = (userId: string, workLogId: string, payload: AdministrativeWorkLogPayload): Promise<ApiResponse<WorkLog>> =>
  apiRequest(`/api/users/${userId}/work-logs/${workLogId}`, { method: 'PUT', body: JSON.stringify(payload) })
export const deleteUserWorkLog = (userId: string, workLogId: string): Promise<ApiResponse<null>> =>
  apiRequest(`/api/users/${userId}/work-logs/${workLogId}`, { method: 'DELETE' })
export const exportExcel = (startDate: string, endDate: string): Promise<Blob> => apiBlob(`/api/history/export.xlsx?${periodQuery(startDate, endDate)}`)
export const exportPdf = (startDate: string, endDate: string): Promise<Blob> => apiBlob(`/api/history/export.pdf?${periodQuery(startDate, endDate)}`)
export const downloadHistoryFile = (blob: Blob, filename: string): void => triggerBrowserDownload(blob, filename)
