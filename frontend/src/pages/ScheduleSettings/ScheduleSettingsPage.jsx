import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import MainLayout from '../../layouts/MainLayout'
import WorkDaysField from '../../components/WorkDaysField/WorkDaysField'
import { useDashboard } from '../../hooks/useDashboard'
import { formatTimeInput, formatWorkload } from '../../utils/formatTime'
import { DEFAULT_WORK_DAYS, normalizeWorkDays } from '../../utils/workDays'
import styles from './ScheduleSettingsPage.module.css'

function ScheduleSettingsPage() {
  const {
    dashboard,
    isLoading,
    isSubmitting,
    error,
    message,
    saveDailyWorkload,
  } = useDashboard()
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm()
  const [workDays, setWorkDays] = useState(DEFAULT_WORK_DAYS)
  const [workDaysError, setWorkDaysError] = useState('')

  const lunchEnabled = watch('lunchEnabled')

  useEffect(() => {
    if (!dashboard) {
      return
    }
    reset({
      standardEntryTime: formatTimeInput(dashboard.standardEntryTime),
      standardExitTime: formatTimeInput(dashboard.standardExitTime),
      lunchEnabled: dashboard.lunchEnabled ?? true,
      lunchDurationMinutes: dashboard.lunchDurationMinutes ?? 60,
    })
    setWorkDays(normalizeWorkDays(dashboard.workDays))
  }, [dashboard, reset])

  const onSubmit = async (values) => {
    if (!Array.isArray(workDays) || workDays.length === 0) {
      setWorkDaysError('Selecione pelo menos um dia de trabalho.')
      return
    }
    const selectedWorkDays = normalizeWorkDays(workDays)
    setWorkDaysError('')
    await saveDailyWorkload({
      standardEntryTime: values.standardEntryTime,
      standardExitTime: values.standardExitTime,
      lunchEnabled: Boolean(values.lunchEnabled),
      lunchDurationMinutes: Number(values.lunchDurationMinutes),
      workDays: selectedWorkDays,
    })
  }

  if (isLoading) {
    return (
      <MainLayout>
        <main className={styles.centered}><p>Carregando jornada...</p></main>
      </MainLayout>
    )
  }

  if (!dashboard) {
    return (
      <MainLayout>
        <main className={styles.centered}>
          <p role="alert">{error || 'Não foi possível carregar a jornada.'}</p>
        </main>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <main className={styles.page}>
        <header className={styles.header}>
          <h1>Jornada de trabalho</h1>
          <p className={styles.description}>
            Configure horários, almoço e dias úteis. A carga líquida atual é{' '}
            {formatWorkload(dashboard.dailyWorkloadMinutes)}.
          </p>
          <Link className={styles.backLink} to="/">Voltar ao Dashboard</Link>
        </header>

        <section className={styles.card} aria-labelledby="schedule-title">
          <h2 id="schedule-title">Configuração completa</h2>
          <form className={styles.form} onSubmit={handleSubmit(onSubmit)}>
            <div className={styles.timeFields}>
              <label htmlFor="scheduleEntryTime">
                Entrada padrão
                <input
                  id="scheduleEntryTime"
                  type="time"
                  disabled={isSubmitting}
                  {...register('standardEntryTime', { required: 'Informe o horário de entrada.' })}
                />
              </label>
              <label htmlFor="scheduleExitTime">
                Saída padrão
                <input
                  id="scheduleExitTime"
                  type="time"
                  disabled={isSubmitting}
                  {...register('standardExitTime', { required: 'Informe o horário de saída.' })}
                />
              </label>
            </div>

            <label className={styles.checkboxLabel} htmlFor="scheduleLunchEnabled">
              <input
                id="scheduleLunchEnabled"
                type="checkbox"
                disabled={isSubmitting}
                {...register('lunchEnabled')}
              />
              Usar horário de almoço
            </label>
            <label htmlFor="scheduleLunchDuration">
              Duração do almoço (minutos)
              <input
                id="scheduleLunchDuration"
                type="number"
                min="0"
                max="240"
                disabled={isSubmitting || !lunchEnabled}
                {...register('lunchDurationMinutes', {
                  required: lunchEnabled ? 'Informe a duração do almoço.' : false,
                  min: { value: 0, message: 'Mínimo de 0 minutos.' },
                  max: { value: 240, message: 'Máximo de 240 minutos.' },
                })}
              />
            </label>

            <WorkDaysField
              idPrefix="scheduleWorkDay"
              selectedDays={workDays}
              onChange={setWorkDays}
              disabled={isSubmitting}
            />

            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Salvando...' : 'Salvar jornada'}
            </button>

            {(errors.standardEntryTime || errors.standardExitTime || errors.lunchDurationMinutes || workDaysError) && (
              <p className={styles.fieldError}>
                {errors.standardEntryTime?.message
                  || errors.standardExitTime?.message
                  || errors.lunchDurationMinutes?.message
                  || workDaysError}
              </p>
            )}
          </form>
        </section>

        {(error || message) && (
          <p className={error ? styles.error : styles.success} role={error ? 'alert' : 'status'}>
            {error || message}
          </p>
        )}
      </main>
    </MainLayout>
  )
}

export default ScheduleSettingsPage
