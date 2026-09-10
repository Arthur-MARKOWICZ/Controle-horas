import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../../contexts/ThemeContext'
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
      <ThemeProvider>
        <DashboardPage />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

const dashboardActions = {
  isLoading: false,
  isSubmitting: false,
  error: '',
  message: '',
  registerEntry: vi.fn(),
  registerPause: vi.fn(),
  registerLunch: vi.fn(),
  registerResume: vi.fn(),
  registerExit: vi.fn(),
  saveDailyWorkload: vi.fn(),
}

describe('DashboardPage', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      user: { name: 'Arthur' },
      logout: vi.fn(),
      canManageUsers: false,
    })
  })

  it('shows expected exit when there is an entry', async () => {
    useDashboardMock.mockReturnValue({
      ...dashboardActions,
      dashboard: {
        date: '2026-07-14',
        dailyWorkloadMinutes: 530,
        standardEntryTime: '08:30:00',
        standardExitTime: '17:20:00',
        lunchEnabled: true,
        lunchDurationMinutes: 60,
        workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
        nextAction: 'PAUSE_OR_EXIT',
        expectedExitAt: '2026-07-14T20:20:00Z',
        workedMinutesToday: 120,
        pausedMinutesToday: 0,
        balanceMinutesToday: -410,
        hourBankMinutes: 0,
        workLogs: [{ id: '1', entryAt: '2026-07-14T11:30:00Z', exitAt: null, closeReason: null }],
        scheduleConfigured: true,
      },
    })

    renderDashboard()

    expect(screen.getByText('Saída prevista')).toBeInTheDocument()
    expect(screen.getByText('17:20')).toBeInTheDocument()
    expect(screen.getByText('2h00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Almoço' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar saída' })).toBeInTheDocument()
  })

  it('shows zero and empty values when there are no records', async () => {
    useDashboardMock.mockReturnValue({
      ...dashboardActions,
      dashboard: {
        date: '2026-07-14',
        dailyWorkloadMinutes: 530,
        standardEntryTime: '08:30:00',
        standardExitTime: '17:20:00',
        lunchEnabled: false,
        lunchDurationMinutes: 60,
        workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
        nextAction: 'ENTRY',
        expectedExitAt: null,
        workedMinutesToday: 0,
        pausedMinutesToday: 0,
        balanceMinutesToday: -530,
        hourBankMinutes: 0,
        workLogs: [],
        scheduleConfigured: true,
      },
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
      ...dashboardActions,
      dashboard: null,
      isLoading: true,
    })

    renderDashboard()

    expect(screen.getByText('Carregando Dashboard...')).toBeInTheDocument()
  })
  function dashboardWith(extra: Record<string, unknown>) {
    useDashboardMock.mockReturnValue({
      ...dashboardActions,
      dashboard: {
        date: '2026-07-14', dailyWorkloadMinutes: 530,
        standardEntryTime: '08:30:00', standardExitTime: '17:20:00',
        lunchEnabled: true, lunchDurationMinutes: 60,
        workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
        nextAction: 'ENTRY', expectedExitAt: null,
        workedMinutesToday: 0, pausedMinutesToday: 0, balanceMinutesToday: 0, hourBankMinutes: 0,
        workLogs: [], scheduleConfigured: true,
        holiday: null, workedOnHoliday: false, ...extra,
      },
    })
  }

  const holiday = {
    holidayId: 'holiday-1', date: '2026-07-14', name: 'Feriado de teste',
    scope: 'NATIONAL' as const, source: 'NAGER' as const, subdivisionCode: null, dayOff: true,
  }

  it('explains that a holiday removes the workload of the day', () => {
    dashboardWith({ holiday })
    renderDashboard()
    expect(screen.getByText('Feriado de teste')).toBeInTheDocument()
    expect(screen.getByText('— feriado: hoje não há carga de trabalho prevista.')).toBeInTheDocument()
  })

  it('explains that a holiday can still be a working day', () => {
    dashboardWith({ holiday: { ...holiday, dayOff: false }, balanceMinutesToday: -530 })
    renderDashboard()
    expect(screen.getByText('— feriado, mas a carga de trabalho de hoje continua valendo.')).toBeInTheDocument()
  })

  it('says nothing about holidays on an ordinary day', () => {
    dashboardWith({})
    renderDashboard()
    expect(screen.queryByText('Feriado de teste')).not.toBeInTheDocument()
  })
})
