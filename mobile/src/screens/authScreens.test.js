import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import LoginScreen from './LoginScreen'
import RegisterScreen from './RegisterScreen'

const mockLogin = jest.fn()
const mockRegister = jest.fn()
const mockAuth = { login: mockLogin, register: mockRegister, loginWithBiometrics: jest.fn(), enableBiometricLogin: jest.fn(), isBiometricLoginAvailable: jest.fn().mockResolvedValue(false) }

jest.mock('../contexts/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: { text: '#111', muted: '#666', primary: '#06c', primaryText: '#fff', surface: '#fff', border: '#ccc', danger: '#c00', dangerBackground: '#fee', success: '#060', successBackground: '#efe', background: '#fff' } }) }))
jest.mock('../services/localCredentialsService', () => ({ canUseBiometrics: jest.fn().mockResolvedValue(false), readRememberedEmail: jest.fn().mockResolvedValue(''), saveRememberedEmail: jest.fn().mockResolvedValue(undefined) }))

describe('mobile authentication forms', () => {
  beforeEach(() => { jest.clearAllMocks(); mockAuth.isBiometricLoginAvailable.mockResolvedValue(false) })

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
