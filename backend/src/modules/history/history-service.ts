import type { Repositories } from '../../database/repositories.js'
import type { HistoryDayResponse, HistoryResponse } from '../../domain/contracts.js'
import { workLogResponse } from '../../domain/contracts.js'
import type { User, WorkLog } from '../../domain/types.js'
import { ValidationError } from '../../shared/errors.js'
import {
  addDays, daysBetween, eachDate, effectiveWorkload,
  groupLogsByEntryDate, isDayComplete, localDateOf, localDateStart, minutesByDateIncludingOpen, pausedMinutes,
} from '../../shared/time.js'
import type { WorkTimeService } from '../work-logs/work-time-service.js'

export class HistoryService {
  static readonly MAX_PERIOD_DAYS = 90
  constructor(
    private readonly repositories: Repositories,
    private readonly workTime: WorkTimeService,
    private readonly timeZone: string,
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
    const days = this.buildDays(user, startDate, endDate, today, absenceStart, periodLogs, now)
    const totalWorkedMinutes = days.reduce((total, day) => total + day.workedMinutes, 0)
    const totalBalanceMinutes = days.reduce((total, day) => total + day.balanceMinutes, 0)
    let hourBankMinutes = 0
    if (hourBankStart && hourBankStart <= today) {
      const allLogs = await this.repositories.findWorkLogsUntil(
        user.id, localDateStart(addDays(hourBankStart, -1), this.timeZone), localDateStart(addDays(today, 1), this.timeZone),
      )
      hourBankMinutes = this.workTime.hourBank(
        allLogs, user.dailyWorkloadMinutes, user.workDays, hourBankStart, today, absenceStart || hourBankStart,
      )
    }
    return {
      startDate, endDate, totalWorkedMinutes, totalBalanceMinutes, hourBankMinutes,
      days: days.slice(offset, offset + limit), pagination: { limit, offset, total: days.length },
    }
  }

  private buildDays(
    user: User, startDate: string, endDate: string, today: string, resolvedStart: string | null, logs: WorkLog[], now: Date,
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
      const pastAbsence = date < today && Boolean(resolvedStart && date >= resolvedStart)
        && effectiveWorkload(date, user.dailyWorkloadMinutes, user.workDays) > 0
      if (!hasActivity && !pastAbsence) continue
      if (!hasActivity) {
        result.push({
          date, firstEntryAt: null, lastExitAt: null, workedMinutes: 0, pausedMinutes: 0,
          balanceMinutes: -user.dailyWorkloadMinutes, isComplete: true, workLogs: [],
        })
        continue
      }
      const exits = activityLogs.flatMap((log) => log.exitAt ? [log.exitAt] : [])
      result.push({
        date,
        firstEntryAt: activityLogs[0]?.entryAt.toISOString() || null,
        lastExitAt: exits.length ? new Date(Math.max(...exits.map((value) => value.getTime()))).toISOString() : null,
        workedMinutes, pausedMinutes: pausedMinutes(activityLogs),
        balanceMinutes: workedMinutes - effectiveWorkload(date, user.dailyWorkloadMinutes, user.workDays),
        isComplete: activityLogs.length ? isDayComplete(activityLogs) : true,
        workLogs: activityLogs.map(workLogResponse),
      })
    }
    return result
  }

  private validatePeriod(start: string, end: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      throw new ValidationError('startDate and endDate are required in YYYY-MM-DD format.')
    }
    if (start > end) throw new ValidationError('startDate must be less than or equal to endDate.')
    if (daysBetween(start, end) > HistoryService.MAX_PERIOD_DAYS) {
      throw new ValidationError(`Period must be at most ${HistoryService.MAX_PERIOD_DAYS} days.`)
    }
  }
}
