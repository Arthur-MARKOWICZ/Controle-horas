import { useCallback, useEffect, useState } from 'react'
import * as dashboardService from '../services/dashboardService'
import { getErrorMessage } from '../utils/errorMessage'

export function useDashboard() {
  const [dashboard, setDashboard] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadDashboard = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const response = await dashboardService.getTodayDashboard()
      if (!response.success || !response.data) throw new Error(response.message || 'Unable to load dashboard')
      setDashboard(response.data)
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to load dashboard'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { loadDashboard() }, [loadDashboard])

  const register = useCallback(async () => {
    setIsSubmitting(true)
    setError('')
    setMessage('')
    try {
      const action = dashboard?.nextAction === 'EXIT'
        ? dashboardService.registerExit
        : dashboardService.registerEntry
      const response = await action()
      if (!response.success || !response.data) throw new Error(response.message || 'Unable to register time')
      setDashboard(response.data)
      setMessage(response.message)
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to register time'))
    } finally {
      setIsSubmitting(false)
    }
  }, [dashboard?.nextAction])

  const saveDailyWorkload = useCallback(async ({ standardEntryTime, standardExitTime }) => {
    setIsSubmitting(true)
    setError('')
    setMessage('')
    try {
      const response = await dashboardService.updateDailyWorkload(standardEntryTime, standardExitTime)
      if (!response.success || !response.data) throw new Error(response.message || 'Unable to save daily workload')
      const dashboardResponse = await dashboardService.getTodayDashboard()
      if (!dashboardResponse.success || !dashboardResponse.data) {
        throw new Error(dashboardResponse.message || 'Unable to refresh dashboard')
      }
      setDashboard(dashboardResponse.data)
      setMessage(response.message)
      return true
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to save daily workload'))
      return false
    } finally {
      setIsSubmitting(false)
    }
  }, [])

  return { dashboard, isLoading, isSubmitting, error, message, loadDashboard, register, saveDailyWorkload }
}
