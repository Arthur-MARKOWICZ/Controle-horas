jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }))

const values = {}
jest.mock('expo-secure-store', () => ({
  canUseBiometricAuthentication: jest.fn(() => true),
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
  consumeBiometricMigrationNotice,
  migrateLegacyBiometricLogin,
  readBiometricCredential,
  readBiometricMetadata,
  readRememberedEmail,
  saveBiometricCredential,
  saveRememberedEmail,
} from './localCredentialsService'

const credential = {
  credentialId: '00000000-0000-4000-8000-000000000001',
  credentialSecret: 'secret-value',
  email: 'User@Example.com',
}

beforeEach(() => {
  Object.keys(values).forEach((key) => delete values[key])
  jest.clearAllMocks()
})

describe('localCredentialsService', () => {
  it('saves and removes the remembered email only when requested', async () => {
    await saveRememberedEmail('USER@example.com', true)
    await expect(readRememberedEmail()).resolves.toBe('user@example.com')

    await saveRememberedEmail('user@example.com', false)
    await expect(readRememberedEmail()).resolves.toBe('')
  })

  it('stores only the random credential secret behind device authentication', async () => {
    await saveBiometricCredential(credential)

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'controle_horas_biometric_secret_v2',
      'secret-value',
      expect.objectContaining({ requireAuthentication: true }),
    )
    await expect(readBiometricMetadata()).resolves.toEqual({
      credentialId: credential.credentialId,
      email: 'user@example.com',
    })
    expect(values.controle_horas_biometric_metadata_v2).not.toContain('secret-value')
  })

  it('reads the protected secret exactly once and never rewrites it during login', async () => {
    await saveBiometricCredential(credential)
    jest.clearAllMocks()

    await expect(readBiometricCredential('USER@example.com')).resolves.toEqual({
      credentialId: credential.credentialId,
      credentialSecret: 'secret-value',
      email: 'user@example.com',
    })

    const protectedReads = SecureStore.getItemAsync.mock.calls.filter(([key]) => key === 'controle_horas_biometric_secret_v2')
    expect(protectedReads).toHaveLength(1)
    expect(protectedReads[0][1]).toEqual(expect.objectContaining({ requireAuthentication: true }))
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled()
  })

  it('rejects a different email before reading the protected secret', async () => {
    await saveBiometricCredential(credential)
    jest.clearAllMocks()

    await expect(readBiometricCredential('other@example.com')).rejects.toMatchObject({ biometricReason: 'email_mismatch' })
    expect(SecureStore.getItemAsync.mock.calls.some(([key]) => key === 'controle_horas_biometric_secret_v2')).toBe(false)
  })

  it('migrates the legacy format to a one-time password notice', async () => {
    values.controle_horas_biometric_enabled = 'true'
    values.controle_horas_biometric_session = 'legacy-refresh-token'

    await expect(migrateLegacyBiometricLogin()).resolves.toBe(true)
    expect(values.controle_horas_biometric_enabled).toBeUndefined()
    expect(values.controle_horas_biometric_session).toBeUndefined()
    await expect(consumeBiometricMigrationNotice()).resolves.toBe(true)
    await expect(consumeBiometricMigrationNotice()).resolves.toBe(false)
  })

  it('removes metadata, protected secret and legacy values', async () => {
    await saveBiometricCredential(credential)
    values.controle_horas_biometric_enabled = 'true'
    await clearBiometricLogin()

    expect(values.controle_horas_biometric_metadata_v2).toBeUndefined()
    expect(values.controle_horas_biometric_secret_v2).toBeUndefined()
    expect(values.controle_horas_biometric_enabled).toBeUndefined()
  })
})
