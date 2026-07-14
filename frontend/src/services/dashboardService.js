import api from './api'

export async function getTodayDashboard() {
  const response = await api.get('/api/dashboard/today')
  return response.data
}

export async function registerEntry() {
  const response = await api.post('/api/work-logs/entry')
  return response.data
}

export async function registerExit() {
  const response = await api.post('/api/work-logs/exit')
  return response.data
}

export async function updateDailyWorkload(standardEntryTime, standardExitTime) {
  const response = await api.put('/api/users/me/daily-workload', { standardEntryTime, standardExitTime })
  return response.data
}
