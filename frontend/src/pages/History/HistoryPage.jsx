import { useForm } from 'react-hook-form'
import MainLayout from '../../layouts/MainLayout'
import { useHistory } from '../../hooks/useHistory'
import {
  formatShortDate,
  formatSignedDuration,
  formatInstantTime,
  formatWorkload,
} from '../../utils/formatTime'
import styles from './HistoryPage.module.css'

function HistoryPage() {
  const {
    history,
    startDate,
    endDate,
    isLoading,
    isExporting,
    error,
    exportError,
    loadHistory,
    exportHistory,
  } = useHistory()
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { startDate, endDate },
  })

  const onSubmit = async ({ startDate: nextStartDate, endDate: nextEndDate }) => {
    await loadHistory(nextStartDate, nextEndDate)
  }

  return (
    <MainLayout>
      <main className={styles.page}>
        <header className={styles.header}>
          <h1>Histórico</h1>
          <p className={styles.description}>Consulte os dias trabalhados por período.</p>
        </header>

        <section className={styles.filterCard} aria-label="Filtro de período">
          <form className={styles.filterForm} onSubmit={handleSubmit(onSubmit)}>
            <label htmlFor="startDate">
              Data inicial
              <input
                id="startDate"
                type="date"
                disabled={isLoading || isExporting}
                {...register('startDate', { required: 'Informe a data inicial.' })}
              />
            </label>
            <label htmlFor="endDate">
              Data final
              <input
                id="endDate"
                type="date"
                disabled={isLoading || isExporting}
                {...register('endDate', { required: 'Informe a data final.' })}
              />
            </label>
            <div className={styles.filterActions}>
              <button type="submit" disabled={isLoading || isExporting}>
                {isLoading ? 'Carregando...' : 'Filtrar'}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={isLoading || isExporting || !history}
                onClick={() => exportHistory('xlsx')}
              >
                {isExporting ? 'Exportando...' : 'Exportar Excel'}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={isLoading || isExporting || !history}
                onClick={() => exportHistory('pdf')}
              >
                {isExporting ? 'Exportando...' : 'Exportar PDF'}
              </button>
            </div>
          </form>
          {(errors.startDate || errors.endDate) && (
            <p className={styles.fieldError}>{errors.startDate?.message || errors.endDate?.message}</p>
          )}
        </section>

        {(error || exportError) && (
          <p className={styles.error} role="alert">{error || exportError}</p>
        )}

        {isLoading && !history && (
          <p className={styles.loading}>Carregando histórico...</p>
        )}

        {history && (
          <>
            <section className={styles.summaryGrid} aria-label="Resumo do período">
              <article className={styles.summaryCard}>
                <h2>Horas trabalhadas</h2>
                <p className={styles.summaryValue}>{formatWorkload(history.totalWorkedMinutes)}</p>
              </article>
              <article className={styles.summaryCard}>
                <h2>Saldo do período</h2>
                <p className={styles.summaryValue}>{formatSignedDuration(history.totalBalanceMinutes)}</p>
              </article>
              <article className={styles.summaryCard}>
                <h2>Banco de horas</h2>
                <p className={styles.summaryValue}>{formatSignedDuration(history.hourBankMinutes)}</p>
              </article>
            </section>

            <section className={styles.tableCard} aria-labelledby="history-title">
              <div className={styles.tableHeader}>
                <h2 id="history-title">Dias do período</h2>
                <span>
                  {history.days.length} {history.days.length === 1 ? 'dia' : 'dias'}
                </span>
              </div>

              {history.days.length === 0 ? (
                <p className={styles.empty}>Nenhum registro encontrado no período.</p>
              ) : (
                <div className={styles.tableWrapper}>
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Data</th>
                        <th scope="col">Primeira entrada</th>
                        <th scope="col">Última saída</th>
                        <th scope="col">Horas trabalhadas</th>
                        <th scope="col">Pausa</th>
                        <th scope="col">Saldo</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.days.map((day) => (
                        <tr key={day.date}>
                          <td>{formatShortDate(day.date)}</td>
                          <td>{formatInstantTime(day.firstEntryAt)}</td>
                          <td>{formatInstantTime(day.lastExitAt)}</td>
                          <td>{formatWorkload(day.workedMinutes)}</td>
                          <td>{formatWorkload(day.pausedMinutes ?? 0)}</td>
                          <td>{formatSignedDuration(day.balanceMinutes)}</td>
                          <td>
                            <span className={day.isComplete ? styles.completed : styles.open}>
                              {day.isComplete ? 'Completo' : 'Em andamento'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </MainLayout>
  )
}

export default HistoryPage
