import { apiBlob, apiRequest } from './api'
import type { ApiResponse, ImportResult } from '../types/api'

export const downloadTemplate = (format: 'csv' | 'xlsx'): Promise<Blob> => apiBlob(`/api/migrations/template.${format}`)
export const importWorkLogs = (file: File): Promise<ApiResponse<ImportResult>> => {
  const form = new FormData(); form.append('file', file)
  return apiRequest('/api/migrations/import', { method: 'POST', body: form })
}
export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a')
  anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
