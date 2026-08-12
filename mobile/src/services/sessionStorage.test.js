jest.mock('react-native', () => ({ Platform: { OS: 'android' } }))

const values = {}
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn((key) => Promise.resolve(values[key] || null)),
  setItemAsync: jest.fn((key, value) => { values[key] = value; return Promise.resolve() }),
  deleteItemAsync: jest.fn((key) => { delete values[key]; return Promise.resolve() }),
}))

import { clearSession, readSession, saveSession } from './sessionStorage'

beforeEach(() => { Object.keys(values).forEach((key) => delete values[key]) })

it('stores access and refresh tokens separately in SecureStore', async () => {
  await saveSession({
    token: 'access', refreshToken: 'refresh', userId: 'id', name: 'User', email: 'user@example.com', role: 'USER',
  })
  await expect(readSession()).resolves.toEqual({
    token: 'access', refreshToken: 'refresh',
    user: { userId: 'id', name: 'User', email: 'user@example.com', role: 'USER' },
  })
})

it('replaces rotated refresh tokens', async () => {
  await saveSession({ token: 'access-1', refreshToken: 'refresh-1', userId: 'id', name: 'User', email: 'u@e.com', role: 'USER' })
  await saveSession({ token: 'access-2', refreshToken: 'refresh-2', userId: 'id', name: 'User', email: 'u@e.com', role: 'USER' })
  await expect(readSession()).resolves.toMatchObject({ token: 'access-2', refreshToken: 'refresh-2' })
})

it('removes the complete token pair on logout', async () => {
  await saveSession({ token: 'access', refreshToken: 'refresh', userId: 'id', name: 'User', email: 'u@e.com', role: 'USER' })
  await clearSession()
  await expect(readSession()).resolves.toEqual({ token: null, refreshToken: null, user: null })
})
