import { describe, expect, it } from 'vitest'
import { getErrorMessage } from './errorMessage'

describe('getErrorMessage', () => {
  it('translates safe API messages to Portuguese', async () => {
    await expect(getErrorMessage({ response: { data: { message: 'Invalid email or password' } } }))
      .resolves.toBe('E-mail ou senha inválidos.')
  })

  it('keeps a specific validation message returned by the API', async () => {
    await expect(getErrorMessage({ response: { data: { message: 'A data inicial é inválida.' } } }))
      .resolves.toBe('A data inicial é inválida.')
  })

  it('returns a clear Portuguese message for network errors', async () => {
    await expect(getErrorMessage({ message: 'Network Error' })).resolves.toBe('Não foi possível conectar ao servidor.')
  })
})
