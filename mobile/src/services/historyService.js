import api from './api'
export const getHistory = async (startDate, endDate) => (await api.get('/api/history', { params: { startDate, endDate } })).data
export const getUserHistory = async (userId, startDate, endDate) => (await api.get(`/api/users/${userId}/history`, { params: { startDate, endDate } })).data
export const createUserWorkLog = async (userId, payload) => (await api.post(`/api/users/${userId}/work-logs`, payload)).data
export const updateUserWorkLog = async (userId, workLogId, payload) => (await api.put(`/api/users/${userId}/work-logs/${workLogId}`, payload)).data
export const deleteUserWorkLog = async (userId, workLogId) => (await api.delete(`/api/users/${userId}/work-logs/${workLogId}`)).data
export const downloadHistory = async (format, startDate, endDate) => (await api.get(`/api/history/export.${format}`, { params: { startDate, endDate }, responseType: 'arraybuffer' })).data
