import { useCallback, useEffect, useState } from 'react'
import * as historyService from '../services/historyService'
import { getErrorMessage } from '../utils/errorMessage'
import { getCurrentMonthRange } from '../utils/formatTime'

export function useHistory(initialRange = getCurrentMonthRange()) {
  const [history, setHistory] = useState(null)
  const [startDate, setStartDate] = useState(initialRange.startDate)
  const [endDate, setEndDate] = useState(initialRange.endDate)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const loadHistory = useCallback(async (nextStartDate, nextEndDate) => {
    setIsLoading(true)
    setError('')
    try {
      const response = await historyService.getHistory(nextStartDate, nextEndDate)
      if (!response.success || !response.data) {
        throw new Error(response.message || 'Unable to load history')
      }
      setHistory(response.data)
      setStartDate(nextStartDate)
      setEndDate(nextEndDate)
    } catch (requestError) {
      setHistory(null)
      setError(getErrorMessage(requestError, 'Unable to load history'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHistory(initialRange.startDate, initialRange.endDate)
  }, [initialRange.endDate, initialRange.startDate, loadHistory])

  return {
    history,
    startDate,
    endDate,
    isLoading,
    error,
    loadHistory,
  }
}
