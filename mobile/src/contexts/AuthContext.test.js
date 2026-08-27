import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Button, Text } from 'react-native'
import * as authService from '../services/authService'
import * as localCredentials from '../services/localCredentialsService'
import * as sessionStorage from '../services/sessionStorage'
import { AuthProvider, useAuth } from './AuthContext'

jest.mock('../services/api', () => ({ setUnauthorizedHandler: jest.fn() }))
jest.mock('../services/authService', () => ({
  biometricLogin: jest.fn(),
  createBiometricCredential: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
  refresh: jest.fn(),
  register: jest.fn(),
  revokeBiometricCredential: jest.fn(),
}))
jest.mock('../services/sessionStorage', () => ({
  clearSession: jest.fn().mockResolvedValue(undefined),
  readSession: jest.fn().mockResolvedValue({ token: null, refreshToken: null, user: null }),
  saveSession: jest.fn().mockResolvedValue({ userId: 'user-id', email: 'user@example.com', role: 'USER' }),
}))
jest.mock('../services/localCredentialsService', () => ({
  clearBiometricLogin: jest.fn().mockResolvedValue(undefined),
  isBiometricLoginAvailable: jest.fn().mockResolvedValue(true),
  migrateLegacyBiometricLogin: jest.fn().mockResolvedValue(false),
  readBiometricCredential: jest.fn(),
  readBiometricMetadata: jest.fn().mockResolvedValue(null),
  saveBiometricCredential: jest.fn(),
}))

const protectedCredential = {
  credentialId: '00000000-0000-4000-8000-000000000001',
  credentialSecret: 's'.repeat(43),
  email: 'user@example.com',
}

function Probe() {
  const auth = useAuth()
  if (!auth.ready) return <Text>Carregando</Text>
  return <Button title="Usar biometria" onPress={() => auth.loginWithBiometrics('user@example.com').catch(() => undefined)} />
}

beforeEach(() => {
  jest.clearAllMocks()
  localCredentials.isBiometricLoginAvailable.mockResolvedValue(true)
  localCredentials.migrateLegacyBiometricLogin.mockResolvedValue(false)
  localCredentials.readBiometricCredential.mockResolvedValue(protectedCredential)
  sessionStorage.saveSession.mockResolvedValue({ userId: 'user-id', email: 'user@example.com', role: 'USER' })
})

describe('AuthContext biometric login', () => {
  it('creates a session without rewriting the protected credential', async () => {
    authService.biometricLogin.mockResolvedValue({
      success: true,
      data: { token: 'access', refreshToken: 'refresh', userId: 'user-id', email: 'user@example.com', role: 'USER' },
    })
    render(<AuthProvider><Probe /></AuthProvider>)

    fireEvent.press(await screen.findByRole('button', { name: 'Usar biometria' }))

    await waitFor(() => expect(authService.biometricLogin).toHaveBeenCalledWith(protectedCredential))
    expect(localCredentials.readBiometricCredential).toHaveBeenCalledTimes(1)
    expect(localCredentials.saveBiometricCredential).not.toHaveBeenCalled()
  })

  it('keeps the biometric credential after a temporary network failure', async () => {
    authService.biometricLogin.mockRejectedValue(new Error('Network Error'))
    render(<AuthProvider><Probe /></AuthProvider>)

    fireEvent.press(await screen.findByRole('button', { name: 'Usar biometria' }))

    await waitFor(() => expect(authService.biometricLogin).toHaveBeenCalled())
    expect(localCredentials.clearBiometricLogin).not.toHaveBeenCalled()
  })

  it('removes the local credential when the server rejects it', async () => {
    authService.biometricLogin.mockRejectedValue({ response: { status: 401 } })
    render(<AuthProvider><Probe /></AuthProvider>)

    fireEvent.press(await screen.findByRole('button', { name: 'Usar biometria' }))

    await waitFor(() => expect(localCredentials.clearBiometricLogin).toHaveBeenCalledTimes(1))
  })
})
