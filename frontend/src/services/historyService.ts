import { apiBlob, apiRequest } from './api'
import type { ApiResponse, HistoryData } from '../types/api'
import { triggerBrowserDownload } from './migrationService'

const query = (startDate: string, endDate: string) => `startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
export const getHistory = (startDate: string, endDate: string): Promise<ApiResponse<HistoryData>> =>
  apiRequest(`/api/history?${query(startDate, endDate)}`)
export const exportExcel = (startDate: string, endDate: string): Promise<Blob> => apiBlob(`/api/history/export.xlsx?${query(startDate, endDate)}`)
export const exportPdf = (startDate: string, endDate: string): Promise<Blob> => apiBlob(`/api/history/export.pdf?${query(startDate, endDate)}`)
export const downloadHistoryFile = (blob: Blob, filename: string): void => triggerBrowserDownload(blob, filename)
