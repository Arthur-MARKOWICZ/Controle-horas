export function errorMessage(error, fallback = 'Não foi possível concluir a operação.') {
  return error?.response?.data?.message || (error?.message === 'Network Error' ? 'Não foi possível conectar ao servidor.' : error?.message || fallback)
}
