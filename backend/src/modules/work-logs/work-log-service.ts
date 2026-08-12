import type { Repositories } from '../../database/repositories.js'
import type { DashboardResponse } from '../../domain/contracts.js'
import { workLogResponse } from '../../domain/contracts.js'
import type { CloseReason, User } from '../../domain/types.js'
import { ConflictError, ValidationError } from '../../shared/errors.js'
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
      const first = await this.repositories.findFirstWorkLog(user.id)
      const fromDate = this.workTime.resolvedStartDate(user.workStartDate, first)
      if (fromDate) {
        const allLogs = await this.repositories.findWorkLogsUntil(
          user.id, localDateStart(addDays(fromDate, -1), this.timeZone), end,
        )
        hourBankMinutes = this.workTime.hourBank(allLogs, user.dailyWorkloadMinutes, user.workDays, fromDate, date)
      }
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
}
