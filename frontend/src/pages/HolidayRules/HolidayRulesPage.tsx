import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import MainLayout from '../../layouts/MainLayout'
import * as holidayService from '../../services/holidayService'
import { getErrorMessage } from '../../utils/errorMessage'
import { formatShortDate } from '../../utils/formatTime'
import type { HolidayRule } from '../../types/api'
import styles from './HolidayRulesPage.module.css'

function formatMoment(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}

function HolidayRulesPage() {
  const [rules, setRules] = useState<HolidayRule[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const response = await holidayService.listHolidayRules()
      if (!response.success || !response.data) throw new Error(response.message)
      setRules(response.data)
    } catch (requestError) {
      setRules([]); setError(await getErrorMessage(requestError, 'Não foi possível carregar as regras.'))
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const remove = async (rule: HolidayRule) => {
    if (!window.confirm(`Remover a regra de "${rule.holidayName}"? O feriado volta ao comportamento padrão.`)) return
    setSubmitting(true); setError(''); setMessage('')
    try {
      const response = await holidayService.deleteHolidayRule(rule.id)
      if (!response.success) throw new Error(response.message)
      setMessage('Regra removida. Recalcule o banco de horas dos usuários afetados.')
      await load()
    } catch (requestError) {
      setError(await getErrorMessage(requestError, 'Não foi possível remover a regra.'))
    } finally { setSubmitting(false) }
  }

  return <MainLayout><main className={styles.page}>
    <header className={styles.header}>
      <h1>Regras de feriado</h1>
      <p>Configurações da empresa sobre cada feriado e quem as aprovou.</p>
    </header>

    <section className={styles.card}>
      <Link className={styles.secondaryButton} to="/holidays">Voltar ao calendário</Link>
    </section>

    <div className={styles.warning} role="note">
      O banco de horas gravado não é recalculado automaticamente ao criar ou remover uma regra.{' '}
      <Link to="/settings/work-logs">Recalcule o banco de horas</Link> dos usuários afetados.
    </div>

    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h2>Regras cadastradas</h2>
          <p className={styles.hint}>Uma regra por usuário vence a regra da empresa para aquele feriado.</p>
        </div>
        {loading && <span>Carregando...</span>}
      </div>

      {(error || message) && <p className={error ? styles.error : styles.success} role={error ? 'alert' : 'status'}>{error || message}</p>}
      {!loading && rules.length === 0 && <p className={styles.hint}>Nenhuma regra cadastrada.</p>}

      {rules.length > 0 && (
        <div className={styles.tableWrapper}>
          <table>
            <thead>
              <tr>
                <th scope="col">Feriado</th>
                <th scope="col">Data</th>
                <th scope="col">Aplica a</th>
                <th scope="col">Folga</th>
                <th scope="col">Ajuste de data</th>
                <th scope="col">Observações</th>
                <th scope="col">Aprovado por</th>
                <th scope="col">Quando</th>
                <th scope="col">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td>{rule.holidayName}</td>
                  <td>{formatShortDate(rule.holidayDate)}</td>
                  <td>{rule.userName || <span className={styles.badge}>Toda a empresa</span>}</td>
                  <td>{rule.dayOff ? 'Sim' : 'Não'}</td>
                  <td>
                    {rule.observedDate && <span className={styles.badge}>Folga em {formatShortDate(rule.observedDate)}</span>}
                    {rule.bridgeDate && <span className={styles.badge}>Emenda em {formatShortDate(rule.bridgeDate)}</span>}
                    {!rule.observedDate && !rule.bridgeDate && '—'}
                  </td>
                  <td>{rule.notes || '—'}</td>
                  <td>{rule.createdByName}</td>
                  <td>{formatMoment(rule.updatedAt)}</td>
                  <td>
                    <button type="button" className={styles.deleteButton} disabled={submitting} onClick={() => void remove(rule)}>
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  </main></MainLayout>
}

export default HolidayRulesPage
