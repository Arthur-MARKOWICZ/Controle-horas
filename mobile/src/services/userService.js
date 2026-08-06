import api from './api'
export const getCurrentUser = async () => (await api.get('/api/users/me')).data
export const listUsers = async () => (await api.get('/api/users')).data
export const createUser = async (payload) => (await api.post('/api/users', payload)).data
export const updateUser = async (id, payload) => (await api.put(`/api/users/${id}`, payload)).data
export const assignManager = async (id, managerId) => (await api.put(`/api/users/${id}/manager`, { managerId })).data
