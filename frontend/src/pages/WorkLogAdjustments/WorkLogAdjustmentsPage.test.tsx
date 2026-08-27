import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkLogAdjustmentsPage from './WorkLogAdjustmentsPage'
import { getCurrentMonthRange } from '../../utils/formatTime'

const useUsersMock = vi.fn()
const getUserHistoryMock = vi.fn()
const deleteUserWorkLogMock = vi.fn()
const recalculateUserHourBankMock = vi.fn()
const recalculateUserWorkedDaysMock = vi.fn()
const useAuthMock = vi.fn()

vi.mock('../../layouts/MainLayout', () => ({ default: ({ children }: { children: ReactNode }) => children }))
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => useAuthMock() }))
vi.mock('../../hooks/useUsers', () => ({ useUsers: () => useUsersMock() }))
vi.mock('../../services/historyService', () => ({
  getUserHistory: (...args: unknown[]) => getUserHistoryMock(...args),
  createUserWorkLog: vi.fn(),
  updateUserWorkLog: vi.fn(),
  deleteUserWorkLog: (...args: unknown[]) => deleteUserWorkLogMock(...args),
  recalculateUserHourBank: (...args: unknown[]) => recalculateUserHourBankMock(...args),
  recalculateUserWorkedDays: (...args: unknown[]) => recalculateUserWorkedDaysMock(...args),
}))

describe('WorkLogAdjustmentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthMock.mockReturnValue({ isAdmin: true })
    useUsersMock.mockReturnValue({
      users: [{ id: 'user-1', name: 'Ana', email: 'ana@example.com' }], isLoading: false, error: '',
    })
    getUserHistoryMock.mockResolvedValue({
      success: true,
      data: {
        startDate: '2026-08-01', endDate: '2026-08-31', totalWorkedMinutes: 480, totalBalanceMinutes: 0, hourBankMinutes: 0,
        workedDayTotals: { total: 1, inSchedule: 1, outsideSchedule: 0 },
        days: [{ date: '2026-08-10', workLogs: [{ id: 'log-1', entryAt: '2026-08-10T11:00:00.000Z', exitAt: '2026-08-10T20:00:00.000Z', closeReason: 'EXIT' }] }],
        pagination: { limit: 10, offset: 0, total: 11 },
      },
    })
    deleteUserWorkLogMock.mockResolvedValue({ success: true, message: 'Work log deleted successfully', data: null })
    recalculateUserHourBankMock.mockResolvedValue({ success: true, message: 'Hour bank recalculated successfully', data: { previousHourBankMinutes: 30, hourBankMinutes: 60 } })
    recalculateUserWorkedDaysMock.mockResolvedValue({ success: true, message: 'Worked day totals recalculated successfully', data: { total: 7, inSchedule: 6, outsideSchedule: 1 } })
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
  })

  it('recalculates and refreshes the selected user hour bank', async () => {
    const user = userEvent.setup()
    render(<WorkLogAdjustmentsPage />)

    await user.click(await screen.findByRole('button', { name: 'Recalcular banco de horas' }))

    await waitFor(() => expect(recalculateUserHourBankMock).toHaveBeenCalledWith('user-1'))
    expect(await screen.findByText('Banco de horas recalculado e atualizado: +1h00.')).toBeInTheDocument()
    expect(getUserHistoryMock).toHaveBeenCalledTimes(2)
  })

  it('recalculates and refreshes the selected worked day totals', async () => {
    const user = userEvent.setup()
    render(<WorkLogAdjustmentsPage />)

    await user.click(await screen.findByRole('button', { name: 'Recalcular totais de dias' }))

    await waitFor(() => expect(recalculateUserWorkedDaysMock).toHaveBeenCalledWith('user-1'))
    expect(await screen.findByText('Totais de dias atualizados: 7 (6 na jornada e 1 fora da jornada).')).toBeInTheDocument()
  })

  it('lets managers recalculate but does not show administrative work-log actions', async () => {
    useAuthMock.mockReturnValue({ isAdmin: false })
    render(<WorkLogAdjustmentsPage />)

    expect(await screen.findByRole('button', { name: 'Recalcular banco de horas' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Criar registro' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument()
  })

  it('confirms and deletes a closed work log', async () => {
    const user = userEvent.setup()
    render(<WorkLogAdjustmentsPage />)

    const deleteButton = await screen.findByRole('button', { name: 'Excluir' })
    await user.click(deleteButton)

    expect(window.confirm).toHaveBeenCalledWith('Deseja excluir este registro de ponto? Esta ação não pode ser desfeita.')
    await waitFor(() => expect(deleteUserWorkLogMock).toHaveBeenCalledWith('user-1', 'log-1'))
    expect(await screen.findByText('Registro excluído e banco de horas recalculado.')).toBeInTheDocument()
    expect(getUserHistoryMock).toHaveBeenCalledTimes(2)
  })

  it('loads the selected adjustment page', async () => {
    const user = userEvent.setup()
    const range = getCurrentMonthRange()
    render(<WorkLogAdjustmentsPage />)

    await user.click(await screen.findByRole('button', { name: 'Próxima' }))

    await waitFor(() => {
      expect(getUserHistoryMock).toHaveBeenLastCalledWith('user-1', range.startDate, range.endDate, 10, 10)
    })
  })

  it('loads imported records from the selected period', async () => {
    const user = userEvent.setup()
    render(<WorkLogAdjustmentsPage />)

    await user.clear(await screen.findByLabelText('Data inicial'))
    await user.type(screen.getByLabelText('Data inicial'), '2026-07-01')
    await user.clear(screen.getByLabelText('Data final'))
    await user.type(screen.getByLabelText('Data final'), '2026-07-31')
    await user.click(screen.getByRole('button', { name: 'Filtrar registros' }))

    await waitFor(() => {
      expect(getUserHistoryMock).toHaveBeenLastCalledWith('user-1', '2026-07-01', '2026-07-31', 10, 0)
    })
  })
})
