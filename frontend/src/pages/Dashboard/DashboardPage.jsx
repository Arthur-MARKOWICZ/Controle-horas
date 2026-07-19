import { useEffect } from 'react'
import { Link } from 'react-router-dom'
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
import { normalizeWorkDays } from '../../utils/workDays'
import styles from './DashboardPage.module.css'

function resolveStatusLabel(workLog) {
  if (!workLog.exitAt) {
    return 'Em andamento'
  }
  if (workLog.closeReason === 'LUNCH') {
    return 'Almoço'
  }
  if (workLog.closeReason === 'PAUSE') {
    return 'Pausa'
  }
  return 'Saída'
}

function DashboardPage() {
  const {
    dashboard,
    isLoading,
    isSubmitting,
    error,
    message,
    registerEntry,
    registerPause,
    registerLunch,
    registerResume,
    registerExit,
    saveDailyWorkload,
  } = useDashboard()
  const {
    register: registerField,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm()

  useEffect(() => {
    if (dashboard) {
      reset({
        standardEntryTime: formatTimeInput(dashboard.standardEntryTime),
        standardExitTime: formatTimeInput(dashboard.standardExitTime),
      })
    }
  }, [dashboard, reset])

  const onSubmitWorkload = async (values) => {
    await saveDailyWorkload({
      standardEntryTime: values.standardEntryTime,
      standardExitTime: values.standardExitTime,
      lunchEnabled: Boolean(dashboard.lunchEnabled),
      lunchDurationMinutes: Number(dashboard.lunchDurationMinutes ?? 60),
      workDays: normalizeWorkDays(dashboard.workDays),
    })
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

  const nextAction = dashboard.nextAction
  const showLunchAction = dashboard.lunchEnabled === true

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
            <h2>Tempo em pausa</h2>
            <p className={styles.summaryValue}>{formatWorkload(dashboard.pausedMinutesToday ?? 0)}</p>
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
            {nextAction === 'ENTRY' && (
              <>
                <p className={styles.description}>Você não possui uma jornada aberta.</p>
                <button className={styles.actionButton} type="button" onClick={registerEntry} disabled={isSubmitting}>
                  {isSubmitting ? 'Registrando...' : 'Registrar entrada'}
                </button>
              </>
            )}
            {nextAction === 'PAUSE_OR_EXIT' && (
              <>
                <p className={styles.description}>Sua entrada está em andamento.</p>
                <div className={styles.actionGroup}>
                  <button className={styles.secondaryAction} type="button" onClick={registerPause} disabled={isSubmitting}>
                    Pausar
                  </button>
                  {showLunchAction && (
                    <button className={styles.secondaryAction} type="button" onClick={registerLunch} disabled={isSubmitting}>
                      Almoço
                    </button>
                  )}
                  <button className={styles.actionButton} type="button" onClick={registerExit} disabled={isSubmitting}>
                    Registrar saída
                  </button>
                </div>
              </>
            )}
            {nextAction === 'RESUME' && (
              <>
                <p className={styles.description}>Você está em pausa ou almoço.</p>
                <button className={styles.actionButton} type="button" onClick={registerResume} disabled={isSubmitting}>
                  {isSubmitting ? 'Registrando...' : 'Retomar'}
                </button>
              </>
            )}
          </article>

          <article className={styles.card}>
            <h2>Horário padrão</h2>
            <p className={styles.description}>
              Ajuste entrada e saída. Carga atual: {formatWorkload(dashboard.dailyWorkloadMinutes)}.
              {' '}
              <Link className={styles.settingsLink} to="/settings/schedule">Editar jornada completa</Link>
            </p>
            <form className={styles.workloadForm} onSubmit={handleSubmit(onSubmitWorkload)}>
              <div className={styles.timeFields}>
                <label htmlFor="standardEntryTime">
                  Entrada
                  <input
                    id="standardEntryTime"
                    type="time"
                    disabled={isSubmitting}
                    {...registerField('standardEntryTime', { required: 'Informe o horário de entrada.' })}
                  />
                </label>
                <label htmlFor="standardExitTime">
                  Saída
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
                <p className={styles.fieldError}>
                  {errors.standardEntryTime?.message || errors.standardExitTime?.message}
                </p>
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
                          {resolveStatusLabel(workLog)}
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
