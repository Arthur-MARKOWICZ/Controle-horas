export function getErrorMessage(error, fallback = 'Something went wrong') {
  const apiMessage = error?.response?.data?.message
  if (apiMessage) {
    return apiMessage
  }

  if (error?.message === 'Network Error') {
    return 'Unable to connect to the server'
  }

  return error?.message || fallback
}
