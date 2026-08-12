import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiBlob, apiRequest, getAccessToken, setAccessToken } from './api'

const session = {
  token: 'new-access', userId: 'id', name: 'User', email: 'user@example.com', role: 'USER' as const,
  accessTokenExpiresAt: '2026-08-11T12:15:00Z', refreshTokenExpiresAt: '2026-09-10T12:00:00Z',
}
function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })
}

describe('fetch API client', () => {
  beforeEach(() => { setAccessToken(null) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('keeps the access token in memory and sends it as Bearer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ success: true }))
    vi.stubGlobal('fetch', fetchMock); setAccessToken('memory-token')
    await apiRequest('/api/dashboard/today')
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer memory-token')
  })

  it('renews and retries an unauthorized request only once', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ success: false, message: 'expired', data: null }, 401))
      .mockResolvedValueOnce(json({ success: true, message: 'refreshed', data: session }))
      .mockResolvedValueOnce(json({ success: true, data: { date: '2026-08-11' } }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(apiRequest('/api/dashboard/today')).resolves.toMatchObject({ success: true })
    expect(fetchMock).toHaveBeenCalledTimes(3); expect(getAccessToken()).toBe('new-access')
  })

  it('shares one refresh request between concurrent 401 responses', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/auth/refresh')) return json({ success: true, message: 'ok', data: session })
      const callCount = fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/api/dashboard/today')).length
      return callCount <= 2 ? json({ success: false, message: 'expired', data: null }, 401) : json({ success: true, data: {} })
    })
    vi.stubGlobal('fetch', fetchMock)
    await Promise.all([apiRequest('/api/dashboard/today'), apiRequest('/api/dashboard/today')])
    expect(fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/api/auth/refresh'))).toHaveLength(1)
  })

  it('parses JSON errors returned by download endpoints', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ success: false, message: 'Export denied', data: null }, 403)))
    await expect(apiBlob('/api/history/export.pdf')).rejects.toEqual(expect.objectContaining({
      status: 403, message: 'Export denied',
    }))
  })
})
