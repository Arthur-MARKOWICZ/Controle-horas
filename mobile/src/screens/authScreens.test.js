import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import * as localCredentialsService from '../services/localCredentialsService'
import LoginScreen from './LoginScreen'
import RegisterScreen from './RegisterScreen'

const mockLogin = jest.fn()
const mockRegister = jest.fn()
const mockAuth = { login: mockLogin, register: mockRegister, loginWithBiometrics: jest.fn(), enableBiometricLogin: jest.fn(), isBiometricLoginAvailable: jest.fn().mockResolvedValue(false) }
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: { text: '#111', muted: '#666', primary: '#06c', primaryText: '#fff', surface: '#fff', border: '#ccc', danger: '#c00', dangerBackground: '#fee', success: '#060', successBackground: '#efe', background: '#fff' } }) }))
jest.mock('../services/localCredentialsService', () => ({
  canUseBiometrics: jest.fn().mockResolvedValue(false),
  consumeBiometricMigrationNotice: jest.fn().mockResolvedValue(false),
  readBiometricMetadata: jest.fn().mockResolvedValue(null),
  readRememberedEmail: jest.fn().mockResolvedValue(''),
  saveRememberedEmail: jest.fn().mockResolvedValue(undefined),
}))

describe('mobile authentication forms', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth.isBiometricLoginAvailable.mockResolvedValue(false)
    localCredentialsService.readBiometricMetadata.mockResolvedValue(null)
    localCredentialsService.consumeBiometricMigrationNotice.mockResolvedValue(false)
  })

  test('shows clear errors and prevents an empty mobile login', async () => {
    render(<LoginScreen navigation={{ navigate: jest.fn() }} />)
    fireEvent.press(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('Informe o e-mail.')).toBeTruthy()
    expect(screen.getByText('Informe a senha.')).toBeTruthy()
    expect(mockLogin).not.toHaveBeenCalled()
  })

  test('submits valid mobile login data and localizes credential errors', async () => {
    mockLogin.mockRejectedValue({ response: { data: { message: 'Invalid email or password' } } })
    render(<LoginScreen navigation={{ navigate: jest.fn() }} />)
    fireEvent.changeText(screen.getByLabelText('E-mail'), 'ana@example.com')
    fireEvent.changeText(screen.getByLabelText('Senha'), 'Senha123')
    fireEvent.press(screen.getByRole('button', { name: 'Entrar' }))
    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith({ email: 'ana@example.com', password: 'Senha123' }))
    expect(screen.getByText('E-mail ou senha inválidos.')).toBeTruthy()
  })

  test('submits the saved email to biometrics without requiring the password', async () => {
    mockAuth.isBiometricLoginAvailable.mockResolvedValue(true)
    localCredentialsService.readBiometricMetadata.mockResolvedValue({
      credentialId: '00000000-0000-4000-8000-000000000001',
      email: 'ana@example.com',
    })
    render(<LoginScreen navigation={{ navigate: jest.fn() }} />)

    const biometricButton = await screen.findByRole('button', { name: 'Entrar com digital ou Face ID' })
    fireEvent.press(biometricButton)

    await waitFor(() => expect(mockAuth.loginWithBiometrics).toHaveBeenCalledWith('ana@example.com'))
    expect(mockLogin).not.toHaveBeenCalled()
  })

  test('blocks weak passwords and submits valid registration payloads', async () => {
    const view = render(<RegisterScreen />)
    fireEvent.changeText(screen.getByLabelText('Nome'), 'Ana')
    fireEvent.changeText(screen.getByLabelText('E-mail'), 'ana@example.com')
    fireEvent.changeText(screen.getByLabelText('Senha'), 'fraca')
    fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }))
    expect(await screen.findByText('Mínimo de 8 caracteres.')).toBeTruthy()
    expect(mockRegister).not.toHaveBeenCalled()
    fireEvent.changeText(screen.getByLabelText('Senha'), 'Senha123')
    fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }))
    await waitFor(() => expect(mockRegister).toHaveBeenCalledWith({ name: 'Ana', email: 'ana@example.com', password: 'Senha123' }))
    view.unmount()
  })
})
