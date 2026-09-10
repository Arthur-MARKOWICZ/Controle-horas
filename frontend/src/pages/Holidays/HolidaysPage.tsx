import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import MainLayout from '../../layouts/MainLayout'
import HolidayRuleModal from '../../components/HolidayRuleModal/HolidayRuleModal'
import { useAuth } from '../../hooks/useAuth'
import { useUsers } from '../../hooks/useUsers'
import * as holidayService from '../../services/holidayService'
import { getErrorMessage } from '../../utils/errorMessage'
import { formatShortDate } from '../../utils/formatTime'
import type { HolidayDay, HolidayKind, HolidayScope } from '../../types/api'
import styles from './HolidaysPage.module.css'

const WEEK_DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const KIND_LABELS: Record<HolidayKind, string> = {
  HOLIDAY: 'Feriado',
  OBSERVED: 'Folga transferida',
  BRIDGE: 'Emenda',
}

const SCOPE_LABELS: Record<HolidayScope, string> = {
  NATIONAL: 'Nacional',
  SUBDIVISION: 'Estadual',
  MUNICIPAL: 'Municipal',
  COMPANY: 'Empresa',
}

function currentMonth(reference: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit',
  }).format(reference)
}

function monthRange(month: string): { startDate: string; endDate: string } {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number]
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return { startDate: `${month}-01`, endDate: `${month}-${String(lastDay).padStart(2, '0')}` }
}

function shiftMonth(month: string, amount: number): string {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number]
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + amount, 1))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number]
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, monthNumber - 1, 1)))
}

/** Days of the month preceded by blanks so the first day lands on its week day column. */
function monthCells(month: string): Array<string | null> {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number]
  const firstWeekDay = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay()
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  const cells: Array<string | null> = Array.from({ length: firstWeekDay }, () => null)
  for (let day = 1; day <= lastDay; day++) cells.push(`${month}-${String(day).padStart(2, '0')}`)
  return cells
}

function HolidaysPage() {
  const { isAdmin, canManageUsers, user } = useAuth()
  const { users } = useUsers()
  const [month, setMonth] = useState(currentMonth)
  const [days, setDays] = useState<HolidayDay[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState<HolidayDay | null>(null)
  const [savingRule, setSavingRule] = useState(false)
  const [ruleError, setRuleError] = useState('')
  const [creating, setCreating] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newName, setNewName] = useState('')
  const [newSubdivision, setNewSubdivision] = useState('')

  // The organization root is the ADMIN that public registration created, the one without a creator.
  const isOrganizationRoot = useMemo(
    () => isAdmin && users.some((candidate) => candidate.id === user?.userId && candidate.createdById === null),
    [isAdmin, user?.userId, users],
  )

  const load = useCallback(async (targetMonth: string) => {
    const { startDate, endDate } = monthRange(targetMonth)
    setLoading(true); setError('')
    try {
      const response = await holidayService.getHolidays(startDate, endDate)
      if (!response.success || !response.data) throw new Error(response.message)
      setDays(response.data.days)
    } catch (requestError) {
      setDays([]); setError(await getErrorMessage(requestError, 'Não foi possível carregar os feriados.'))
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load(month) }, [load, month])

  const byDate = useMemo(() => {
    const grouped = new Map<string, HolidayDay[]>()
    for (const day of days) grouped.set(day.date, [...(grouped.get(day.date) || []), day])
    return grouped
  }, [days])
  const daysOff = useMemo(() => days.filter((day) => day.dayOff), [days])
  const cells = useMemo(() => monthCells(month), [month])

  const saveRule = async (payload: { userIds: string[] | null; dayOff: boolean; notes: string | null }) => {
    if (!editing) return
    setSavingRule(true); setRuleError(''); setMessage('')
    try {
      const response = await holidayService.saveHolidayRule(editing.holidayId, payload)
      if (!response.success || !response.data) throw new Error(response.message)
      setEditing(null)
      setMessage('Regra salva. Recalcule o banco de horas dos usuários afetados.')
      await load(month)
    } catch (requestError) {
      setRuleError(await getErrorMessage(requestError, 'Não foi possível salvar a regra.'))
    } finally { setSavingRule(false) }
  }

  const createHoliday = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreating(true); setError(''); setMessage('')
    try {
      const response = await holidayService.createHoliday({
        date: newDate, name: newName.trim(), scope: 'MUNICIPAL',
        subdivisionCode: newSubdivision.trim() || null,
      })
      if (!response.success || !response.data) throw new Error(response.message)
      setNewDate(''); setNewName(''); setNewSubdivision('')
      setMessage('Feriado cadastrado. Recalcule o banco de horas dos usuários afetados.')
      setMonth(newDate.slice(0, 7))
      await load(newDate.slice(0, 7))
    } catch (requestError) {
      setError(await getErrorMessage(requestError, 'Não foi possível cadastrar o feriado.'))
    } finally { setCreating(false) }
  }

  const removeHoliday = async (day: HolidayDay) => {
    if (!window.confirm(`Remover o feriado "${day.name}"? As regras dele também serão removidas.`)) return
    setCreating(true); setError(''); setMessage('')
    try {
      const response = await holidayService.deleteHoliday(day.holidayId)
      if (!response.success) throw new Error(response.message)
      setMessage('Feriado removido. Recalcule o banco de horas dos usuários afetados.')
      await load(month)
    } catch (requestError) {
      setError(await getErrorMessage(requestError, 'Não foi possível remover o feriado.'))
    } finally { setCreating(false) }
  }

  const resync = async () => {
    setSyncing(true); setError(''); setMessage('')
    try {
      const response = await holidayService.syncHolidays(Number(month.slice(0, 4)))
      if (!response.success || !response.data) throw new Error(response.message)
      setMessage(`${response.data.holidayCount} feriados sincronizados para ${response.data.year}.`)
      await load(month)
    } catch (requestError) {
      setError(await getErrorMessage(requestError, 'Não foi possível sincronizar os feriados.'))
    } finally { setSyncing(false) }
  }

  return <MainLayout><main className={styles.page}>
    <header className={styles.header}>
      <h1>Feriados</h1>
      <p>Consulte os feriados do mês e quais deles são dia de folga.</p>
    </header>

    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.monthNav}>
          <button type="button" className={styles.secondaryButton} disabled={loading} onClick={() => setMonth((current) => shiftMonth(current, -1))}>Mês anterior</button>
          <span className={styles.monthLabel}>{monthLabel(month)}</span>
          <button type="button" className={styles.secondaryButton} disabled={loading} onClick={() => setMonth((current) => shiftMonth(current, 1))}>Próximo mês</button>
        </div>
        <div className={styles.headerActions}>
          {canManageUsers && <Link className={styles.secondaryButton} to="/settings/holidays/rules">Ver regras</Link>}
          {isAdmin && <button type="button" disabled={syncing || loading} onClick={() => void resync()}>{syncing ? 'Sincronizando...' : 'Ressincronizar ano'}</button>}
        </div>
      </div>
      {(error || message) && <p className={error ? styles.error : styles.success} role={error ? 'alert' : 'status'}>{error || message}</p>}

      <div className={styles.gridWrapper}>
        <div className={styles.grid}>
          {WEEK_DAY_LABELS.map((label) => <div className={styles.weekDay} key={label}>{label}</div>)}
          {cells.map((date, index) => {
            if (!date) return <div className={styles.dayEmpty} key={`empty-${index}`} />
            const entries = byDate.get(date) || []
            const isDayOff = entries.some((entry) => entry.dayOff)
            const className = [styles.day, isDayOff ? styles.dayOff : entries.length ? styles.dayNote : ''].filter(Boolean).join(' ')
            return <div className={className} key={date}>
              <span className={styles.dayNumber}>{Number(date.slice(8))}</span>
              {entries.map((entry) => (
                <span className={styles.dayName} key={`${entry.holidayId}-${entry.kind}`}>
                  {entry.kind === 'BRIDGE' ? `Emenda · ${entry.name}` : entry.name}
                </span>
              ))}
            </div>
          })}
        </div>
      </div>
    </section>

    <section className={styles.card}>
      <h2>Feriados do mês</h2>
      {loading && <p className={styles.hint}>Carregando...</p>}
      {!loading && days.length === 0 && <p className={styles.hint}>Nenhum feriado encontrado neste mês.</p>}
      {days.length > 0 && <ul className={styles.list}>
        {days.map((day) => <li key={`${day.holidayId}-${day.kind}-${day.date}`}>
          <strong>{formatShortDate(day.date)}</strong>
          <span>{day.name}</span>
          <span className={styles.badge}>{SCOPE_LABELS[day.scope]}{day.subdivisionCode ? ` · ${day.subdivisionCode}` : ''}</span>
          {day.kind !== 'HOLIDAY' && (
            <span className={styles.badge}>{KIND_LABELS[day.kind]} · feriado em {formatShortDate(day.holidayDate)}</span>
          )}
          <span className={styles.badge}>{day.dayOff ? 'Folga' : 'Dia normal'}</span>
          {day.ruleId && <span className={styles.badge}>Regra da empresa</span>}
          {canManageUsers && (
            <button type="button" className={styles.secondaryButton} onClick={() => { setRuleError(''); setEditing(day) }}>
              Configurar
            </button>
          )}
          {isOrganizationRoot && day.source === 'MANUAL' && (
            <button type="button" className={styles.deleteButton} disabled={creating} onClick={() => void removeHoliday(day)}>
              Remover
            </button>
          )}
        </li>)}
      </ul>}
    </section>

    {isOrganizationRoot && (
      <section className={styles.card}>
        <h2>Cadastrar feriado da empresa</h2>
        <p className={styles.hint}>
          Feriados municipais não existem na fonte pública e precisam ser cadastrados aqui.
        </p>
        <form className={styles.createForm} onSubmit={(event) => void createHoliday(event)}>
          <label htmlFor="new-holiday-date">Data
            <input id="new-holiday-date" type="date" value={newDate} required disabled={creating} onChange={(event) => setNewDate(event.target.value)} />
          </label>
          <label htmlFor="new-holiday-name">Nome
            <input id="new-holiday-name" type="text" value={newName} required maxLength={160} disabled={creating} onChange={(event) => setNewName(event.target.value)} />
          </label>
          <label htmlFor="new-holiday-subdivision">Estado (opcional)
            <input id="new-holiday-subdivision" type="text" value={newSubdivision} placeholder="BR-SP" maxLength={10} disabled={creating} onChange={(event) => setNewSubdivision(event.target.value)} />
          </label>
          <button type="submit" disabled={creating || !newDate || !newName.trim()}>
            {creating ? 'Salvando...' : 'Cadastrar'}
          </button>
        </form>
      </section>
    )}

    <section className={styles.card}>
      <h2>Dias de folga</h2>
      {daysOff.length === 0
        ? <p className={styles.hint}>Nenhum dia de folga por feriado neste mês.</p>
        : <ul className={styles.list}>
          {daysOff.map((day) => <li key={`${day.holidayId}-${day.kind}-${day.date}`}>
            <strong>{formatShortDate(day.date)}</strong>
            <span>{day.name}</span>
            {day.kind !== 'HOLIDAY' && <span className={styles.badge}>{KIND_LABELS[day.kind]}</span>}
          </li>)}
        </ul>}
    </section>
    {editing && (
      <HolidayRuleModal
        holiday={editing}
        users={users}
        canManageOrganization={isOrganizationRoot}
        submitting={savingRule}
        error={ruleError}
        onSave={(payload) => void saveRule(payload)}
        onClose={() => setEditing(null)}
      />
    )}
  </main></MainLayout>
}

export default HolidaysPage
