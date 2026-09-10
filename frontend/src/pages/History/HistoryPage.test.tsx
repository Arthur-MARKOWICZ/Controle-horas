import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../../contexts/ThemeContext'
import HistoryPage from './HistoryPage'
import { getCurrentMonthRange } from '../../utils/formatTime'

const useAuthMock = vi.fn()
const useHistoryMock = vi.fn()

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock('../../hooks/useHistory', () => ({
  useHistory: () => useHistoryMock(),
}))

function renderHistory() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <HistoryPage />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

describe('HistoryPage', () => {
  const monthRange = getCurrentMonthRange(new Date('2026-07-14T12:00:00'))

  beforeEach(() => {
    useAuthMock.mockReturnValue({
      user: { name: 'Arthur' },
      logout: vi.fn(),
    })
  })

  it('loads the current month by default', () => {
    const loadHistory = vi.fn()
    useHistoryMock.mockReturnValue({
      history: {
        startDate: monthRange.startDate,
        endDate: monthRange.endDate,
        totalWorkedMinutes: 530,
        totalBalanceMinutes: 0,
        hourBankMinutes: 0,
        workedDayTotals: { total: 1, inSchedule: 1, outsideSchedule: 0 },
        days: [
          {
            date: '2026-07-14',
            firstEntryAt: '2026-07-14T11:30:00Z',
            lastExitAt: '2026-07-14T20:20:00Z',
            workedMinutes: 530,
            pausedMinutes: 0,
            balanceMinutes: 0,
            isComplete: true,
            workLogs: [],
          },
        ],
      },
      startDate: monthRange.startDate,
      endDate: monthRange.endDate,
      isLoading: false,
      isExporting: false,
      error: '',
      exportError: '',
      loadHistory,
      exportHistory: vi.fn(),
    })

    renderHistory()

    expect(screen.getByLabelText('Data inicial')).toHaveValue(monthRange.startDate)
    expect(screen.getByLabelText('Data final')).toHaveValue(monthRange.endDate)
    expect(screen.getByText('14/07/2026')).toBeInTheDocument()
    expect(screen.getByText('1 na jornada · 0 fora da jornada')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exportar Excel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exportar PDF' })).toBeInTheDocument()
  })

  it('reloads the table when filtering by period', async () => {
    const user = userEvent.setup()
    const loadHistory = vi.fn()
    useHistoryMock.mockReturnValue({
      history: {
        startDate: monthRange.startDate,
        endDate: monthRange.endDate,
        totalWorkedMinutes: 0,
        totalBalanceMinutes: 0,
        hourBankMinutes: 0,
        workedDayTotals: { total: 0, inSchedule: 0, outsideSchedule: 0 },
        days: [],
      },
      startDate: monthRange.startDate,
      endDate: monthRange.endDate,
      isLoading: false,
      isExporting: false,
      error: '',
      exportError: '',
      loadHistory,
      exportHistory: vi.fn(),
    })

    renderHistory()

    await user.clear(screen.getByLabelText('Data inicial'))
    await user.type(screen.getByLabelText('Data inicial'), '2026-06-01')
    await user.clear(screen.getByLabelText('Data final'))
    await user.type(screen.getByLabelText('Data final'), '2026-06-30')
    await user.click(screen.getByRole('button', { name: 'Filtrar' }))

    await waitFor(() => {
      expect(loadHistory).toHaveBeenCalledWith('2026-06-01', '2026-06-30')
    })
  })

  it('accepts a period longer than 90 days', async () => {
    const user = userEvent.setup()
    const loadHistory = vi.fn()
    useHistoryMock.mockReturnValue({
      history: null, startDate: monthRange.startDate, endDate: monthRange.endDate,
      isLoading: false, isExporting: false, error: '', exportError: '', loadHistory, exportHistory: vi.fn(),
    })
    renderHistory()

    await user.clear(screen.getByLabelText('Data inicial'))
    await user.type(screen.getByLabelText('Data inicial'), '2026-01-01')
    await user.clear(screen.getByLabelText('Data final'))
    await user.type(screen.getByLabelText('Data final'), '2026-05-01')
    await user.click(screen.getByRole('button', { name: 'Filtrar' }))

    await waitFor(() => {
      expect(loadHistory).toHaveBeenCalledWith('2026-01-01', '2026-05-01')
    })
  })

  it('blocks an inverted or malformed period with a clear Portuguese error', async () => {
    const user = userEvent.setup()
    const loadHistory = vi.fn()
    useHistoryMock.mockReturnValue({
      history: null, startDate: monthRange.startDate, endDate: monthRange.endDate,
      isLoading: false, isExporting: false, error: '', exportError: '', loadHistory, exportHistory: vi.fn(),
    })
    renderHistory()
    await user.clear(screen.getByLabelText('Data inicial'))
    await user.type(screen.getByLabelText('Data inicial'), '2026-08-10')
    await user.clear(screen.getByLabelText('Data final'))
    await user.type(screen.getByLabelText('Data final'), '2026-08-01')
    await user.click(screen.getByRole('button', { name: 'Filtrar' }))
    expect(await screen.findByText('A data inicial deve ser menor ou igual à data final.')).toBeInTheDocument()
    expect(loadHistory).not.toHaveBeenCalled()
  })

  it('loads the selected history page', async () => {
    const user = userEvent.setup()
    const loadHistory = vi.fn()
    useHistoryMock.mockReturnValue({
      history: {
        startDate: monthRange.startDate,
        endDate: monthRange.endDate,
        totalWorkedMinutes: 0,
        totalBalanceMinutes: 0,
        hourBankMinutes: 0,
        workedDayTotals: { total: 0, inSchedule: 0, outsideSchedule: 0 },
        days: [],
        pagination: { limit: 10, offset: 0, total: 20 },
      },
      startDate: monthRange.startDate,
      endDate: monthRange.endDate,
      isLoading: false,
      isExporting: false,
      error: '',
      exportError: '',
      loadHistory,
      exportHistory: vi.fn(),
    })

    renderHistory()

    await user.click(screen.getByRole('button', { name: 'Próxima' }))

    expect(loadHistory).toHaveBeenCalledWith(monthRange.startDate, monthRange.endDate, 10)
  })

  it('shows loading and error states', () => {
    useHistoryMock.mockReturnValue({
      history: null,
      startDate: monthRange.startDate,
      endDate: monthRange.endDate,
      isLoading: true,
      isExporting: false,
      error: '',
      exportError: '',
      loadHistory: vi.fn(),
      exportHistory: vi.fn(),
    })

    const { rerender } = renderHistory()
    expect(screen.getByText('Carregando histórico...')).toBeInTheDocument()

    useHistoryMock.mockReturnValue({
      history: null,
      startDate: monthRange.startDate,
      endDate: monthRange.endDate,
      isLoading: false,
      isExporting: false,
      error: 'Falha ao carregar histórico',
      exportError: '',
      loadHistory: vi.fn(),
      exportHistory: vi.fn(),
    })

    rerender(
      <MemoryRouter>
        <ThemeProvider>
          <HistoryPage />
        </ThemeProvider>
      </MemoryRouter>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Falha ao carregar histórico')
  })
  function historyWithDay(day: Record<string, unknown>) {
    useHistoryMock.mockReturnValue({
      history: {
        startDate: monthRange.startDate, endDate: monthRange.endDate,
        totalWorkedMinutes: 0, totalBalanceMinutes: 0, hourBankMinutes: 0,
        workedDayTotals: { total: 0, inSchedule: 0, outsideSchedule: 0 },
        days: [{
          date: '2026-07-14', firstEntryAt: null, lastExitAt: null, workedMinutes: 0,
          pausedMinutes: 0, balanceMinutes: 0, isComplete: true, workLogs: [],
          holiday: null, workedOnHoliday: false, ...day,
        }],
      },
      startDate: monthRange.startDate, endDate: monthRange.endDate,
      isLoading: false, isExporting: false, error: '', exportError: '',
      loadHistory: vi.fn(), exportHistory: vi.fn(),
    })
  }

  const holiday = {
    holidayId: 'holiday-1', date: '2026-07-14', name: 'Feriado de teste',
    scope: 'NATIONAL' as const, source: 'NAGER' as const, subdivisionCode: null, dayOff: true,
  }

  it('marks a day off caused by a holiday', () => {
    historyWithDay({ holiday })
    renderHistory()
    expect(screen.getByText('Feriado')).toBeInTheDocument()
    expect(screen.getByTitle('Feriado de teste')).toBeInTheDocument()
    expect(screen.queryByText('Trabalhou no feriado')).not.toBeInTheDocument()
  })

  it('distinguishes a holiday that is still a working day', () => {
    historyWithDay({ holiday: { ...holiday, dayOff: false } })
    renderHistory()
    expect(screen.getByText('Feriado trabalhado normalmente')).toBeInTheDocument()
  })

  it('flags a day worked on a holiday', () => {
    historyWithDay({ holiday, workedMinutes: 240, balanceMinutes: 240, workedOnHoliday: true })
    renderHistory()
    expect(screen.getByText('Trabalhou no feriado')).toBeInTheDocument()
  })

  it('shows no holiday marks on an ordinary day', () => {
    historyWithDay({})
    renderHistory()
    expect(screen.queryByText('Feriado')).not.toBeInTheDocument()
    expect(screen.queryByText('Trabalhou no feriado')).not.toBeInTheDocument()
  })
  it('labels a day off that was moved from another date', () => {
    historyWithDay({ holiday: { ...holiday, kind: 'OBSERVED', holidayDate: '2026-07-13' } })
    renderHistory()
    expect(screen.getByText('Folga transferida')).toBeInTheDocument()
  })

  it('labels a bridged day', () => {
    historyWithDay({ holiday: { ...holiday, kind: 'BRIDGE', holidayDate: '2026-07-13' } })
    renderHistory()
    expect(screen.getByText('Emenda')).toBeInTheDocument()
  })
})
