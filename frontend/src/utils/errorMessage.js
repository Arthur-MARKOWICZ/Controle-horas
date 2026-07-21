export async function getErrorMessage(error, fallback = 'Something went wrong') {
  const data = error?.response?.data

  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      const text = await data.text()
      const parsed = JSON.parse(text)
      if (parsed?.message) {
        return parsed.message
      }
    } catch {
      // Fall through to other error sources.
    }
  }

  if (data && typeof data === 'object' && data.message) {
    return data.message
  }

  if (error?.message === 'Network Error') {
    return 'Unable to connect to the server'
  }

  return error?.message || fallback
}
