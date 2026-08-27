export type UserRole = 'ADMIN' | 'MANAGER' | 'USER'
export type WorkDay = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'

export interface ApiResponse<T> { success: boolean; message: string; data: T | null }
export interface SessionUser { userId: string; name: string; email: string; role: UserRole }
export interface AuthData extends SessionUser {
  token: string; accessTokenExpiresAt: string; refreshTokenExpiresAt: string
}
export interface CurrentUser { id: string; name: string; email: string; role: UserRole }
export interface WorkLog { id: string; entryAt: string; exitAt: string | null; closeReason: 'PAUSE' | 'LUNCH' | 'EXIT' | null }
export interface DashboardData {
  date: string; workStartDate: string | null; dailyWorkloadMinutes: number
  standardEntryTime: string | null; standardExitTime: string | null
  lunchEnabled: boolean; lunchDurationMinutes: number; workDays: WorkDay[]
  nextAction: 'ENTRY' | 'PAUSE_OR_EXIT' | 'RESUME'; expectedExitAt: string | null
  workedMinutesToday: number; pausedMinutesToday: number; balanceMinutesToday: number
  hourBankMinutes: number; workLogs: WorkLog[]; scheduleConfigured: boolean
}
export interface HistoryDay {
  date: string; firstEntryAt: string | null; lastExitAt: string | null; workedMinutes: number
  pausedMinutes: number; balanceMinutes: number; isComplete: boolean; workLogs: WorkLog[]
}
export interface WorkedDayTotals { total: number; inSchedule: number; outsideSchedule: number }
export interface HistoryData {
  startDate: string; endDate: string; totalWorkedMinutes: number; totalBalanceMinutes: number
  hourBankMinutes: number; workedDayTotals: WorkedDayTotals; days: HistoryDay[]; pagination?: { limit: number; offset: number; total: number }
}
export interface AdministrativeWorkLogPayload { entryAt: string; exitAt: string }
export interface HourBankRecalculation { previousHourBankMinutes: number; hourBankMinutes: number }
export interface ManagedUser extends CurrentUser {
  managerId: string | null; managerName: string | null; createdById: string | null
  workStartDate: string | null; dailyWorkloadMinutes: number; standardEntryTime: string | null
  standardExitTime: string | null; lunchEnabled: boolean; lunchDurationMinutes: number; workDays: WorkDay[]
}
export interface SchedulePayload {
  standardEntryTime: string; standardExitTime: string; lunchEnabled: boolean
  lunchDurationMinutes: number; workDays: WorkDay[]; workStartDate?: string | null
}

export interface ImportResult {
  importedCount: number; errorCount: number
  errors: Array<{ row: number; message: string }>
}
