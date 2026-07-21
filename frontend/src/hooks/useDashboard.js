import { useCallback, useEffect, useRef, useState } from 'react'
import * as dashboardService from '../services/dashboardService'
import { getErrorMessage } from '../utils/errorMessage'

const OPEN_SESSION_POLL_INTERVAL_MS = 30_000

export function useDashboard() {
  const [dashboard, setDashboard] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const isSubmittingRef = useRef(false)

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setIsLoading(true)
    }
    setError('')
    try {
      const response = await dashboardService.getTodayDashboard()
      if (!response.success || !response.data) throw new Error(response.message || 'Unable to load dashboard')
      setDashboard(response.data)
    } catch (requestError) {
      setError(await getErrorMessage(requestError, 'Unable to load dashboard'))
    } finally {
      if (!silent) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => { loadDashboard() }, [loadDashboard])

  useEffect(() => {
    isSubmittingRef.current = isSubmitting
  }, [isSubmitting])

  useEffect(() => {
    const hasOpenSession = dashboard?.nextAction === 'PAUSE_OR_EXIT'
    if (!hasOpenSession) {
      return undefined
    }

    const intervalId = window.setInterval(() => {
      if (!isSubmittingRef.current) {
        loadDashboard({ silent: true })
      }
    }, OPEN_SESSION_POLL_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [dashboard?.nextAction, loadDashboard])

  const runAction = useCallback(async (action) => {
    setIsSubmitting(true)
    setError('')
    setMessage('')
    try {
      const response = await action()
      if (!response.success || !response.data) throw new Error(response.message || 'Unable to register time')
      setDashboard(response.data)
      setMessage(response.message)
    } catch (requestError) {
      setError(await getErrorMessage(requestError, 'Unable to register time'))
    } finally {
      setIsSubmitting(false)
    }
  }, [])

  const registerEntry = useCallback(() => runAction(dashboardService.registerEntry), [runAction])
  const registerPause = useCallback(() => runAction(dashboardService.registerPause), [runAction])
  const registerLunch = useCallback(() => runAction(dashboardService.registerLunch), [runAction])
  const registerResume = useCallback(() => runAction(dashboardService.registerResume), [runAction])
  const registerExit = useCallback(() => runAction(dashboardService.registerExit), [runAction])

  const saveDailyWorkload = useCallback(async ({
    standardEntryTime,
    standardExitTime,
    lunchEnabled,
    lunchDurationMinutes,
    workDays,
  }) => {
    setIsSubmitting(true)
    setError('')
    setMessage('')
    try {
      const response = await dashboardService.updateDailyWorkload({
        standardEntryTime,
        standardExitTime,
        lunchEnabled,
        lunchDurationMinutes: Number(lunchDurationMinutes),
        workDays,
      })
      if (!response.success || !response.data) throw new Error(response.message || 'Unable to save daily workload')
      const dashboardResponse = await dashboardService.getTodayDashboard()
      if (!dashboardResponse.success || !dashboardResponse.data) {
        throw new Error(dashboardResponse.message || 'Unable to refresh dashboard')
      }
      setDashboard(dashboardResponse.data)
      setMessage(response.message)
      return true
    } catch (requestError) {
      setError(await getErrorMessage(requestError, 'Unable to save daily workload'))
      return false
    } finally {
      setIsSubmitting(false)
    }
  }, [])

  return {
    dashboard,
    isLoading,
    isSubmitting,
    error,
    message,
    loadDashboard,
    registerEntry,
    registerPause,
    registerLunch,
    registerResume,
    registerExit,
    saveDailyWorkload,
  }
}
