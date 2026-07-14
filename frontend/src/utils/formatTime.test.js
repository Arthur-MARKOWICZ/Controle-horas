import { describe, expect, it } from 'vitest'
import {
  formatSignedDuration,
  formatWorkload,
  getCurrentMonthRange,
} from './formatTime'

describe('formatTime', () => {
  it('formats workload and signed durations', () => {
    expect(formatWorkload(530)).toBe('8h50')
    expect(formatSignedDuration(30)).toBe('+0h30')
    expect(formatSignedDuration(-30)).toBe('-0h30')
    expect(formatSignedDuration(0)).toBe('0h00')
  })

  it('returns the current month range', () => {
    expect(getCurrentMonthRange(new Date('2026-07-14T12:00:00'))).toEqual({
      startDate: '2026-07-01',
      endDate: '2026-07-31',
    })
  })
})
