import { useEffect, useMemo, useState } from 'react'
import MainLayout from '../../layouts/MainLayout'
import { useUsers } from '../../hooks/useUsers'
import * as historyService from '../../services/historyService'
import { getErrorMessage } from '../../utils/errorMessage'
import { getCurrentMonthRange, formatInstantTime, formatShortDate } from '../../utils/formatTime'
import type { HistoryData, WorkLog } from '../../types/api'
import styles from './WorkLogAdjustmentsPage.module.css'

interface FormValues { entryAt: string; exitAt: string }

function toDateTimeInput(value: string): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value))
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`
}

function toInstant(value: string): string { return new Date(`${value}:00-03:00`).toISOString() }

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
  const range = useMemo(() => getCurrentMonthRange(), [])

  useEffect(() => {
    if (!userId && users.length) setUserId(users[0]!.id)
  }, [userId, users])

  const loadHistory = async (targetId: string) => {
    if (!targetId) return
    setLoadingHistory(true); setError('')
    try {
      const response = await historyService.getUserHistory(targetId, range.startDate, range.endDate)
      if (!response.success || !response.data) throw new Error(response.message || 'Não foi possível carregar os registros.')
      setHistory(response.data)
    } catch (requestError) {
      setHistory(null); setError(await getErrorMessage(requestError, 'Não foi possível carregar os registros.'))
    } finally { setLoadingHistory(false) }
  }

  useEffect(() => { void loadHistory(userId) }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

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
      await loadHistory(userId)
    } catch (requestError) {
      setError(await getErrorMessage(requestError, 'Não foi possível salvar o registro.'))
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
        <select id="adjustment-user" value={userId} disabled={loadingUsers || submitting} onChange={(event) => setUserId(event.target.value)}>
          {users.map((user) => <option key={user.id} value={user.id}>{user.name} — {user.email}</option>)}
        </select>
      </label>
      {usersError && <p className={styles.error} role="alert">{usersError}</p>}
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
      <div className={styles.cardHeader}><h2>Registros de {range.startDate.slice(5).replace('-', '/')}</h2>{loadingHistory && <span>Carregando...</span>}</div>
      {!loadingHistory && logs.length === 0 && <p className={styles.hint}>Nenhum registro encontrado neste mês.</p>}
      {logs.length > 0 && <div className={styles.tableWrapper}><table><thead><tr><th>Data</th><th>Entrada</th><th>Saída</th><th /></tr></thead><tbody>
        {logs.map(({ date, log }) => <tr key={`${date}-${log.id}`}><td>{formatShortDate(date)}</td><td>{formatInstantTime(log.entryAt)}</td><td>{formatInstantTime(log.exitAt)}</td><td><button className={styles.secondaryButton} type="button" disabled={!log.exitAt || submitting} onClick={() => startEdit(log)}>Editar</button></td></tr>)}
      </tbody></table></div>}
    </section>
  </main></MainLayout>
}

export default WorkLogAdjustmentsPage
