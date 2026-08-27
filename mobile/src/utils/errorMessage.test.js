import { errorMessage } from './errorMessage'

describe('errorMessage', () => {
  test('translates authentication failures without exposing which credential failed', () => {
    expect(errorMessage({ response: { data: { message: 'Invalid email or password' } } })).toBe('E-mail ou senha inválidos.')
  })

  test('preserves a specific Portuguese validation message', () => {
    expect(errorMessage({ response: { data: { message: 'Data final inválida.' } } })).toBe('Data final inválida.')
  })

  test('returns a clear connection error', () => {
    expect(errorMessage({ message: 'Network Error' })).toBe('Não foi possível conectar ao servidor.')
  })
})
