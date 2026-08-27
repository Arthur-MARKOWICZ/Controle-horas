import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from './Login/LoginPage'
import RegisterPage from './Register/RegisterPage'
import ResetPasswordPage from './ResetPassword/ResetPasswordPage'

const mocks = vi.hoisted(() => ({
  login: vi.fn(), register: vi.fn(), requestPasswordReset: vi.fn(), resetPassword: vi.fn(),
}))

vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ login: mocks.login, register: mocks.register }) }))
vi.mock('../services/authService', () => ({ requestPasswordReset: mocks.requestPasswordReset, resetPassword: mocks.resetPassword }))

function page(ui: React.ReactNode, path = '/') {
  return render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>)
}

describe('authentication forms', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('blocks malformed login data with clear field messages', async () => {
    const user = userEvent.setup(); page(<LoginPage />)
    await user.type(screen.getByLabelText('E-mail'), 'nome')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('Informe um e-mail válido')).toBeInTheDocument()
    expect(screen.getByText('Senha é obrigatória')).toBeInTheDocument()
    expect(mocks.login).not.toHaveBeenCalled()
  })

  it('submits valid login data and translates the safe credential error', async () => {
    const user = userEvent.setup(); mocks.login.mockRejectedValue({ response: { data: { message: 'Invalid email or password' } } })
    page(<LoginPage />)
    await user.type(screen.getByLabelText('E-mail'), 'ana@example.com')
    await user.type(screen.getByLabelText('Senha'), 'Senha123')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))
    await waitFor(() => expect(mocks.login).toHaveBeenCalledWith({ email: 'ana@example.com', password: 'Senha123' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos.')
  })

  it('rejects a weak registration password before submitting', async () => {
    const user = userEvent.setup(); page(<RegisterPage />)
    await user.type(screen.getByLabelText('Nome'), 'Ana')
    await user.type(screen.getByLabelText('E-mail'), 'ana@example.com')
    await user.type(screen.getByLabelText('Senha'), 'fraca')
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }))
    expect(await screen.findByText('A senha deve ter no mínimo 8 caracteres')).toBeInTheDocument()
    expect(mocks.register).not.toHaveBeenCalled()
  })

  it('submits a valid registration payload', async () => {
    const user = userEvent.setup(); mocks.register.mockResolvedValue({})
    page(<RegisterPage />)
    await user.type(screen.getByLabelText('Nome'), "Ana'); DROP TABLE users; --")
    await user.type(screen.getByLabelText('E-mail'), 'ana@example.com')
    await user.type(screen.getByLabelText('Senha'), 'Senha123')
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }))
    await waitFor(() => expect(mocks.register).toHaveBeenCalledWith({ name: "Ana'); DROP TABLE users; --", email: 'ana@example.com', password: 'Senha123' }))
  })

  it('validates reset passwords and submits a matching strong password', async () => {
    const user = userEvent.setup(); mocks.resetPassword.mockResolvedValue({ message: 'Senha redefinida.' })
    page(<ResetPasswordPage />, '/reset-password?token=valid-token')
    await user.type(screen.getByLabelText('Nova senha'), 'Senha123')
    await user.type(screen.getByLabelText('Confirmar nova senha'), 'Outra123')
    await user.click(screen.getByRole('button', { name: 'Redefinir senha' }))
    expect(await screen.findByText('As senhas não coincidem.')).toBeInTheDocument()
    expect(mocks.resetPassword).not.toHaveBeenCalled()
    await user.clear(screen.getByLabelText('Confirmar nova senha'))
    await user.type(screen.getByLabelText('Confirmar nova senha'), 'Senha123')
    await user.click(screen.getByRole('button', { name: 'Redefinir senha' }))
    await waitFor(() => expect(mocks.resetPassword).toHaveBeenCalledWith('valid-token', 'Senha123'))
  })

  it('blocks an invalid password-reset email locally', async () => {
    const user = userEvent.setup(); page(<ResetPasswordPage />)
    await user.type(screen.getByLabelText('E-mail'), 'nome')
    await user.click(screen.getByRole('button', { name: 'Enviar link' }))
    expect(await screen.findByText('Informe um e-mail válido.')).toBeInTheDocument()
    expect(mocks.requestPasswordReset).not.toHaveBeenCalled()
  })
})
