const translations = {
  'Invalid email or password': 'E-mail ou senha inválidos.',
  'Authentication is required': 'É necessário entrar para continuar.',
  'Access token is invalid or expired': 'Sua sessão expirou. Entre novamente.',
  'Refresh token is invalid or expired': 'Sua sessão expirou. Entre novamente.',
  'You do not have permission to perform this operation': 'Você não tem permissão para realizar esta operação.',
  'The operation conflicts with existing data.': 'A operação conflita com dados já existentes.',
}

function translate(message) { return translations[message] || message }

export function errorMessage(error, fallback = 'Não foi possível concluir a operação.') {
  const message = error?.response?.data?.message || error?.message
  if (message === 'Network Error') return 'Não foi possível conectar ao servidor.'
  return message ? translate(message) : fallback
}
