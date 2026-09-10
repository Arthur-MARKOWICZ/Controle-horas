import type { Holiday, HolidayDayKind, User } from '../domain/types.js'

/** One date of the calendar, which may not be the date of the holiday that caused it. */
export interface HolidayCalendarDay {
  /** The date this entry lands on: the holiday itself, the date its day off was moved to, or a bridged day. */
  date: string
  holiday: Holiday
  dayOff: boolean
  kind: HolidayDayKind
  ruleId: string | null
  /** The rule's own dates, carried through so an editor can render its current state. */
  ruleObservedDate: string | null
  ruleBridgeDate: string | null
}

/**
 * The holidays affecting a period, already resolved into the only question the workload
 * arithmetic needs to ask: is this date a day off?
 *
 * Scope, company rules, moved dates and bridged days are all resolved before the calendar is
 * built, so `shared/time.ts` never has to know about any of them.
 */
export interface HolidayCalendar {
  isDayOff(date: string): boolean
  dayOn(date: string): HolidayCalendarDay | null
  days(): readonly HolidayCalendarDay[]
}

/** Loads the calendar for a period. Implemented by the holidays module, consumed by the calculation services. */
export interface HolidayCalendarSource {
  calendarFor(user: User, startDate: string, endDate: string): Promise<HolidayCalendar>
}

/** A holiday plus the company rule that applies to it, if any. */
export interface HolidayCalendarEntry {
  holiday: Holiday
  dayOff: boolean
  ruleId: string | null
  observedDate: string | null
  bridgeDate: string | null
}

class MappedHolidayCalendar implements HolidayCalendar {
  constructor(private readonly byDate: ReadonlyMap<string, HolidayCalendarDay>) {}

  isDayOff(date: string): boolean { return this.byDate.get(date)?.dayOff === true }
  dayOn(date: string): HolidayCalendarDay | null { return this.byDate.get(date) || null }
  days(): readonly HolidayCalendarDay[] {
    return [...this.byDate.values()].sort((left, right) => left.date.localeCompare(right.date))
  }
}

/**
 * Turns each holiday and its rule into the dates it actually affects.
 *
 * Moving a holiday produces two entries: the new date becomes the day off, and the original
 * date goes back to being a working day that is still labelled with the holiday.
 */
export function buildHolidayCalendar(entries: readonly HolidayCalendarEntry[]): HolidayCalendar {
  const byDate = new Map<string, HolidayCalendarDay>()
  const mark = (day: HolidayCalendarDay): void => {
    const existing = byDate.get(day.date)
    // A date that is a day off for any reason stays a day off, whatever else lands on it.
    if (!existing || (day.dayOff && !existing.dayOff)) byDate.set(day.date, day)
  }

  for (const entry of entries) {
    const base = {
      holiday: entry.holiday, ruleId: entry.ruleId,
      ruleObservedDate: entry.observedDate, ruleBridgeDate: entry.bridgeDate,
    }
    if (entry.dayOff) {
      const target = entry.observedDate || entry.holiday.date
      mark({ ...base, date: target, dayOff: true, kind: entry.observedDate ? 'OBSERVED' : 'HOLIDAY' })
      if (entry.observedDate) {
        mark({ ...base, date: entry.holiday.date, dayOff: false, kind: 'HOLIDAY' })
      }
    } else {
      mark({ ...base, date: entry.holiday.date, dayOff: false, kind: 'HOLIDAY' })
    }
    if (entry.bridgeDate) {
      mark({ ...base, date: entry.bridgeDate, dayOff: true, kind: 'BRIDGE' })
    }
  }
  return new MappedHolidayCalendar(byDate)
}

export const EMPTY_HOLIDAY_CALENDAR: HolidayCalendar = buildHolidayCalendar([])

/**
 * Default injected wherever a holiday calendar is not wired in, so behaviour matches
 * the system as it was before holidays existed.
 */
export const NO_HOLIDAY_CALENDAR: HolidayCalendarSource = {
  calendarFor: async () => EMPTY_HOLIDAY_CALENDAR,
}
