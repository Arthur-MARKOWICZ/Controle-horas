import type { Repositories } from '../../database/repositories.js'
import type { HistoryDayResponse, HistoryResponse, OutsideScheduleWorkDaysResponse } from '../../domain/contracts.js'
import { holidayResponse, workLogResponse } from '../../domain/contracts.js'
import type { User, WorkDay, WorkLog } from '../../domain/types.js'
import { ValidationError } from '../../shared/errors.js'
import type { HolidayCalendar, HolidayCalendarSource } from '../../shared/holiday-calendar.js'
import { NO_HOLIDAY_CALENDAR } from '../../shared/holiday-calendar.js'
import {
  addDays, closedMinutesByDate, eachDate, effectiveWorkload,
  groupLogsByEntryDate, isDayComplete, isWorkDay, localDateOf, localDateStart, minutesByDateIncludingOpen, pausedMinutes,
} from '../../shared/time.js'
import type { WorkTimeService } from '../work-logs/work-time-service.js'

export class HistoryService {
  constructor(
    private readonly repositories: Repositories,
    private readonly workTime: WorkTimeService,
    private readonly timeZone: string,
    private readonly holidays: HolidayCalendarSource = NO_HOLIDAY_CALENDAR,
  ) {}

  async get(user: User, startDate: string, endDate: string, limit = 90, offset = 0, now = new Date()): Promise<HistoryResponse> {
    this.validatePeriod(startDate, endDate)
    if (!Number.isInteger(limit) || limit < 1 || limit > 90) throw new ValidationError('limit must be between 1 and 90')
    if (!Number.isInteger(offset) || offset < 0) throw new ValidationError('offset must be zero or greater')
    const rangeStart = localDateStart(startDate, this.timeZone)
    const rangeEnd = localDateStart(addDays(endDate, 1), this.timeZone)
    const periodLogs = await this.repositories.findWorkLogsOverlappingRange(user.id, rangeStart, rangeEnd)
    const first = await this.repositories.findFirstWorkLog(user.id)
    const absenceStart = this.workTime.resolvedStartDate(user.workStartDate, first)
    const hourBankStart = this.workTime.hourBankStartDate(user.workStartDate, first)
    const today = localDateOf(now, this.timeZone)
    // One load covering both the requested period and the hour-bank span, so neither path queries per day.
    const calendarStart = [startDate, hourBankStart || startDate].sort()[0]!
    const calendarEnd = [endDate, today].sort().at(-1)!
    const calendar = await this.holidays.calendarFor(user, calendarStart, calendarEnd)
    const days = this.buildDays(user, startDate, endDate, today, absenceStart, periodLogs, now, calendar)
    const totalWorkedMinutes = days.reduce((total, day) => total + day.workedMinutes, 0)
    const totalBalanceMinutes = days.reduce((total, day) => total + day.balanceMinutes, 0)
    let hourBankMinutes = 0
    if (hourBankStart && hourBankStart <= today) {
      const allLogs = await this.repositories.findWorkLogsUntil(
        user.id, localDateStart(addDays(hourBankStart, -1), this.timeZone), localDateStart(addDays(today, 1), this.timeZone),
      )
      hourBankMinutes = this.workTime.hourBank(
        allLogs, user.dailyWorkloadMinutes, user.workDays, hourBankStart, today, absenceStart || hourBankStart, calendar,
      )
    }
    return {
      startDate, endDate, totalWorkedMinutes, totalBalanceMinutes, hourBankMinutes, workedDayTotals: user.workedDayTotals,
      days: days.slice(offset, offset + limit), pagination: { limit, offset, total: days.length },
    }
  }

  async outsideScheduleDays(user: User, limit = 10, offset = 0): Promise<OutsideScheduleWorkDaysResponse> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 90) throw new ValidationError('limit must be between 1 and 90')
    if (!Number.isInteger(offset) || offset < 0) throw new ValidationError('offset must be zero or greater')
    const [logs, versions] = await Promise.all([
      this.repositories.findClosedWorkLogs(user.id), this.repositories.findWorkScheduleVersions(user.id),
    ])
    const minutesByDate = closedMinutesByDate(logs, this.timeZone)
    const dates = [...minutesByDate.keys()]
      .filter((date) => !isWorkDay(date, this.workDaysAt(versions, date)))
      .sort((left, right) => right.localeCompare(left))
    const days = dates.slice(offset, offset + limit).map((date) => {
      const start = localDateStart(date, this.timeZone)
      const end = localDateStart(addDays(date, 1), this.timeZone)
      return {
        date, workedMinutes: minutesByDate.get(date) || 0,
        workLogs: logs.filter((log) => log.entryAt < end && log.exitAt! > start).map(workLogResponse),
      }
    })
    return { days, pagination: { limit, offset, total: dates.length } }
  }

  private workDaysAt(versions: Array<{ effectiveFrom: string; workDays: WorkDay[] }>, date: string): WorkDay[] {
    let result: WorkDay[] = []
    for (const version of versions) {
      if (version.effectiveFrom > date) break
      result = version.workDays
    }
    return result
  }

  private buildDays(
    user: User, startDate: string, endDate: string, today: string, resolvedStart: string | null, logs: WorkLog[], now: Date,
    calendar: HolidayCalendar,
  ): HistoryDayResponse[] {
    const byEntry = groupLogsByEntryDate(logs, this.timeZone)
    const workedByDate = minutesByDateIncludingOpen(logs, this.timeZone, now)
    const result: HistoryDayResponse[] = []
    for (const date of eachDate(startDate, endDate)) {
      const entryLogs = byEntry.get(date) || []
      const workedMinutes = workedByDate.get(date) || 0
      const activityLogs = entryLogs.length ? entryLogs : logs.filter((log) => {
        const end = log.exitAt || now
        return localDateOf(log.entryAt, this.timeZone) <= date && localDateOf(end, this.timeZone) >= date
      })
      const hasActivity = activityLogs.length > 0 || workedMinutes > 0
      const holiday = calendar.dayOn(date)
      const workload = effectiveWorkload(date, user.dailyWorkloadMinutes, user.workDays, calendar)
      const pastAbsence = date < today && Boolean(resolvedStart && date >= resolvedStart) && workload > 0
      // A holiday still shows up, otherwise a day would silently vanish from the history.
      const withinTrackedPeriod = Boolean(resolvedStart && date >= resolvedStart)
      if (!hasActivity && !pastAbsence && !(holiday && withinTrackedPeriod)) continue
      const holidayEntry = holiday ? holidayResponse(holiday) : null
      if (!hasActivity) {
        result.push({
          date, firstEntryAt: null, lastExitAt: null, workedMinutes: 0, pausedMinutes: 0,
          balanceMinutes: workload === 0 ? 0 : -workload, isComplete: true, workLogs: [],
          holiday: holidayEntry, workedOnHoliday: false,
        })
        continue
      }
      const exits = activityLogs.flatMap((log) => log.exitAt ? [log.exitAt] : [])
      result.push({
        date,
        firstEntryAt: activityLogs[0]?.entryAt.toISOString() || null,
        lastExitAt: exits.length ? new Date(Math.max(...exits.map((value) => value.getTime()))).toISOString() : null,
        workedMinutes, pausedMinutes: pausedMinutes(activityLogs),
        balanceMinutes: workedMinutes - workload,
        isComplete: activityLogs.length ? isDayComplete(activityLogs) : true,
        workLogs: activityLogs.map(workLogResponse),
        holiday: holidayEntry, workedOnHoliday: Boolean(holiday) && workedMinutes > 0,
      })
    }
    return result
  }

  private validatePeriod(start: string, end: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      throw new ValidationError('startDate and endDate are required in YYYY-MM-DD format.')
    }
    if (start > end) throw new ValidationError('startDate must be less than or equal to endDate.')
  }
}
