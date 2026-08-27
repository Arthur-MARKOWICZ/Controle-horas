import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import MainLayout from '../../layouts/MainLayout'
import { useAuth } from '../../hooks/useAuth'
import { useUsers } from '../../hooks/useUsers'
import * as historyService from '../../services/historyService'
import Pagination from '../../components/Pagination/Pagination'
import { getErrorMessage } from '../../utils/errorMessage'
import { formatInstantTime, formatShortDate, formatWorkload } from '../../utils/formatTime'
import type { OutsideScheduleWorkDaysData, WorkLog } from '../../types/api'
import styles from '../WorkLogAdjustments/WorkLogAdjustmentsPage.module.css'

const PAGE_SIZE = 10

function toDateTimeInput(value: string): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value))
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`
}

function OutsideScheduleWorkDaysPage() {
  const { isAdmin } = useAuth()
  const { users, isLoading: loadingUsers, error: usersError } = useUsers()
  const [userId, setUserId] = useState('')
  const [data, setData] = useState<OutsideScheduleWorkDaysData | null>(null)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState<WorkLog | null>(null)
  const [entryAt, setEntryAt] = useState('')
  const [exitAt, setExitAt] = useState('')

  useEffect(() => { if (!userId && users.length) setUserId(users[0]!.id) }, [userId, users])
  const load = useCallback(async (targetId: string, nextOffset: number) => {
    if (!targetId) return
    setLoading(true); setError('')
    try {
      const response = await historyService.getUserOutsideScheduleWorkDays(targetId, PAGE_SIZE, nextOffset)
      if (!response.success || !response.data) throw new Error(response.message)
      setData(response.data)
    } catch (requestError) {
      setData(null); setError(await getErrorMessage(requestError, 'Não foi possível carregar os dias fora da jornada.'))
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load(userId, offset) }, [load, offset, userId])

  const edit = (log: WorkLog) => {
    if (!log.exitAt) return
    setEditing(log); setEntryAt(toDateTimeInput(log.entryAt)); setExitAt(toDateTimeInput(log.exitAt)); setMessage('')
  }
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editing || !userId || !entryAt || !exitAt) return
    setSubmitting(true); setError(''); setMessage('')
    try {
      const response = await historyService.updateUserWorkLog(userId, editing.id, {
        entryAt: new Date(`${entryAt}:00-03:00`).toISOString(), exitAt: new Date(`${exitAt}:00-03:00`).toISOString(),
      })
      if (!response.success) throw new Error(response.message)
      setEditing(null); await load(userId, 0); setOffset(0); setMessage('Registro atualizado.')
    } catch (requestError) { setError(await getErrorMessage(requestError, 'Não foi possível atualizar o registro.')) } finally { setSubmitting(false) }
  }
  const remove = async (log: WorkLog) => {
    if (!userId || !window.confirm('Deseja excluir este registro de ponto? Esta ação não pode ser desfeita.')) return
    setSubmitting(true); setError(''); setMessage('')
    try {
      const response = await historyService.deleteUserWorkLog(userId, log.id)
      if (!response.success) throw new Error(response.message)
      if (editing?.id === log.id) setEditing(null)
      await load(userId, 0); setOffset(0); setMessage('Registro excluído.')
    } catch (requestError) { setError(await getErrorMessage(requestError, 'Não foi possível excluir o registro.')) } finally { setSubmitting(false) }
  }

  return <MainLayout><main className={styles.page}>
    <header className={styles.header}><h1>Dias fora da jornada</h1><p>Revise os dias com trabalho registrado fora do calendário histórico de jornada.</p></header>
    <section className={styles.card}><Link className={styles.secondaryButton} to="/settings/work-logs">Voltar aos ajustes de ponto</Link></section>
    <section className={styles.card}>
      <label htmlFor="outside-schedule-user">Usuário<select id="outside-schedule-user" value={userId} disabled={loadingUsers || submitting} onChange={(event) => { setOffset(0); setUserId(event.target.value) }}>{users.map((user) => <option key={user.id} value={user.id}>{user.name} — {user.email}</option>)}</select></label>
      {usersError && <p className={styles.error} role="alert">{usersError}</p>}
    </section>
    {isAdmin && editing && <section className={styles.card}><div className={styles.cardHeader}><h2>Editar registro</h2><button type="button" className={styles.secondaryButton} onClick={() => setEditing(null)}>Cancelar</button></div><form className={styles.form} onSubmit={save}><label>Entrada<input type="datetime-local" value={entryAt} required onChange={(event) => setEntryAt(event.target.value)} /></label><label>Saída<input type="datetime-local" value={exitAt} required onChange={(event) => setExitAt(event.target.value)} /></label><div className={styles.actions}><button type="submit" disabled={submitting}>{submitting ? 'Salvando...' : 'Salvar alteração'}</button></div></form></section>}
    {(error || message) && <p className={error ? styles.error : styles.success} role={error ? 'alert' : 'status'}>{error || message}</p>}
    <section className={styles.card}><div className={styles.cardHeader}><div><h2>Dias encontrados</h2><p className={styles.hint}>Cada dia representa trabalho fechado fora da jornada configurada para aquela data.</p></div>{loading && <span>Carregando...</span>}</div>
      {!loading && data?.days.length === 0 && <p className={styles.hint}>Nenhum dia fora da jornada foi encontrado.</p>}
      {data?.days.map((day) => <div className={styles.card} key={day.date}><h2>{formatShortDate(day.date)} · {formatWorkload(day.workedMinutes)}</h2>{day.workLogs.map((log) => <div className={styles.rowActions} key={log.id}><span>{formatInstantTime(log.entryAt)} — {formatInstantTime(log.exitAt)}</span>{isAdmin && <><button type="button" className={styles.secondaryButton} disabled={submitting} onClick={() => edit(log)}>Editar</button><button type="button" className={styles.deleteButton} disabled={submitting} onClick={() => void remove(log)}>Excluir</button></>}</div>)}</div>)}
      <Pagination pagination={data?.pagination} disabled={loading || submitting} onPageChange={setOffset} />
    </section>
  </main></MainLayout>
}

export default OutsideScheduleWorkDaysPage
