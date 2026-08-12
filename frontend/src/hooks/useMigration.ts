import { useCallback, useState } from 'react'
import * as migrationService from '../services/migrationService'
import { getErrorMessage } from '../utils/errorMessage'
import type { ImportResult } from '../types/api'

export function useMigration() {
  const [isDownloading, setIsDownloading] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  const downloadTemplate = useCallback(async (format: 'csv' | 'xlsx') => {
    setIsDownloading(true)
    setError('')
    try {
      const blob = await migrationService.downloadTemplate(format)
      migrationService.triggerBrowserDownload(blob, `work-logs-template.${format}`)
      setMessage(`Modelo ${format.toUpperCase()} baixado.`)
    } catch (requestError) {
      setError(await getErrorMessage(requestError, 'Unable to download template'))
    } finally {
      setIsDownloading(false)
    }
  }, [])

  const importFile = useCallback(async (file: File) => {
    setIsImporting(true)
    setError('')
    setMessage('')
    setImportResult(null)
    try {
      const response = await migrationService.importWorkLogs(file)
      if (!response.success || !response.data) {
        throw new Error(response.message || 'Unable to import file')
      }
      setImportResult(response.data)
      setMessage(response.message)
      return true
    } catch (requestError) {
      setError(await getErrorMessage(requestError, 'Unable to import file'))
      return false
    } finally {
      setIsImporting(false)
    }
  }, [])

  return {
    isDownloading,
    isImporting,
    error,
    message,
    importResult,
    downloadTemplate,
    importFile,
  }
}
