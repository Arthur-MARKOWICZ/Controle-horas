import { useCallback, useEffect, useMemo, useState } from 'react'
import MainLayout from '../../layouts/MainLayout'
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
  return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= end && (end.getTime() - start.getTime()) / 86_400_000 <= 90
}

function WorkLogAdjustmentsPage() {
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
      setFilterError('O período deve ser válido e ter até 90 dias.')
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

  const logs = history?.days.flatMap((day) => day.workLogs.map((log) => ({ date: day.date, log }))) ?? []

  return <MainLayout><main className={styles.page}>
    <header className={styles.header}>
      <h1>Ajustes de ponto</h1>
      <p>Crie registros esquecidos ou corrija entrada e saída de usuários.</p>
    </header>
    <section className={styles.card}>
      <label htmlFor="adjustment-user">Usuário
        <select id="adjustment-user" value={userId} disabled={loadingUsers || submitting} onChange={(event) => selectUser(event.target.value)}>
          {users.map((user) => <option key={user.id} value={user.id}>{user.name} — {user.email}</option>)}
        </select>
      </label>
      {usersError && <p className={styles.error} role="alert">{usersError}</p>}
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
      <p className={styles.hint}>Escolha um período de até 90 dias para localizar registros importados ou ajustar lançamentos anteriores.</p>
      {filterError && <p className={styles.error} role="alert">{filterError}</p>}
    </section>
    <section className={styles.card}>
      <div className={styles.cardHeader}><h2>{editing ? 'Editar registro' : 'Novo registro'}</h2>{editing && <button className={styles.secondaryButton} type="button" onClick={startCreate}>Cancelar edição</button>}</div>
      <form className={styles.form} onSubmit={submit}>
        <label>Entrada<input type="datetime-local" value={form.entryAt} required disabled={submitting || !userId} onChange={(event) => setForm({ ...form, entryAt: event.target.value })} /></label>
        <label>Saída<input type="datetime-local" value={form.exitAt} required disabled={submitting || !userId} onChange={(event) => setForm({ ...form, exitAt: event.target.value })} /></label>
        <div className={styles.actions}><button type="submit" disabled={submitting || !userId}>{submitting ? 'Salvando...' : editing ? 'Salvar alteração' : 'Criar registro'}</button></div>
      </form>
      <p className={styles.hint}>Os horários são interpretados no fuso de São Paulo. Registros não podem se sobrepor.</p>
      {(error || message) && <p className={error ? styles.error : styles.success} role={error ? 'alert' : 'status'}>{error || message}</p>}
    </section>
    <section className={styles.card}>
      <div className={styles.cardHeader}><h2>Registros de {activeRange.startDate} a {activeRange.endDate}</h2>{loadingHistory && <span>Carregando...</span>}</div>
      {history && <p className={styles.hint}>Banco de horas atual: {formatSignedDuration(history.hourBankMinutes)}</p>}
      {!loadingHistory && logs.length === 0 && <p className={styles.hint}>Nenhum registro encontrado neste período.</p>}
      {logs.length > 0 && <div className={styles.tableWrapper}><table><thead><tr><th>Data</th><th>Entrada</th><th>Saída</th><th /></tr></thead><tbody>
        {logs.map(({ date, log }) => <tr key={`${date}-${log.id}`}><td>{formatShortDate(date)}</td><td>{formatInstantTime(log.entryAt)}</td><td>{formatInstantTime(log.exitAt)}</td><td><div className={styles.rowActions}><button className={styles.secondaryButton} type="button" disabled={!log.exitAt || submitting} onClick={() => startEdit(log)}>Editar</button><button className={styles.deleteButton} type="button" disabled={!log.exitAt || submitting} onClick={() => void remove(log)}>Excluir</button></div></td></tr>)}
      </tbody></table></div>}
      <Pagination pagination={history?.pagination} disabled={loadingHistory || submitting} onPageChange={setOffset} />
    </section>
  </main></MainLayout>
}

export default WorkLogAdjustmentsPage
