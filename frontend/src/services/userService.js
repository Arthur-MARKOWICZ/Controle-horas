import api from './api'

export async function getCurrentUser() {
  const response = await api.get('/api/users/me')
  return response.data
}

export async function listUsers() {
  const response = await api.get('/api/users')
  return response.data
}

export async function createUser(payload) {
  const response = await api.post('/api/users', payload)
  return response.data
}

export async function updateUser(userId, payload) {
  const response = await api.put(`/api/users/${userId}`, payload)
  return response.data
}

export async function assignManager(userId, managerId) {
  const response = await api.put(`/api/users/${userId}/manager`, { managerId })
  return response.data
}
