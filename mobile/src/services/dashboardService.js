import api from './api'
export const getTodayDashboard = async () => (await api.get('/api/dashboard/today')).data
export const registerWorkLog = async (action) => (await api.post(`/api/work-logs/${action}`)).data
export const updateDailyWorkload = async (payload) => (await api.put('/api/users/me/daily-workload', payload)).data
