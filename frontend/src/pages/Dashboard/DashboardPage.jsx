import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import MainLayout from '../../layouts/MainLayout'
import { useDashboard } from '../../hooks/useDashboard'
import {
  formatDisplayDate,
  formatInstantTime,
  formatSignedDuration,
  formatTimeInput,
  formatWorkload,
} from '../../utils/formatTime'
import styles from './DashboardPage.module.css'

function DashboardPage() {
  const { dashboard, isLoading, isSubmitting, error, message, register, saveDailyWorkload } = useDashboard()
  const { register: registerField, handleSubmit, reset, formState: { errors } } = useForm()

  useEffect(() => {
    if (dashboard) {
      reset({
        standardEntryTime: formatTimeInput(dashboard.standardEntryTime),
        standardExitTime: formatTimeInput(dashboard.standardExitTime),
      })
    }
  }, [dashboard, reset])

  const onSubmitWorkload = async ({ standardEntryTime, standardExitTime }) => {
    await saveDailyWorkload({ standardEntryTime, standardExitTime })
  }

  if (isLoading) {
    return (
      <MainLayout>
        <main className={styles.centered}><p>Carregando Dashboard...</p></main>
      </MainLayout>
    )
  }

  if (!dashboard) {
    return (
      <MainLayout>
        <main className={styles.centered}>
          <p role="alert">{error || 'Não foi possível carregar o Dashboard.'}</p>
        </main>
      </MainLayout>
    )
  }

  const isExitAction = dashboard.nextAction === 'EXIT'

  return (
    <MainLayout>
      <main className={styles.page}>
        <p className={styles.date}>{formatDisplayDate(dashboard.date)}</p>

        <section className={styles.summaryGrid} aria-label="Resumo do dia">
          <article className={styles.summaryCard}>
            <h2>Saída prevista</h2>
            <p className={styles.summaryValue}>
              {dashboard.expectedExitAt ? formatInstantTime(dashboard.expectedExitAt) : '—'}
            </p>
          </article>
          <article className={styles.summaryCard}>
            <h2>Horas hoje</h2>
            <p className={styles.summaryValue}>{formatWorkload(dashboard.workedMinutesToday ?? 0)}</p>
          </article>
          <article className={styles.summaryCard}>
            <h2>Saldo do dia</h2>
            <p className={styles.summaryValue}>{formatSignedDuration(dashboard.balanceMinutesToday ?? 0)}</p>
          </article>
          <article className={styles.summaryCard}>
            <h2>Banco de horas</h2>
            <p className={styles.summaryValue}>{formatSignedDuration(dashboard.hourBankMinutes ?? 0)}</p>
          </article>
        </section>

        <section className={styles.grid} aria-label="Registro de ponto">
          <article className={styles.card}>
            <h2>Registro de ponto</h2>
            <p className={styles.description}>
              {isExitAction ? 'Sua entrada está em andamento.' : 'Você não possui uma jornada aberta.'}
            </p>
            <button className={styles.actionButton} type="button" onClick={register} disabled={isSubmitting}>
              {isSubmitting ? 'Registrando...' : isExitAction ? 'Registrar saída' : 'Registrar entrada'}
            </button>
          </article>

          <article className={styles.card}>
            <h2>Carga diária</h2>
            <p className={styles.description}>
              Defina sua entrada e saída padrão. Atual: {formatTimeInput(dashboard.standardEntryTime)} às {formatTimeInput(dashboard.standardExitTime)} ({formatWorkload(dashboard.dailyWorkloadMinutes)}).
            </p>
            <form className={styles.workloadForm} onSubmit={handleSubmit(onSubmitWorkload)}>
              <div className={styles.timeFields}>
                <label htmlFor="standardEntryTime">
                  Entrada padrão
                  <input
                    id="standardEntryTime"
                    type="time"
                    disabled={isSubmitting}
                    {...registerField('standardEntryTime', { required: 'Informe o horário de entrada.' })}
                  />
                </label>
                <label htmlFor="standardExitTime">
                  Saída padrão
                  <input
                    id="standardExitTime"
                    type="time"
                    disabled={isSubmitting}
                    {...registerField('standardExitTime', { required: 'Informe o horário de saída.' })}
                  />
                </label>
              </div>
              <button type="submit" disabled={isSubmitting}>Salvar</button>
              {(errors.standardEntryTime || errors.standardExitTime) && (
                <p className={styles.fieldError}>{errors.standardEntryTime?.message || errors.standardExitTime?.message}</p>
              )}
            </form>
          </article>
        </section>

        {(error || message) && (
          <p className={error ? styles.error : styles.success} role={error ? 'alert' : 'status'}>
            {error || message}
          </p>
        )}

        <section className={styles.tableCard} aria-labelledby="records-title">
          <div className={styles.tableHeader}>
            <h2 id="records-title">Registros de hoje</h2>
            <span>{dashboard.workLogs.length} {dashboard.workLogs.length === 1 ? 'registro' : 'registros'}</span>
          </div>
          {dashboard.workLogs.length === 0 ? (
            <p className={styles.empty}>Nenhum horário registrado hoje.</p>
          ) : (
            <div className={styles.tableWrapper}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Entrada</th>
                    <th scope="col">Saída</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.workLogs.map((workLog) => (
                    <tr key={workLog.id}>
                      <td>{formatInstantTime(workLog.entryAt)}</td>
                      <td>{workLog.exitAt ? formatInstantTime(workLog.exitAt) : 'Em andamento'}</td>
                      <td>
                        <span className={workLog.exitAt ? styles.completed : styles.open}>
                          {workLog.exitAt ? 'Concluído' : 'Em andamento'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </MainLayout>
  )
}

export default DashboardPage
