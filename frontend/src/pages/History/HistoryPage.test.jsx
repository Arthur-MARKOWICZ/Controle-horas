import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
      <HistoryPage />
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
        days: [
          {
            date: '2026-07-14',
            firstEntryAt: '2026-07-14T11:30:00Z',
            lastExitAt: '2026-07-14T20:20:00Z',
            workedMinutes: 530,
            balanceMinutes: 0,
            isComplete: true,
            workLogs: [],
          },
        ],
      },
      startDate: monthRange.startDate,
      endDate: monthRange.endDate,
      isLoading: false,
      error: '',
      loadHistory,
    })

    renderHistory()

    expect(screen.getByLabelText('Data inicial')).toHaveValue(monthRange.startDate)
    expect(screen.getByLabelText('Data final')).toHaveValue(monthRange.endDate)
    expect(screen.getByText('14/07/2026')).toBeInTheDocument()
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
        days: [],
      },
      startDate: monthRange.startDate,
      endDate: monthRange.endDate,
      isLoading: false,
      error: '',
      loadHistory,
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

  it('shows loading and error states', () => {
    useHistoryMock.mockReturnValue({
      history: null,
      startDate: monthRange.startDate,
      endDate: monthRange.endDate,
      isLoading: true,
      error: '',
      loadHistory: vi.fn(),
    })

    const { rerender } = renderHistory()
    expect(screen.getByText('Carregando histórico...')).toBeInTheDocument()

    useHistoryMock.mockReturnValue({
      history: null,
      startDate: monthRange.startDate,
      endDate: monthRange.endDate,
      isLoading: false,
      error: 'Falha ao carregar histórico',
      loadHistory: vi.fn(),
    })

    rerender(
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Falha ao carregar histórico')
  })
})
