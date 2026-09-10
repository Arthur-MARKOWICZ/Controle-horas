import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HolidaysPage from './HolidaysPage'

const useAuthMock = vi.fn()
const useUsersMock = vi.fn()
const getHolidaysMock = vi.fn()
const syncHolidaysMock = vi.fn()
const saveHolidayRuleMock = vi.fn()
const createHolidayMock = vi.fn()
const deleteHolidayMock = vi.fn()

vi.mock('../../layouts/MainLayout', () => ({ default: ({ children }: { children: ReactNode }) => children }))
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => useAuthMock() }))
vi.mock('../../hooks/useUsers', () => ({ useUsers: () => useUsersMock() }))
vi.mock('../../services/holidayService', () => ({
  getHolidays: (...args: unknown[]) => getHolidaysMock(...args),
  syncHolidays: (...args: unknown[]) => syncHolidaysMock(...args),
  saveHolidayRule: (...args: unknown[]) => saveHolidayRuleMock(...args),
  createHoliday: (...args: unknown[]) => createHolidayMock(...args),
  deleteHoliday: (...args: unknown[]) => deleteHolidayMock(...args),
}))

const rootAdmin = { id: 'admin-1', name: 'Root', email: 'root@example.com', role: 'ADMIN', createdById: null }
const employee = { id: 'user-1', name: 'Bia', email: 'bia@example.com', role: 'USER', createdById: 'admin-1' }

const nationalHoliday = {
  holidayId: 'holiday-1', date: '2026-09-07', holidayDate: '2026-09-07', name: 'Independência do Brasil',
  scope: 'NATIONAL' as const, source: 'NAGER' as const, subdivisionCode: null, dayOff: true,
  kind: 'HOLIDAY' as const, ruleId: null, ruleObservedDate: null, ruleBridgeDate: null,
}
const stateHoliday = {
  holidayId: 'holiday-2', date: '2026-09-20', holidayDate: '2026-09-20', name: 'Revolução Farroupilha',
  scope: 'SUBDIVISION' as const, source: 'NAGER' as const, subdivisionCode: 'BR-RS', dayOff: false,
  kind: 'HOLIDAY' as const, ruleId: null, ruleObservedDate: null, ruleBridgeDate: null,
}

describe('HolidaysPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Pinned so the page always opens on the same month, whatever the day the suite runs.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-09-10T12:00:00Z'))
    useAuthMock.mockReturnValue({ isAdmin: true, canManageUsers: true, user: { userId: 'admin-1' } })
    useUsersMock.mockReturnValue({ users: [rootAdmin, employee], isLoading: false, error: '' })
    saveHolidayRuleMock.mockResolvedValue({ success: true, data: [{ id: 'rule-1' }] })
    createHolidayMock.mockResolvedValue({ success: true, data: nationalHoliday })
    deleteHolidayMock.mockResolvedValue({ success: true, data: null })
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    getHolidaysMock.mockResolvedValue({
      success: true, data: { startDate: '2026-09-01', endDate: '2026-09-30', days: [nationalHoliday, stateHoliday] },
    })
    syncHolidaysMock.mockResolvedValue({
      success: true, data: { year: 2026, countryCode: 'BR', holidayCount: 12, syncedAt: '2026-09-10T12:00:00.000Z' },
    })
  })
  afterEach(() => { vi.useRealTimers() })

  const renderPage = () => render(<MemoryRouter><HolidaysPage /></MemoryRouter>)

  it('loads the current month and lists its holidays', async () => {
    renderPage()
    await waitFor(() => expect(getHolidaysMock).toHaveBeenCalledWith('2026-09-01', '2026-09-30'))
    expect(await screen.findByText('setembro de 2026')).toBeInTheDocument()
    expect(screen.getAllByText('Independência do Brasil').length).toBeGreaterThan(0)
    expect(screen.getByText('BR-RS', { exact: false })).toBeInTheDocument()
  })

  it('separates days off from holidays that are still working days', async () => {
    renderPage()
    const daysOffSection = (await screen.findByRole('heading', { name: 'Dias de folga' })).closest('section')!
    expect(within(daysOffSection).getByText('Independência do Brasil')).toBeInTheDocument()
    expect(within(daysOffSection).queryByText('Revolução Farroupilha')).not.toBeInTheDocument()
  })

  it('navigates between months', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('setembro de 2026')

    await user.click(screen.getByRole('button', { name: 'Próximo mês' }))
    await waitFor(() => expect(getHolidaysMock).toHaveBeenCalledWith('2026-10-01', '2026-10-31'))

    await user.click(screen.getByRole('button', { name: 'Mês anterior' }))
    await user.click(screen.getByRole('button', { name: 'Mês anterior' }))
    await waitFor(() => expect(getHolidaysMock).toHaveBeenCalledWith('2026-08-01', '2026-08-31'))
  })

  it('accumulates rapid month navigation instead of collapsing it into one step', async () => {
    renderPage()
    await screen.findByText('setembro de 2026')

    // Clicks dispatched before React re-renders: they must not all read the same month.
    const previous = screen.getByRole('button', { name: 'Mês anterior' })
    await act(async () => {
      previous.click()
      previous.click()
      previous.click()
    })
    expect(await screen.findByText('junho de 2026')).toBeInTheDocument()
    await waitFor(() => expect(getHolidaysMock).toHaveBeenCalledWith('2026-06-01', '2026-06-30'))
  })

  it('lets an administrator resynchronize the year and reloads the month', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('setembro de 2026')

    await user.click(screen.getByRole('button', { name: 'Ressincronizar ano' }))
    expect(syncHolidaysMock).toHaveBeenCalledWith(2026)
    expect(await screen.findByRole('status')).toHaveTextContent('12 feriados sincronizados para 2026.')
    await waitFor(() => expect(getHolidaysMock).toHaveBeenCalledTimes(2))
  })

  it('hides the resynchronization button from non administrators', async () => {
    useAuthMock.mockReturnValue({ isAdmin: false, canManageUsers: false, user: { userId: 'user-1' } })
    renderPage()
    await screen.findByText('setembro de 2026')
    expect(screen.queryByRole('button', { name: 'Ressincronizar ano' })).not.toBeInTheDocument()
  })

  it('reports a failure to load the month', async () => {
    getHolidaysMock.mockResolvedValue({ success: false, message: 'Serviço indisponível', data: null })
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Serviço indisponível')
    expect(screen.getByText('Nenhum feriado encontrado neste mês.')).toBeInTheDocument()
  })
  it('offers rule configuration to managers and hides it from common users', async () => {
    renderPage()
    await screen.findByText('setembro de 2026')
    expect(screen.getAllByRole('button', { name: 'Configurar' })).toHaveLength(2)

    useAuthMock.mockReturnValue({ isAdmin: false, canManageUsers: false, user: { userId: 'user-1' } })
    renderPage()
    await waitFor(() => expect(getHolidaysMock).toHaveBeenCalledTimes(2))
    expect(screen.getAllByRole('button', { name: 'Configurar' })).toHaveLength(2)
  })

  it('saves an organization-wide rule for the root administrator', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('setembro de 2026')
    await user.click(screen.getAllByRole('button', { name: 'Configurar' })[0]!)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Aplicar a')).toHaveValue('ORGANIZATION')
    await user.selectOptions(within(dialog).getByLabelText('Conta como dia de folga'), 'no')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar regra' }))

    expect(saveHolidayRuleMock).toHaveBeenCalledWith('holiday-1', {
      userIds: null, dayOff: false, observedDate: null, bridgeDate: null, notes: null,
    })
    expect(await screen.findByRole('status'))
      .toHaveTextContent('Regra salva. Recalcule o banco de horas dos usuários afetados.')
  })

  it('hides the organization option from a manager who is not the root administrator', async () => {
    useAuthMock.mockReturnValue({ isAdmin: false, canManageUsers: true, user: { userId: 'user-1' } })
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('setembro de 2026')
    await user.click(screen.getAllByRole('button', { name: 'Configurar' })[0]!)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Aplicar a')).toHaveValue('USERS')
    expect(within(dialog).queryByRole('option', { name: 'Toda a empresa' })).not.toBeInTheDocument()
    expect(within(dialog).getByText('Apenas o administrador raiz pode criar regras para toda a empresa.'))
      .toBeInTheDocument()
  })

  it('requires at least one user before saving a per-user rule', async () => {
    useAuthMock.mockReturnValue({ isAdmin: false, canManageUsers: true, user: { userId: 'user-1' } })
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('setembro de 2026')
    await user.click(screen.getAllByRole('button', { name: 'Configurar' })[0]!)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Salvar regra' })).toBeDisabled()
    await user.click(within(dialog).getByLabelText('Bia — bia@example.com'))
    await user.click(within(dialog).getByRole('button', { name: 'Salvar regra' }))
    expect(saveHolidayRuleMock).toHaveBeenCalledWith('holiday-1', {
      userIds: ['user-1'], dayOff: true, observedDate: null, bridgeDate: null, notes: null,
    })
  })

  it('warns that the stored hour bank is not recalculated automatically', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('setembro de 2026')
    await user.click(screen.getAllByRole('button', { name: 'Configurar' })[0]!)
    expect(await screen.findByRole('note')).toHaveTextContent('Recalcule o banco de horas')
  })

  it('marks a holiday that already carries a company rule', async () => {
    getHolidaysMock.mockResolvedValue({
      success: true,
      data: { startDate: '2026-09-01', endDate: '2026-09-30', days: [{ ...nationalHoliday, ruleId: 'rule-1' }] },
    })
    renderPage()
    expect(await screen.findByText('Regra da empresa')).toBeInTheDocument()
  })
  it('sends a moved day off', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('setembro de 2026')
    await user.click(screen.getAllByRole('button', { name: 'Configurar' })[0]!)

    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Trocar a folga para outra data'), '2026-09-08')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar regra' }))
    expect(saveHolidayRuleMock).toHaveBeenCalledWith('holiday-1', {
      userIds: null, dayOff: true, observedDate: '2026-09-08', bridgeDate: null, notes: null,
    })
  })

  it('sends a bridged day off', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('setembro de 2026')
    await user.click(screen.getAllByRole('button', { name: 'Configurar' })[0]!)

    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Emendar um dia'), '2026-09-08')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar regra' }))
    expect(saveHolidayRuleMock).toHaveBeenCalledWith('holiday-1', {
      userIds: null, dayOff: true, observedDate: null, bridgeDate: '2026-09-08', notes: null,
    })
  })

  it('hides the move field when the holiday is not a day off, since there is nothing to move', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('setembro de 2026')
    await user.click(screen.getAllByRole('button', { name: 'Configurar' })[0]!)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Trocar a folga para outra data')).toBeInTheDocument()
    await user.selectOptions(within(dialog).getByLabelText('Conta como dia de folga'), 'no')
    expect(within(dialog).queryByLabelText('Trocar a folga para outra data')).not.toBeInTheDocument()
    expect(within(dialog).getByLabelText('Emendar um dia')).toBeInTheDocument()
  })

  it('labels a bridged day and points back at its holiday', async () => {
    getHolidaysMock.mockResolvedValue({
      success: true,
      data: {
        startDate: '2026-09-01', endDate: '2026-09-30',
        days: [{
          ...nationalHoliday, date: '2026-09-08', holidayDate: '2026-09-07',
          kind: 'BRIDGE' as const, ruleId: 'rule-1',
        }],
      },
    })
    renderPage()
    expect(await screen.findByText('Emenda · feriado em 07/09/2026')).toBeInTheDocument()
  })
  it('opens the editor with the rule already in force, instead of clearing it', async () => {
    getHolidaysMock.mockResolvedValue({
      success: true,
      data: {
        startDate: '2026-09-01', endDate: '2026-09-30',
        days: [{ ...nationalHoliday, ruleId: 'rule-1', ruleBridgeDate: '2026-09-08', ruleObservedDate: null }],
      },
    })
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('setembro de 2026')
    await user.click(screen.getByRole('button', { name: 'Configurar' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Emendar um dia')).toHaveValue('2026-09-08')

    // Saving without touching anything must keep the bridge, not wipe it.
    await user.click(within(dialog).getByRole('button', { name: 'Salvar regra' }))
    expect(saveHolidayRuleMock).toHaveBeenCalledWith('holiday-1', {
      userIds: null, dayOff: true, observedDate: null, bridgeDate: '2026-09-08', notes: null,
    })
  })
  it('registers a municipal holiday, which the public source does not provide', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('setembro de 2026')

    await user.type(screen.getByLabelText('Data'), '2026-01-25')
    await user.type(screen.getByLabelText('Nome'), '  Aniversário da cidade  ')
    await user.type(screen.getByLabelText('Estado (opcional)'), 'BR-SP')
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }))

    expect(createHolidayMock).toHaveBeenCalledWith({
      date: '2026-01-25', name: 'Aniversário da cidade', scope: 'MUNICIPAL', subdivisionCode: 'BR-SP',
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Feriado cadastrado')
  })

  it('jumps to the month of the holiday it just registered', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('setembro de 2026')
    await user.type(screen.getByLabelText('Data'), '2026-01-25')
    await user.type(screen.getByLabelText('Nome'), 'Aniversário da cidade')
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }))
    expect(await screen.findByText('janeiro de 2026')).toBeInTheDocument()
  })

  it('keeps the register button disabled until the form is filled', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('setembro de 2026')
    expect(screen.getByRole('button', { name: 'Cadastrar' })).toBeDisabled()
    await user.type(screen.getByLabelText('Data'), '2026-01-25')
    expect(screen.getByRole('button', { name: 'Cadastrar' })).toBeDisabled()
    await user.type(screen.getByLabelText('Nome'), 'Aniversário')
    expect(screen.getByRole('button', { name: 'Cadastrar' })).toBeEnabled()
  })

  it('offers removal only for holidays the company registered itself', async () => {
    getHolidaysMock.mockResolvedValue({
      success: true,
      data: {
        startDate: '2026-09-01', endDate: '2026-09-30',
        days: [nationalHoliday, { ...nationalHoliday, holidayId: 'holiday-9', source: 'MANUAL' as const }],
      },
    })
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('setembro de 2026')

    // Only the manual one is the company's to delete; the synced catalogue is shared.
    expect(screen.getAllByRole('button', { name: 'Remover' })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Remover' }))
    expect(deleteHolidayMock).toHaveBeenCalledWith('holiday-9')
  })

  it('hides registration and removal from anyone but the root administrator', async () => {
    useAuthMock.mockReturnValue({ isAdmin: false, canManageUsers: true, user: { userId: 'user-1' } })
    getHolidaysMock.mockResolvedValue({
      success: true,
      data: {
        startDate: '2026-09-01', endDate: '2026-09-30',
        days: [{ ...nationalHoliday, holidayId: 'holiday-9', source: 'MANUAL' as const }],
      },
    })
    renderPage()
    await screen.findByText('setembro de 2026')
    expect(screen.queryByRole('button', { name: 'Cadastrar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remover' })).not.toBeInTheDocument()
  })
})
