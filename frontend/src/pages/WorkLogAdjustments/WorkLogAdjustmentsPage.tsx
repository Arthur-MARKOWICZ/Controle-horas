import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import MainLayout from '../../layouts/MainLayout'
import { useAuth } from '../../hooks/useAuth'
import { useUsers } from '../../hooks/useUsers'
import * as historyService from '../../services/historyService'
import Pagination from '../../components/Pagination/Pagination'
import { getErrorMessage } from '../../utils/errorMessage'
import { formatInstantTime, formatShortDate, formatSignedDuration, getCurrentMonthRange } from '../../utils/formatTime'
import type { HistoryData, WorkLog } from '../../types/api'
import styles from './WorkLogAdjustmentsPage.module.css'

interface FormValues { entryAt: string; exitAt: string }
interface DateRange { startDate: string; endDate: string }
const PAGE_SIZE = 10

function toDateTimeInput(value: string): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value))
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`
}

function toInstant(value: string): string { return new Date(`${value}:00-03:00`).toISOString() }

function isValidPeriod(startDate: string, endDate: string): boolean {
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= end
}

function WorkLogAdjustmentsPage() {
  const { isAdmin } = useAuth()
  const { users, isLoading: loadingUsers, error: usersError } = useUsers()
  const [userId, setUserId] = useState('')
  const [history, setHistory] = useState<HistoryData | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState<WorkLog | null>(null)
  const [form, setForm] = useState<FormValues>({ entryAt: '', exitAt: '' })
  const [offset, setOffset] = useState(0)
  const [reloadVersion, setReloadVersion] = useState(0)
  const defaultRange = useMemo(() => getCurrentMonthRange(), [])
  const [startDate, setStartDate] = useState(defaultRange.startDate)
  const [endDate, setEndDate] = useState(defaultRange.endDate)
  const [activeRange, setActiveRange] = useState<DateRange>(defaultRange)
  const [filterError, setFilterError] = useState('')

  useEffect(() => {
    if (!userId && users.length) setUserId(users[0]!.id)
  }, [userId, users])

  const loadHistory = useCallback(async (targetId: string, range: DateRange, nextOffset: number) => {
    if (!targetId) return
    setLoadingHistory(true); setError('')
    try {
      const response = await historyService.getUserHistory(targetId, range.startDate, range.endDate, PAGE_SIZE, nextOffset)
      if (!response.success || !response.data) throw new Error(response.message || 'Não foi possível carregar os registros.')
      setHistory(response.data)
    } catch (requestError) {
      setHistory(null); setError(await getErrorMessage(requestError, 'Não foi possível carregar os registros.'))
    } finally { setLoadingHistory(false) }
  }, [])

  useEffect(() => { void loadHistory(userId, activeRange, offset) }, [activeRange, loadHistory, offset, reloadVersion, userId])

  const selectUser = (nextUserId: string) => {
    setOffset(0)
    setUserId(nextUserId)
  }

  const refreshHistory = () => {
    setOffset(0)
    setReloadVersion((version) => version + 1)
  }

  const applyFilter = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!isValidPeriod(startDate, endDate)) {
      setFilterError('O período deve ser válido, com a data inicial menor ou igual à data final.')
      return
    }
    setFilterError('')
    setOffset(0)
    setActiveRange({ startDate, endDate })
  }

  const startCreate = () => { setEditing(null); setForm({ entryAt: '', exitAt: '' }); setMessage('') }
  const startEdit = (log: WorkLog) => {
    if (!log.exitAt) return
    setEditing(log); setForm({ entryAt: toDateTimeInput(log.entryAt), exitAt: toDateTimeInput(log.exitAt) }); setMessage('')
  }
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!userId || !form.entryAt || !form.exitAt) return
    setSubmitting(true); setError(''); setMessage('')
    try {
      const payload = { entryAt: toInstant(form.entryAt), exitAt: toInstant(form.exitAt) }
      const response = editing
        ? await historyService.updateUserWorkLog(userId, editing.id, payload)
        : await historyService.createUserWorkLog(userId, payload)
      if (!response.success || !response.data) throw new Error(response.message || 'Não foi possível salvar o registro.')
      setMessage(editing ? 'Registro atualizado.' : 'Registro criado.')
      setEditing(null)
      setForm({ entryAt: '', exitAt: '' })
      refreshHistory()
    } catch (requestError) {
      setError(await getErrorMessage(requestError, 'Não foi possível salvar o registro.'))
    } finally { setSubmitting(false) }
  }

  const remove = async (log: WorkLog) => {
    if (!userId || !log.exitAt || !window.confirm('Deseja excluir este registro de ponto? Esta ação não pode ser desfeita.')) return
    setSubmitting(true); setError(''); setMessage('')
    try {
      const response = await historyService.deleteUserWorkLog(userId, log.id)
      if (!response.success) throw new Error(response.message || 'Não foi possível excluir o registro.')
      if (editing?.id === log.id) startCreate()
      setOffset(0)
      await loadHistory(userId, activeRange, 0)
      setMessage('Registro excluído e banco de horas recalculado.')
    } catch (requestError) {
      setError(await getErrorMessage(requestError, 'Não foi possível excluir o registro.'))
    } finally { setSubmitting(false) }
  }

  const recalculateHourBank = async () => {
    if (!userId) return
    setSubmitting(true); setError(''); setMessage('')
    try {
      const response = await historyService.recalculateUserHourBank(userId)
      if (!response.success || !response.data) throw new Error(response.message || 'Não foi possível recalcular o banco de horas.')
      setOffset(0)
      await loadHistory(userId, activeRange, 0)
      setMessage(`Banco de horas recalculado e atualizado: ${formatSignedDuration(response.data.hourBankMinutes)}.`)
    } catch (requestError) {
      setError(await getErrorMessage(requestError, 'Não foi possível recalcular o banco de horas.'))
    } finally { setSubmitting(false) }
  }

  const recalculateWorkedDays = async () => {
    if (!userId) return
    setSubmitting(true); setError(''); setMessage('')
    try {
      const response = await historyService.recalculateUserWorkedDays(userId)
      if (!response.success || !response.data) throw new Error(response.message || 'Não foi possível recalcular os totais de dias.')
      setOffset(0)
      await loadHistory(userId, activeRange, 0)
      setMessage(`Totais de dias atualizados: ${response.data.total} (${response.data.inSchedule} na jornada e ${response.data.outsideSchedule} fora da jornada).`)
    } catch (requestError) {
      setError(await getErrorMessage(requestError, 'Não foi possível recalcular os totais de dias.'))
    } finally { setSubmitting(false) }
  }

  const logs = history?.days.flatMap((day) => day.workLogs.map((log) => ({ date: day.date, log }))) ?? []

  return <MainLayout><main className={styles.page}>
    <header className={styles.header}>
      <h1>Ajustes de ponto</h1>
      <p>{isAdmin ? 'Crie registros esquecidos, corrija entrada e saída ou recalcule o banco de horas.' : 'Recalcule o banco de horas dos usuários do seu time.'}</p>
    </header>
    <section className={styles.card}>
      <label htmlFor="adjustment-user">Usuário
        <select id="adjustment-user" value={userId} disabled={loadingUsers || submitting} onChange={(event) => selectUser(event.target.value)}>
          {users.map((user) => <option key={user.id} value={user.id}>{user.name} — {user.email}</option>)}
        </select>
      </label>
      {usersError && <p className={styles.error} role="alert">{usersError}</p>}
    </section>
    <section className={styles.card} aria-label="Recálculo do banco de horas">
      <div className={styles.cardHeader}>
        <div><h2>Banco de horas</h2><p className={styles.hint}>Recalcula todos os lançamentos do usuário e substitui o saldo armazenado.</p></div>
        <button type="button" disabled={submitting || loadingHistory || !userId} onClick={() => void recalculateHourBank()}>{submitting ? 'Recalculando...' : 'Recalcular banco de horas'}</button>
      </div>
      {(error || message) && <p className={error ? styles.error : styles.success} role={error ? 'alert' : 'status'}>{error || message}</p>}
    </section>
    <section className={styles.card} aria-label="Recálculo dos dias trabalhados">
      <div className={styles.cardHeader}>
        <div><h2>Dias trabalhados</h2><p className={styles.hint}>Recalcula os totais absolutos de dias dentro e fora da jornada.</p></div>
        <button type="button" disabled={submitting || loadingHistory || !userId} onClick={() => void recalculateWorkedDays()}>{submitting ? 'Recalculando...' : 'Recalcular totais de dias'}</button>
      </div>
      <Link className={styles.secondaryButton} to="/settings/work-logs/outside-schedule">Ver dias fora da jornada</Link>
    </section>
    <section className={styles.card} aria-label="Filtro de período">
      <form className={styles.filterForm} onSubmit={applyFilter}>
        <label htmlFor="adjustment-start-date">Data inicial
          <input id="adjustment-start-date" type="date" value={startDate} disabled={loadingHistory || submitting} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <label htmlFor="adjustment-end-date">Data final
          <input id="adjustment-end-date" type="date" value={endDate} disabled={loadingHistory || submitting} onChange={(event) => setEndDate(event.target.value)} />
        </label>
        <div className={styles.filterActions}><button type="submit" disabled={loadingHistory || submitting || !userId}>{loadingHistory ? 'Carregando...' : 'Filtrar registros'}</button></div>
      </form>
      <p className={styles.hint}>Escolha o período para localizar registros importados ou ajustar lançamentos anteriores.</p>
      {filterError && <p className={styles.error} role="alert">{filterError}</p>}
    </section>
    {isAdmin && <section className={styles.card}>
      <div className={styles.cardHeader}><h2>{editing ? 'Editar registro' : 'Novo registro'}</h2>{editing && <button className={styles.secondaryButton} type="button" onClick={startCreate}>Cancelar edição</button>}</div>
      <form className={styles.form} onSubmit={submit}>
        <label>Entrada<input type="datetime-local" value={form.entryAt} required disabled={submitting || !userId} onChange={(event) => setForm({ ...form, entryAt: event.target.value })} /></label>
        <label>Saída<input type="datetime-local" value={form.exitAt} required disabled={submitting || !userId} onChange={(event) => setForm({ ...form, exitAt: event.target.value })} /></label>
        <div className={styles.actions}><button type="submit" disabled={submitting || !userId}>{submitting ? 'Salvando...' : editing ? 'Salvar alteração' : 'Criar registro'}</button></div>
      </form>
      <p className={styles.hint}>Os horários são interpretados no fuso de São Paulo. Registros não podem se sobrepor.</p>
    </section>}
    <section className={styles.card}>
      <div className={styles.cardHeader}><h2>Registros de {activeRange.startDate} a {activeRange.endDate}</h2>{loadingHistory && <span>Carregando...</span>}</div>
      {history && <p className={styles.hint}>Banco de horas atual: {formatSignedDuration(history.hourBankMinutes)}</p>}
      {!loadingHistory && logs.length === 0 && <p className={styles.hint}>Nenhum registro encontrado neste período.</p>}
      {logs.length > 0 && <div className={styles.tableWrapper}><table><thead><tr><th>Data</th><th>Entrada</th><th>Saída</th>{isAdmin && <th />}</tr></thead><tbody>
        {logs.map(({ date, log }) => <tr key={`${date}-${log.id}`}><td>{formatShortDate(date)}</td><td>{formatInstantTime(log.entryAt)}</td><td>{formatInstantTime(log.exitAt)}</td>{isAdmin && <td><div className={styles.rowActions}><button className={styles.secondaryButton} type="button" disabled={!log.exitAt || submitting} onClick={() => startEdit(log)}>Editar</button><button className={styles.deleteButton} type="button" disabled={!log.exitAt || submitting} onClick={() => void remove(log)}>Excluir</button></div></td>}</tr>)}
      </tbody></table></div>}
      <Pagination pagination={history?.pagination} disabled={loadingHistory || submitting} onPageChange={setOffset} />
    </section>
  </main></MainLayout>
}

export default WorkLogAdjustmentsPage
