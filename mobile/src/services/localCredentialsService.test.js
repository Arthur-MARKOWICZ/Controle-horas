jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }))

const values = {}
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn((key) => Promise.resolve(values[key] || null)),
  setItemAsync: jest.fn((key, value) => { values[key] = value; return Promise.resolve() }),
  deleteItemAsync: jest.fn((key) => { delete values[key]; return Promise.resolve() }),
}))
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(() => Promise.resolve(true)),
  isEnrolledAsync: jest.fn(() => Promise.resolve(true)),
}))

import * as SecureStore from 'expo-secure-store'
import {
  clearBiometricLogin,
  enableBiometricLogin,
  readBiometricSession,
  readRememberedEmail,
  saveRememberedEmail,
} from './localCredentialsService'

beforeEach(() => {
  Object.keys(values).forEach((key) => delete values[key])
  jest.clearAllMocks()
})

describe('localCredentialsService', () => {
  it('saves and removes the remembered email only when requested', async () => {
    await saveRememberedEmail('user@example.com', true)
    await expect(readRememberedEmail()).resolves.toBe('user@example.com')

    await saveRememberedEmail('user@example.com', false)
    await expect(readRememberedEmail()).resolves.toBe('')
  })

  it('stores the biometric session protected by device authentication', async () => {
    await enableBiometricLogin({ token: 'jwt', userId: 'id', name: 'User', email: 'user@example.com', role: 'USER' })

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'controle_horas_biometric_session',
      expect.any(String),
      expect.objectContaining({ requireAuthentication: true }),
    )
    await expect(readBiometricSession()).resolves.toEqual({
      token: 'jwt',
      user: { userId: 'id', name: 'User', email: 'user@example.com', role: 'USER' },
    })
  })

  it('removes the enabled preference and protected session', async () => {
    await enableBiometricLogin({ token: 'jwt', userId: 'id', name: 'User', email: 'user@example.com', role: 'USER' })
    await clearBiometricLogin()

    expect(values.controle_horas_biometric_enabled).toBeUndefined()
    expect(values.controle_horas_biometric_session).toBeUndefined()
  })
})
