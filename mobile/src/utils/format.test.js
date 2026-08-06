import { formatSignedDuration, formatWorkload } from './format'

describe('formatters', () => {
  it('formats workloads and signed balances', () => {
    expect(formatWorkload(530)).toBe('8h50')
    expect(formatSignedDuration(-15)).toBe('-0h15')
    expect(formatSignedDuration(20)).toBe('+0h20')
  })
})
