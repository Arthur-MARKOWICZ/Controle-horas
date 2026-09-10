import { describe, expect, it } from 'vitest'
import type { Holiday } from '../src/domain/types.js'
import type { HolidayCalendarEntry } from '../src/shared/holiday-calendar.js'
import {
  EMPTY_HOLIDAY_CALENDAR, NO_HOLIDAY_CALENDAR, buildHolidayCalendar,
} from '../src/shared/holiday-calendar.js'
import { effectiveWorkload } from '../src/shared/time.js'

function entry(overrides: Partial<HolidayCalendarEntry> = {}): HolidayCalendarEntry {
  return { holiday: holiday(), dayOff: true, ruleId: null, observedDate: null, bridgeDate: null, ...overrides }
}

function holiday(overrides: Partial<Holiday> = {}): Holiday {
  return {
    id: 'holiday-1', organizationId: null, countryCode: 'BR', subdivisionCode: null,
    date: '2026-09-07', name: 'Dia da Independência', scope: 'NATIONAL', source: 'NAGER', ...overrides,
  }
}

describe('HolidayCalendar', () => {
  it('reports a day off and the holiday that caused it', () => {
    const calendar = buildHolidayCalendar([entry()])
    expect(calendar.isDayOff('2026-09-07')).toBe(true)
    expect(calendar.dayOn('2026-09-07')?.holiday.name).toBe('Dia da Independência')
  })

  it('reports a holiday that is not a day off', () => {
    const state = holiday({ id: 'holiday-2', date: '2026-07-09', scope: 'SUBDIVISION', subdivisionCode: 'BR-SP' })
    const calendar = buildHolidayCalendar([entry({ holiday: state, dayOff: false })])
    expect(calendar.isDayOff('2026-07-09')).toBe(false)
    expect(calendar.dayOn('2026-07-09')?.holiday.scope).toBe('SUBDIVISION')
  })

  it('knows nothing about dates it was not given', () => {
    const calendar = buildHolidayCalendar([entry()])
    expect(calendar.isDayOff('2026-09-08')).toBe(false)
    expect(calendar.dayOn('2026-09-08')).toBeNull()
  })

  it('keeps a date off when two holidays land on it and only one is a day off', () => {
    const calendar = buildHolidayCalendar([
      entry({ holiday: holiday({ id: 'a', scope: 'SUBDIVISION', subdivisionCode: 'BR-SP' }), dayOff: false }),
      entry({ holiday: holiday({ id: 'b' }) }),
    ])
    expect(calendar.isDayOff('2026-09-07')).toBe(true)
    expect(calendar.dayOn('2026-09-07')?.holiday.id).toBe('b')
  })

  it('lists one entry per date', () => {
    const calendar = buildHolidayCalendar([
      entry({ holiday: holiday({ id: 'a' }) }),
      entry({ holiday: holiday({ id: 'b', date: '2026-12-25', name: 'Natal' }) }),
    ])
    expect(calendar.days().map((day) => day.date)).toEqual(['2026-09-07', '2026-12-25'])
  })

  it('treats the empty calendar as a calendar with no days off', () => {
    expect(EMPTY_HOLIDAY_CALENDAR.isDayOff('2026-09-07')).toBe(false)
    expect(EMPTY_HOLIDAY_CALENDAR.days()).toEqual([])
  })

  it('gives every period an empty calendar when no source is wired in', async () => {
    const calendar = await NO_HOLIDAY_CALENDAR.calendarFor({} as never, '2026-01-01', '2026-12-31')
    expect(calendar.isDayOff('2026-09-07')).toBe(false)
  })
})

describe('HolidayCalendar with a moved or bridged day off', () => {
  // 2026-09-07 is the holiday; 2026-09-08 is the day the company may move or bridge it to.
  const moved = buildHolidayCalendar([entry({ observedDate: '2026-09-08' })])
  const bridged = buildHolidayCalendar([entry({ bridgeDate: '2026-09-08' })])

  it('moves the day off to the observed date', () => {
    expect(moved.isDayOff('2026-09-08')).toBe(true)
    expect(moved.dayOn('2026-09-08')).toMatchObject({ kind: 'OBSERVED', dayOff: true })
  })

  it('turns the original date back into a working day that is still labelled', () => {
    expect(moved.isDayOff('2026-09-07')).toBe(false)
    expect(moved.dayOn('2026-09-07')).toMatchObject({ kind: 'HOLIDAY', dayOff: false })
  })

  it('keeps both dates off when the holiday is bridged', () => {
    expect(bridged.isDayOff('2026-09-07')).toBe(true)
    expect(bridged.isDayOff('2026-09-08')).toBe(true)
    expect(bridged.dayOn('2026-09-07')).toMatchObject({ kind: 'HOLIDAY' })
    expect(bridged.dayOn('2026-09-08')).toMatchObject({ kind: 'BRIDGE' })
  })

  it('supports working on the holiday and taking the bridged day instead', () => {
    const compensated = buildHolidayCalendar([entry({ dayOff: false, bridgeDate: '2026-09-08' })])
    expect(compensated.isDayOff('2026-09-07')).toBe(false)
    expect(compensated.isDayOff('2026-09-08')).toBe(true)
  })

  it('ignores a bridge that lands on the holiday itself', () => {
    const same = buildHolidayCalendar([entry({ bridgeDate: '2026-09-07' })])
    expect(same.isDayOff('2026-09-07')).toBe(true)
    expect(same.days()).toHaveLength(1)
  })

  it('lets a day off from one holiday survive a working day from another', () => {
    const calendar = buildHolidayCalendar([
      entry({ holiday: holiday({ id: 'a', date: '2026-09-08' }), dayOff: false }),
      entry({ holiday: holiday({ id: 'b' }), observedDate: '2026-09-08' }),
    ])
    expect(calendar.isDayOff('2026-09-08')).toBe(true)
    expect(calendar.dayOn('2026-09-08')?.holiday.id).toBe('b')
  })

  it('carries the rule that produced each date', () => {
    const calendar = buildHolidayCalendar([entry({ ruleId: 'rule-1', bridgeDate: '2026-09-08' })])
    expect(calendar.dayOn('2026-09-07')?.ruleId).toBe('rule-1')
    expect(calendar.dayOn('2026-09-08')?.ruleId).toBe('rule-1')
  })

  it('orders the days chronologically whatever order they were built in', () => {
    const calendar = buildHolidayCalendar([
      entry({ holiday: holiday({ id: 'b', date: '2026-12-25' }) }),
      entry({ holiday: holiday({ id: 'a' }), bridgeDate: '2026-09-08' }),
    ])
    expect(calendar.days().map((day) => day.date)).toEqual(['2026-09-07', '2026-09-08', '2026-12-25'])
  })
})

describe('effectiveWorkload with a calendar', () => {
  const workDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as const
  const dayOff = buildHolidayCalendar([entry()])
  const working = buildHolidayCalendar([entry({ dayOff: false })])

  it('keeps the full workload on a scheduled day without holidays', () => {
    expect(effectiveWorkload('2026-09-08', 480, workDays, EMPTY_HOLIDAY_CALENDAR)).toBe(480)
  })

  it('zeroes the workload on a holiday that is a day off', () => {
    expect(effectiveWorkload('2026-09-07', 480, workDays, dayOff)).toBe(0)
  })

  it('keeps the full workload on a holiday that is not a day off', () => {
    expect(effectiveWorkload('2026-09-07', 480, workDays, working)).toBe(480)
  })

  it('stays at zero on a holiday that falls outside the schedule', () => {
    expect(effectiveWorkload('2026-09-07', 480, ['SATURDAY'], dayOff)).toBe(0)
  })

  it('stays at zero when the user has no configured workload', () => {
    expect(effectiveWorkload('2026-09-08', 0, workDays, EMPTY_HOLIDAY_CALENDAR)).toBe(0)
  })
})
