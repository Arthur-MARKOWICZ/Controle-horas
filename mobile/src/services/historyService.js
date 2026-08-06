import api from './api'
export const getHistory = async (startDate, endDate) => (await api.get('/api/history', { params: { startDate, endDate } })).data
export const downloadHistory = async (format, startDate, endDate) => (await api.get(`/api/history/export.${format}`, { params: { startDate, endDate }, responseType: 'arraybuffer' })).data
