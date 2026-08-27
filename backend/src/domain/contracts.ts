import type { WorkDay, WorkLog, WorkedDayTotals } from './types.js'

export interface WorkLogResponse { id: string; entryAt: string; exitAt: string | null; closeReason: string | null }

export interface DashboardResponse {
  date: string; workStartDate: string | null; dailyWorkloadMinutes: number
  standardEntryTime: string | null; standardExitTime: string | null
  lunchEnabled: boolean; lunchDurationMinutes: number; workDays: WorkDay[]
  nextAction: 'ENTRY' | 'PAUSE_OR_EXIT' | 'RESUME'; expectedExitAt: string | null
  workedMinutesToday: number; pausedMinutesToday: number; balanceMinutesToday: number
  hourBankMinutes: number; workLogs: WorkLogResponse[]; scheduleConfigured: boolean
}

export interface HistoryDayResponse {
  date: string; firstEntryAt: string | null; lastExitAt: string | null
  workedMinutes: number; pausedMinutes: number; balanceMinutes: number
  isComplete: boolean; workLogs: WorkLogResponse[]
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

export function workLogResponse(log: WorkLog): WorkLogResponse {
  return {
    id: log.id,
    entryAt: log.entryAt.toISOString(),
    exitAt: log.exitAt?.toISOString() || null,
    closeReason: log.closeReason,
  }
}
