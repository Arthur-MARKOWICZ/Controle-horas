import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OutsideScheduleWorkDaysPage from './OutsideScheduleWorkDaysPage'

const useAuthMock = vi.fn()
const useUsersMock = vi.fn()
const getDaysMock = vi.fn()
const updateMock = vi.fn()
const deleteMock = vi.fn()

vi.mock('../../layouts/MainLayout', () => ({ default: ({ children }: { children: ReactNode }) => children }))
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => useAuthMock() }))
vi.mock('../../hooks/useUsers', () => ({ useUsers: () => useUsersMock() }))
vi.mock('../../services/historyService', () => ({
  getUserOutsideScheduleWorkDays: (...args: unknown[]) => getDaysMock(...args),
  updateUserWorkLog: (...args: unknown[]) => updateMock(...args),
  deleteUserWorkLog: (...args: unknown[]) => deleteMock(...args),
}))

describe('OutsideScheduleWorkDaysPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthMock.mockReturnValue({ isAdmin: true })
    useUsersMock.mockReturnValue({ users: [{ id: 'user-1', name: 'Ana', email: 'ana@example.com' }], isLoading: false, error: '' })
    getDaysMock.mockResolvedValue({ success: true, data: {
      days: [{ date: '2026-08-15', workedMinutes: 540, workLogs: [{ id: 'log-1', entryAt: '2026-08-15T11:00:00.000Z', exitAt: '2026-08-15T20:00:00.000Z', closeReason: 'EXIT' }] }],
      pagination: { limit: 10, offset: 0, total: 1 },
    } })
    updateMock.mockResolvedValue({ success: true, data: null })
    deleteMock.mockResolvedValue({ success: true, data: null })
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
  })

  const renderPage = () => render(<MemoryRouter><OutsideScheduleWorkDaysPage /></MemoryRouter>)

  it('shows outside-schedule days and allows an administrator to edit a work log', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('15/08/2026 · 9h00')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    await user.clear(screen.getByLabelText('Entrada'))
    await user.type(screen.getByLabelText('Entrada'), '2026-08-15T08:10')
    await user.click(screen.getByRole('button', { name: 'Salvar alteração' }))

    await waitFor(() => expect(updateMock).toHaveBeenCalledWith('user-1', 'log-1', {
      entryAt: '2026-08-15T11:10:00.000Z', exitAt: '2026-08-15T20:00:00.000Z',
    }))
  })

  it('shows the list to a manager without administrative editing controls', async () => {
    useAuthMock.mockReturnValue({ isAdmin: false })
    renderPage()

    expect(await screen.findByText('15/08/2026 · 9h00')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument()
  })
})
