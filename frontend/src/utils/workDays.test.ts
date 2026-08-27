import { describe, expect, it } from 'vitest'
import { DEFAULT_WORK_DAYS, normalizeWorkDays } from './workDays'

describe('normalizeWorkDays', () => {
  it('keeps valid values once and preserves their order', () => {
    expect(normalizeWorkDays(['MONDAY', 'MONDAY', 'SUNDAY', 'INVALID'])).toEqual(['MONDAY', 'SUNDAY'])
  })

  it.each([null, undefined, {}, []])('returns an empty list for invalid input %s', (value) => {
    expect(normalizeWorkDays(value)).toEqual([])
  })

  it('provides a Monday-to-Friday default', () => {
    expect(DEFAULT_WORK_DAYS).toEqual(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'])
  })
})
