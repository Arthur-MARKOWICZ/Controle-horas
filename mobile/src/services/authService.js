import api from './api'
export const login = async (payload) => (await api.post('/api/auth/login', payload)).data
export const register = async (payload) => (await api.post('/api/auth/register', payload)).data
export const logout = async () => (await api.post('/api/auth/logout')).data
