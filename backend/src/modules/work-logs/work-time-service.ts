import type { WorkDay, WorkLog } from '../../domain/types.js'
import {
  closedMinutesByDate, eachDate, effectiveWorkload, groupLogsByEntryDate,
  isDayComplete, localDateOf, minutesBetween, minutesByDateIncludingOpen, pausedMinutes,
} from '../../shared/time.js'

export class WorkTimeService {
  constructor(readonly timeZone: string) {}

  workedMinutesIncludingOpen(logs: readonly WorkLog[], now: Date): number {
    return logs.reduce((total, log) => total + minutesBetween(log.entryAt, log.exitAt || now), 0)
  }

  workedMinutesOnDate(logs: readonly WorkLog[], date: string): number {
    return closedMinutesByDate(logs, this.timeZone).get(date) || 0
  }

  workedMinutesOnDateIncludingOpen(logs: readonly WorkLog[], date: string, now: Date): number {
    return minutesByDateIncludingOpen(logs, this.timeZone, now).get(date) || 0
  }

  expectedExit(
    logs: readonly WorkLog[], date: string, dailyMinutes: number, workDays: readonly WorkDay[],
    lunchEnabled: boolean, lunchMinutes: number,
  ): Date | null {
    const firstEntry = [...logs].sort((a, b) => a.entryAt.getTime() - b.entryAt.getTime())[0]?.entryAt
    if (!firstEntry) return null
    const workload = effectiveWorkload(date, dailyMinutes, workDays)
    const hasLunch = logs.some((log) => log.closeReason === 'LUNCH')
    const plannedLunch = lunchEnabled && lunchMinutes > 0 && !hasLunch ? lunchMinutes : 0
    return new Date(firstEntry.getTime() + (workload + pausedMinutes(logs) + plannedLunch) * 60_000)
  }

  hourBank(
    logs: readonly WorkLog[], dailyMinutes: number, workDays: readonly WorkDay[], fromDate: string, untilDate: string,
  ): number {
    const grouped = groupLogsByEntryDate(logs, this.timeZone)
    const worked = closedMinutesByDate(logs, this.timeZone)
    let total = 0
    for (const date of eachDate(fromDate, untilDate)) {
      const dayLogs = grouped.get(date) || []
      const pastDay = date < untilDate
      const workload = effectiveWorkload(date, dailyMinutes, workDays)
      const dayWorked = worked.get(date) || 0
      if (dayLogs.length === 0) {
        if (dayWorked > 0) total += dayWorked - workload
        else if (pastDay && workload > 0) total -= workload
      } else if (!isDayComplete(dayLogs)) {
        if (pastDay) total += dayWorked - workload
      } else {
        total += dayWorked - workload
      }
    }
    return total
  }

  nextAction(logs: readonly WorkLog[]): 'ENTRY' | 'PAUSE_OR_EXIT' | 'RESUME' {
    if (logs.some((log) => !log.exitAt)) return 'PAUSE_OR_EXIT'
    const last = [...logs].filter((log) => log.exitAt).sort((a, b) => b.exitAt!.getTime() - a.exitAt!.getTime())[0]
    return last?.closeReason === 'PAUSE' || last?.closeReason === 'LUNCH' ? 'RESUME' : 'ENTRY'
  }

  resolvedStartDate(configured: string | null, firstLog: WorkLog | null): string | null {
    return configured || (firstLog ? localDateOf(firstLog.entryAt, this.timeZone) : null)
  }
}
