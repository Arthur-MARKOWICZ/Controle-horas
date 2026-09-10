import type { HolidayCalendarDay } from '../shared/holiday-calendar.js'
import type { HolidayDayKind, HolidayScope, HolidaySource, WorkDay, WorkLog, WorkedDayTotals } from './types.js'

export interface WorkLogResponse { id: string; entryAt: string; exitAt: string | null; closeReason: string | null }

export interface DashboardResponse {
  date: string; workStartDate: string | null; dailyWorkloadMinutes: number
  standardEntryTime: string | null; standardExitTime: string | null
  lunchEnabled: boolean; lunchDurationMinutes: number; workDays: WorkDay[]
  nextAction: 'ENTRY' | 'PAUSE_OR_EXIT' | 'RESUME'; expectedExitAt: string | null
  workedMinutesToday: number; pausedMinutesToday: number; balanceMinutesToday: number
  hourBankMinutes: number; workLogs: WorkLogResponse[]; scheduleConfigured: boolean
  holiday: HolidayDayResponse | null; workedOnHoliday: boolean
}

export interface HistoryDayResponse {
  date: string; firstEntryAt: string | null; lastExitAt: string | null
  workedMinutes: number; pausedMinutes: number; balanceMinutes: number
  isComplete: boolean; workLogs: WorkLogResponse[]
  holiday: HolidayDayResponse | null; workedOnHoliday: boolean
}

export interface HistoryResponse {
  startDate: string; endDate: string; totalWorkedMinutes: number; totalBalanceMinutes: number
  hourBankMinutes: number; workedDayTotals: WorkedDayTotals; days: HistoryDayResponse[]
  pagination: { limit: number; offset: number; total: number }
}

export interface HourBankRecalculationResponse {
  previousHourBankMinutes: number
  hourBankMinutes: number
}

export interface OutsideScheduleWorkDayResponse {
  date: string
  workedMinutes: number
  workLogs: WorkLogResponse[]
}

export interface OutsideScheduleWorkDaysResponse {
  days: OutsideScheduleWorkDayResponse[]
  pagination: { limit: number; offset: number; total: number }
}

export interface HolidayDayResponse {
  holidayId: string
  /** The date this entry falls on, which differs from `holidayDate` when the day off was moved or bridged. */
  date: string
  /** The date of the holiday itself. */
  holidayDate: string
  name: string
  scope: HolidayScope
  source: HolidaySource
  subdivisionCode: string | null
  dayOff: boolean
  kind: HolidayDayKind
  /** The rule that decided `dayOff`, or null when the scope default applied. */
  ruleId: string | null
  /** Current values of that rule, so an editor can show them instead of silently clearing them. */
  ruleObservedDate: string | null
  ruleBridgeDate: string | null
}

export interface HolidayRuleResponse {
  id: string
  holidayId: string
  holidayDate: string
  holidayName: string
  userId: string | null
  userName: string | null
  dayOff: boolean
  observedDate: string | null
  bridgeDate: string | null
  notes: string | null
  createdByName: string
  createdAt: string
  updatedAt: string
}

export interface HolidayCalendarResponse {
  startDate: string
  endDate: string
  days: HolidayDayResponse[]
}

export interface HolidaySyncResponse {
  year: number
  countryCode: string
  holidayCount: number
  syncedAt: string
}

export function holidayResponse(day: HolidayCalendarDay): HolidayDayResponse {
  return {
    holidayId: day.holiday.id,
    date: day.date,
    holidayDate: day.holiday.date,
    name: day.holiday.name,
    scope: day.holiday.scope,
    source: day.holiday.source,
    subdivisionCode: day.holiday.subdivisionCode,
    dayOff: day.dayOff,
    kind: day.kind,
    ruleId: day.ruleId,
    ruleObservedDate: day.ruleObservedDate,
    ruleBridgeDate: day.ruleBridgeDate,
  }
}

export function workLogResponse(log: WorkLog): WorkLogResponse {
  return {
    id: log.id,
    entryAt: log.entryAt.toISOString(),
    exitAt: log.exitAt?.toISOString() || null,
    closeReason: log.closeReason,
  }
}
