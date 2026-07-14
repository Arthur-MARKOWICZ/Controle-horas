import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DashboardPage from './DashboardPage'

const useAuthMock = vi.fn()
const useDashboardMock = vi.fn()

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock('../../hooks/useDashboard', () => ({
  useDashboard: () => useDashboardMock(),
}))

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )
}

describe('DashboardPage', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      user: { name: 'Arthur' },
      logout: vi.fn(),
    })
  })

  it('shows expected exit when there is an entry', async () => {
    useDashboardMock.mockReturnValue({
      dashboard: {
        date: '2026-07-14',
        dailyWorkloadMinutes: 530,
        standardEntryTime: '08:30:00',
        standardExitTime: '17:20:00',
        nextAction: 'EXIT',
        expectedExitAt: '2026-07-14T20:20:00Z',
        workedMinutesToday: 120,
        balanceMinutesToday: -410,
        hourBankMinutes: 0,
        workLogs: [{ id: '1', entryAt: '2026-07-14T11:30:00Z', exitAt: null }],
      },
      isLoading: false,
      isSubmitting: false,
      error: '',
      message: '',
      register: vi.fn(),
      saveDailyWorkload: vi.fn(),
    })

    renderDashboard()

    expect(screen.getByText('Saída prevista')).toBeInTheDocument()
    expect(screen.getByText('17:20')).toBeInTheDocument()
    expect(screen.getByText('2h00')).toBeInTheDocument()
  })

  it('shows zero and empty values when there are no records', async () => {
    useDashboardMock.mockReturnValue({
      dashboard: {
        date: '2026-07-14',
        dailyWorkloadMinutes: 530,
        standardEntryTime: '08:30:00',
        standardExitTime: '17:20:00',
        nextAction: 'ENTRY',
        expectedExitAt: null,
        workedMinutesToday: 0,
        balanceMinutesToday: -530,
        hourBankMinutes: 0,
        workLogs: [],
      },
      isLoading: false,
      isSubmitting: false,
      error: '',
      message: '',
      register: vi.fn(),
      saveDailyWorkload: vi.fn(),
    })

    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('Saída prevista').closest('article')).toHaveTextContent('—')
    })
    expect(screen.getByText('Horas hoje').closest('article')).toHaveTextContent('0h00')
    expect(screen.getByText('Saldo do dia').closest('article')).toHaveTextContent('-8h50')
    expect(screen.getByText('Banco de horas').closest('article')).toHaveTextContent('0h00')
    expect(screen.getByText('Nenhum horário registrado hoje.')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    useDashboardMock.mockReturnValue({
      dashboard: null,
      isLoading: true,
      isSubmitting: false,
      error: '',
      message: '',
      register: vi.fn(),
      saveDailyWorkload: vi.fn(),
    })

    renderDashboard()

    expect(screen.getByText('Carregando Dashboard...')).toBeInTheDocument()
  })
})
