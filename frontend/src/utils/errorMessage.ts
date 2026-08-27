interface ErrorShape {
  message?: string
  response?: { data?: unknown }
}

const portugueseMessages: Record<string, string> = {
  'Invalid email or password': 'E-mail ou senha inválidos.',
  'Authentication is required': 'É necessário entrar para continuar.',
  'Access token is invalid or expired': 'Sua sessão expirou. Entre novamente.',
  'Refresh token is invalid or expired': 'Sua sessão expirou. Entre novamente.',
  'You do not have permission to perform this operation': 'Você não tem permissão para realizar esta operação.',
  'The operation conflicts with existing data.': 'A operação conflita com dados já existentes.',
  'Unable to connect to the server': 'Não foi possível conectar ao servidor.',
}

function messageFrom(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('message' in value)) return null
  return typeof value.message === 'string' ? value.message : null
}

function translate(message: string): string {
  return portugueseMessages[message] || message
}

export async function getErrorMessage(error: unknown, fallback = 'Something went wrong'): Promise<string> {
  const shaped = error as ErrorShape | null
  const data = shaped?.response?.data
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      const parsed: unknown = JSON.parse(await data.text())
      const parsedMessage = messageFrom(parsed)
      if (parsedMessage) return translate(parsedMessage)
    } catch { /* Fall through to other error sources. */ }
  }
  const responseMessage = messageFrom(data)
  if (responseMessage) return translate(responseMessage)
  if (shaped?.message === 'Network Error') return 'Não foi possível conectar ao servidor.'
  return shaped?.message ? translate(shaped.message) : fallback
}
