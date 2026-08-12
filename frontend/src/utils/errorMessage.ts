interface ErrorShape {
  message?: string
  response?: { data?: unknown }
}

function messageFrom(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('message' in value)) return null
  return typeof value.message === 'string' ? value.message : null
}

export async function getErrorMessage(error: unknown, fallback = 'Something went wrong'): Promise<string> {
  const shaped = error as ErrorShape | null
  const data = shaped?.response?.data
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      const parsed: unknown = JSON.parse(await data.text())
      const parsedMessage = messageFrom(parsed)
      if (parsedMessage) return parsedMessage
    } catch { /* Fall through to other error sources. */ }
  }
  const responseMessage = messageFrom(data)
  if (responseMessage) return responseMessage
  if (shaped?.message === 'Network Error') return 'Unable to connect to the server'
  return shaped?.message || fallback
}
