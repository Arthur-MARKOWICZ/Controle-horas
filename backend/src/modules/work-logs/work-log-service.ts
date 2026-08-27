import type { Repositories } from '../../database/repositories.js'
import type { DashboardResponse, HourBankRecalculationResponse } from '../../domain/contracts.js'
import { workLogResponse } from '../../domain/contracts.js'
import type { CloseReason, User } from '../../domain/types.js'
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors.js'
import { addDays, effectiveWorkload, localDateOf, localDateStart, pausedMinutes } from '../../shared/time.js'
import type { WorkTimeService } from './work-time-service.js'

export class WorkLogService {
  constructor(
    private readonly repositories: Repositories,
    private readonly workTime: WorkTimeService,
    private readonly timeZone: string,
  ) {}

  async register(user: User, action: 'entry' | 'pause' | 'lunch' | 'resume' | 'exit', now = new Date()): Promise<DashboardResponse> {
    if (action === 'entry' || action === 'resume') {
      await this.repositories.openWorkLog(user.id, now)
    } else {
      if (action === 'lunch' && !user.lunchEnabled) throw new ValidationError('Lunch registration is disabled for this user.')
      const reason = action.toUpperCase() as CloseReason
      const closed = await this.repositories.closeOpenWorkLog(user.id, now, reason)
      if (!closed) {
        const messages = {
          pause: 'There is no open entry to pause.',
          lunch: 'There is no open entry to register lunch.',
          exit: 'There is no open entry to register an exit.',
        }
        throw new ConflictError(messages[action])
      }
    }
    return this.dashboard(user, now)
  }

  async createAdministrative(user: User, entryAt: Date, exitAt: Date) {
    this.validateAdministrativeTimes(entryAt, exitAt)
    return workLogResponse(await this.repositories.createClosedWorkLog(user.id, entryAt, exitAt))
  }

  async updateAdministrative(user: User, workLogId: string, entryAt: Date, exitAt: Date) {
    this.validateAdministrativeTimes(entryAt, exitAt)
    const log = await this.repositories.updateClosedWorkLog(user.id, workLogId, entryAt, exitAt)
    if (!log) throw new NotFoundError('Work log not found')
    return workLogResponse(log)
  }

  async deleteAdministrative(user: User, workLogId: string): Promise<void> {
    const deleted = await this.repositories.deleteClosedWorkLog(user.id, workLogId)
    if (!deleted) throw new NotFoundError('Work log not found')
  }

  async dashboard(user: User, now = new Date()): Promise<DashboardResponse> {
    const date = localDateOf(now, this.timeZone)
    const start = localDateStart(date, this.timeZone)
    const end = localDateStart(addDays(date, 1), this.timeZone)
    const logs = await this.repositories.findWorkLogsOverlappingRange(user.id, start, end)
    const scheduleConfigured = Boolean(user.standardEntryTime && user.standardExitTime && user.workDays.length)
    const workedMinutesToday = this.workTime.workedMinutesOnDateIncludingOpen(logs, date, now)
    let balanceMinutesToday = 0; let expectedExitAt: Date | null = null; let hourBankMinutes = 0
    if (scheduleConfigured) {
      balanceMinutesToday = workedMinutesToday - effectiveWorkload(date, user.dailyWorkloadMinutes, user.workDays)
      expectedExitAt = this.workTime.expectedExit(
        logs, date, user.dailyWorkloadMinutes, user.workDays, user.lunchEnabled, user.lunchDurationMinutes,
      )
      hourBankMinutes = await this.calculateHourBank(user, date, end)
    }
    return {
      date, workStartDate: user.workStartDate, dailyWorkloadMinutes: user.dailyWorkloadMinutes,
      standardEntryTime: user.standardEntryTime, standardExitTime: user.standardExitTime,
      lunchEnabled: user.lunchEnabled, lunchDurationMinutes: user.lunchDurationMinutes, workDays: user.workDays,
      nextAction: this.workTime.nextAction(logs), expectedExitAt: expectedExitAt?.toISOString() || null,
      workedMinutesToday, pausedMinutesToday: pausedMinutes(logs), balanceMinutesToday, hourBankMinutes,
      workLogs: logs.map(workLogResponse), scheduleConfigured,
    }
  }

  async recalculateHourBank(user: User, now = new Date()): Promise<HourBankRecalculationResponse> {
    const date = localDateOf(now, this.timeZone)
    const end = localDateStart(addDays(date, 1), this.timeZone)
    const hourBankMinutes = await this.calculateHourBank(user, date, end)
    return this.repositories.replaceHourBankMinutes(user.id, hourBankMinutes)
  }

  private async calculateHourBank(user: User, untilDate: string, end: Date): Promise<number> {
    const first = await this.repositories.findFirstWorkLog(user.id)
    const absenceStart = this.workTime.resolvedStartDate(user.workStartDate, first)
    const hourBankStart = this.workTime.hourBankStartDate(user.workStartDate, first)
    if (!hourBankStart) return 0
    const allLogs = await this.repositories.findWorkLogsUntil(
      user.id, localDateStart(addDays(hourBankStart, -1), this.timeZone), end,
    )
    return this.workTime.hourBank(
      allLogs, user.dailyWorkloadMinutes, user.workDays, hourBankStart, untilDate, absenceStart || hourBankStart,
    )
  }

  private validateAdministrativeTimes(entryAt: Date, exitAt: Date): void {
    if (Number.isNaN(entryAt.getTime()) || Number.isNaN(exitAt.getTime())) {
      throw new ValidationError('Entry and exit must be valid ISO-8601 instants')
    }
    if (entryAt >= exitAt) throw new ValidationError('Exit time must be after entry time')
  }
}
