import type { ApiResponse, AuthData } from '../types/api'

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL || ''
const baseUrl = configuredBaseUrl.replace(/\/$/, '').replace(/\/api$/, '')
let accessToken: string | null = null
let refreshRequest: Promise<AuthData | null> | null = null
let unauthorizedHandler: (() => void) | null = null
let refreshedHandler: ((session: AuthData) => void) | null = null

export class ApiError extends Error {
  constructor(readonly status: number, readonly payload: unknown, message: string) { super(message) }
}

export function setAccessToken(token: string | null): void { accessToken = token }
export function getAccessToken(): string | null { return accessToken }
export function setUnauthorizedHandler(handler: (() => void) | null): void { unauthorizedHandler = handler }
export function setRefreshedHandler(handler: ((session: AuthData) => void) | null): void { refreshedHandler = handler }

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || ''
  const payload: unknown = contentType.includes('application/json') ? await response.json() : await response.text()
  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'message' in payload
      ? String((payload as { message: unknown }).message) : `Request failed with status ${response.status}`
    throw new ApiError(response.status, payload, message)
  }
  return payload as T
}

async function rawRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers, credentials: 'include' })
  return parseResponse<T>(response)
}

export async function refreshSession(): Promise<AuthData | null> {
  if (!refreshRequest) {
    refreshRequest = rawRequest<ApiResponse<AuthData>>('/api/auth/refresh', { method: 'POST' })
      .then((response) => {
        if (!response.success || !response.data) return null
        setAccessToken(response.data.token)
        refreshedHandler?.(response.data)
        return response.data
      })
      .catch(() => { setAccessToken(null); unauthorizedHandler?.(); return null })
      .finally(() => { refreshRequest = null })
  }
  return refreshRequest
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  try { return await rawRequest<T>(path, init) }
  catch (error) {
    if (retry && error instanceof ApiError && error.status === 401 && !path.startsWith('/api/auth/')) {
      const session = await refreshSession()
      if (session) return rawRequest<T>(path, init)
    }
    throw error
  }
}

export async function apiBlob(path: string): Promise<Blob> {
  const headers = new Headers(accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined)
  let response = await fetch(`${baseUrl}${path}`, { headers, credentials: 'include' })
  if (response.status === 401 && await refreshSession()) {
    headers.set('Authorization', `Bearer ${accessToken}`)
    response = await fetch(`${baseUrl}${path}`, { headers, credentials: 'include' })
  }
  if (!response.ok) await parseResponse(response)
  return response.blob()
}
