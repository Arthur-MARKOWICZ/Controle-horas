import { useRef } from 'react'
import MainLayout from '../../layouts/MainLayout'
import { useMigration } from '../../hooks/useMigration'
import styles from './ImportPage.module.css'

function ImportPage() {
  const fileInputRef = useRef(null)
  const {
    isDownloading,
    isImporting,
    error,
    message,
    importResult,
    downloadTemplate,
    importFile,
  } = useMigration()

  const onFileChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    await importFile(file)
    event.target.value = ''
  }

  return (
    <MainLayout>
      <main className={styles.page}>
        <header className={styles.header}>
          <h1>Importação de ponto</h1>
          <p className={styles.description}>
            Baixe o modelo, preencha com registros de outro sistema e envie o arquivo CSV ou XLSX.
          </p>
        </header>

        <section className={styles.card} aria-labelledby="template-title">
          <h2 id="template-title">Arquivo modelo</h2>
          <p className={styles.description}>
            Colunas: email, entry_at, exit_at, close_reason (PAUSE, LUNCH ou EXIT).
          </p>
          <div className={styles.actions}>
            <button type="button" disabled={isDownloading} onClick={() => downloadTemplate('csv')}>
              Baixar modelo CSV
            </button>
            <button type="button" disabled={isDownloading} onClick={() => downloadTemplate('xlsx')}>
              Baixar modelo XLSX
            </button>
          </div>
        </section>

        <section className={styles.card} aria-labelledby="upload-title">
          <h2 id="upload-title">Enviar arquivo</h2>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx"
            aria-label="Arquivo de importação"
            disabled={isImporting}
            onChange={onFileChange}
          />
          <p className={styles.description}>
            {isImporting ? 'Importando...' : 'Selecione um arquivo .csv ou .xlsx.'}
          </p>
        </section>

        {(error || message) && (
          <p className={error ? styles.error : styles.success} role={error ? 'alert' : 'status'}>
            {error || message}
          </p>
        )}

        {importResult && (
          <section className={styles.card} aria-labelledby="result-title">
            <h2 id="result-title">Resultado</h2>
            <p className={styles.description}>
              Importados: {importResult.importedCount}. Erros: {importResult.errorCount}.
            </p>
            {importResult.errors?.length > 0 && (
              <div className={styles.tableWrapper}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Linha</th>
                      <th scope="col">Mensagem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResult.errors.map((item) => (
                      <tr key={`${item.row}-${item.message}`}>
                        <td>{item.row}</td>
                        <td>{item.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </MainLayout>
  )
}

export default ImportPage
