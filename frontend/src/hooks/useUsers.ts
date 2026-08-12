import { useCallback, useEffect, useRef, useState } from 'react'
import * as userService from '../services/userService'
import { getErrorMessage } from '../utils/errorMessage'
import type { ManagedUser } from '../types/api'

export function useUsers() {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const initialLoadStartedRef = useRef(false)

  const loadUsers = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const response = await userService.listUsers()
      if (!response.success || !response.data) {
        throw new Error(response.message || 'Unable to load users')
      }
      setUsers(response.data)
    } catch (requestError) {
      setError(await getErrorMessage(requestError, 'Unable to load users'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (initialLoadStartedRef.current) return
    initialLoadStartedRef.current = true
    void loadUsers()
  }, [loadUsers])

  const createUser = useCallback(async (payload: Record<string, unknown>) => {
    setIsSubmitting(true)
    setError('')
    setMessage('')
    try {
      const response = await userService.createUser(payload)
      if (!response.success || !response.data) {
        throw new Error(response.message || 'Unable to create user')
      }
      setMessage(response.message)
      await loadUsers()
      return true
    } catch (requestError) {
      setError(await getErrorMessage(requestError, 'Unable to create user'))
      return false
    } finally {
      setIsSubmitting(false)
    }
  }, [loadUsers])

  const updateUser = useCallback(async (userId: string, payload: Record<string, unknown>) => {
    setIsSubmitting(true)
    setError('')
    setMessage('')
    try {
      const response = await userService.updateUser(userId, payload)
      if (!response.success || !response.data) {
        throw new Error(response.message || 'Unable to update user')
      }
      setMessage(response.message)
      await loadUsers()
      return true
    } catch (requestError) {
      setError(await getErrorMessage(requestError, 'Unable to update user'))
      return false
    } finally {
      setIsSubmitting(false)
    }
  }, [loadUsers])

  const assignManager = useCallback(async (userId: string, managerId: string | null) => {
    setIsSubmitting(true)
    setError('')
    setMessage('')
    try {
      const response = await userService.assignManager(userId, managerId)
      if (!response.success || !response.data) {
        throw new Error(response.message || 'Unable to assign manager')
      }
      setMessage(response.message)
      await loadUsers()
      return true
    } catch (requestError) {
      setError(await getErrorMessage(requestError, 'Unable to assign manager'))
      return false
    } finally {
      setIsSubmitting(false)
    }
  }, [loadUsers])

  return {
    users,
    isLoading,
    isSubmitting,
    error,
    message,
    loadUsers,
    createUser,
    updateUser,
    assignManager,
  }
}
