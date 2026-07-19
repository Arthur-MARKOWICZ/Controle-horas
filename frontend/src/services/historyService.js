import api from './api'
import { triggerBrowserDownload } from './migrationService'

export async function getHistory(startDate, endDate) {
  const response = await api.get('/api/history', {
    params: { startDate, endDate },
  })
  return response.data
}

export async function exportExcel(startDate, endDate) {
  const response = await api.get('/api/history/export.xlsx', {
    params: { startDate, endDate },
    responseType: 'blob',
  })
  return response.data
}

export async function exportPdf(startDate, endDate) {
  const response = await api.get('/api/history/export.pdf', {
    params: { startDate, endDate },
    responseType: 'blob',
  })
  return response.data
}

export function downloadHistoryFile(blob, filename) {
  triggerBrowserDownload(blob, filename)
}
