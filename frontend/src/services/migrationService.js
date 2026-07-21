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
  // Do not set Content-Type manually — the browser must include the multipart boundary.
  const response = await api.post('/api/migrations/import', formData)
  return response.data
}

export function triggerBrowserDownload(blob, filename) {
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => {
    window.URL.revokeObjectURL(url)
  }, 1000)
}
