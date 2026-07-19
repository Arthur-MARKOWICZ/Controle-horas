import api from './api'

export async function downloadTemplate(format) {
  const response = await api.get(`/api/migrations/template.${format}`, {
    responseType: 'blob',
  })
  return response.data
}

export async function importWorkLogs(file) {
  const formData = new FormData()
  formData.append('file', file)
  const response = await api.post('/api/migrations/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data
}

export function triggerBrowserDownload(blob, filename) {
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.URL.revokeObjectURL(url)
}
