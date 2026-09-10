import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HolidayRulesPage from './HolidayRulesPage'

const listMock = vi.fn()
const deleteMock = vi.fn()

vi.mock('../../layouts/MainLayout', () => ({ default: ({ children }: { children: ReactNode }) => children }))
vi.mock('../../services/holidayService', () => ({
  listHolidayRules: (...args: unknown[]) => listMock(...args),
  deleteHolidayRule: (...args: unknown[]) => deleteMock(...args),
}))

const organizationRule = {
  id: 'rule-1', holidayId: 'holiday-1', holidayDate: '2026-09-07', holidayName: 'Independência do Brasil',
  userId: null, userName: null, dayOff: false, observedDate: null, bridgeDate: null, notes: 'Expediente normal',
  createdByName: 'Arthur', createdAt: '2026-09-01T12:00:00Z', updatedAt: '2026-09-02T15:30:00Z',
}
const userRule = {
  ...organizationRule, id: 'rule-2', userId: 'user-1', userName: 'Bia', dayOff: true, notes: null,
}

describe('HolidayRulesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listMock.mockResolvedValue({ success: true, data: [organizationRule, userRule] })
    deleteMock.mockResolvedValue({ success: true, data: null })
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
  })

  const renderPage = () => render(<MemoryRouter><HolidayRulesPage /></MemoryRouter>)

  it('shows who approved each rule and when', async () => {
    renderPage()
    const row = (await screen.findByText('Expediente normal')).closest('tr')!
    expect(within(row).getByText('Arthur')).toBeInTheDocument()
    expect(within(row).getByText('02/09/2026, 12:30')).toBeInTheDocument()
    expect(within(row).getByText('Toda a empresa')).toBeInTheDocument()
  })

  it('distinguishes a rule that targets one user', async () => {
    renderPage()
    await screen.findByText('Expediente normal')
    const row = screen.getByText('Bia').closest('tr')!
    expect(within(row).getByText('Sim')).toBeInTheDocument()
  })

  it('warns that the stored hour bank needs a manual recalculation', async () => {
    renderPage()
    expect(await screen.findByRole('note')).toHaveTextContent('não é recalculado automaticamente')
  })

  it('removes a rule after confirmation and reloads', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Expediente normal')

    await user.click(screen.getAllByRole('button', { name: 'Remover' })[0]!)
    expect(deleteMock).toHaveBeenCalledWith('rule-1')
    expect(await screen.findByRole('status')).toHaveTextContent('Regra removida')
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2))
  })

  it('keeps the rule when the confirmation is declined', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false))
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Expediente normal')
    await user.click(screen.getAllByRole('button', { name: 'Remover' })[0]!)
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('reports a loading failure', async () => {
    listMock.mockResolvedValue({ success: false, message: 'Sem permissão', data: null })
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem permissão')
    expect(screen.getByText('Nenhuma regra cadastrada.')).toBeInTheDocument()
  })
  it('shows the date adjustments of a rule', async () => {
    listMock.mockResolvedValue({
      success: true,
      data: [{ ...organizationRule, dayOff: true, observedDate: '2026-09-08', bridgeDate: '2026-09-09' }],
    })
    renderPage()
    expect(await screen.findByText('Folga em 08/09/2026')).toBeInTheDocument()
    expect(screen.getByText('Emenda em 09/09/2026')).toBeInTheDocument()
  })

  it('shows a dash when the rule does not adjust any date', async () => {
    renderPage()
    const row = (await screen.findByText('Expediente normal')).closest('tr')!
    expect(within(row).getAllByText('—').length).toBeGreaterThan(0)
  })
})
