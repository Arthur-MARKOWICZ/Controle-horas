import api from './api'

export async function getHistory(startDate, endDate) {
  const response = await api.get('/api/history', {
    params: { startDate, endDate },
  })
  return response.data
}
