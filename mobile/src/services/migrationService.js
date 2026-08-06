import api from './api'
export const downloadTemplate = async (format) => (await api.get(`/api/migrations/template.${format}`, { responseType: 'arraybuffer' })).data
export async function importWorkLogs(file) {
  const form = new FormData(); form.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' })
  return (await api.post('/api/migrations/import', form)).data
}
