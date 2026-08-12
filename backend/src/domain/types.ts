export const USER_ROLES = ['ADMIN', 'MANAGER', 'USER'] as const
export type UserRole = typeof USER_ROLES[number]

export const CLOSE_REASONS = ['PAUSE', 'LUNCH', 'EXIT'] as const
export type CloseReason = typeof CLOSE_REASONS[number]

export const WORK_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const
export type WorkDay = typeof WORK_DAYS[number]

export interface User {
  id: string
  name: string
  email: string
  passwordHash: string
  role: UserRole
  managerId: string | null
  managerName: string | null
  createdById: string | null
  dailyWorkloadMinutes: number
  standardEntryTime: string | null
  standardExitTime: string | null
  lunchEnabled: boolean
  lunchDurationMinutes: number
  workDays: WorkDay[]
  workStartDate: string | null
  createdAt: Date
  updatedAt: Date
}

export interface WorkLog {
  id: string
  userId: string
  entryAt: Date
  exitAt: Date | null
  closeReason: CloseReason | null
  createdAt: Date
  updatedAt: Date
}

export interface ApiResponse<T> {
  success: boolean
  message: string
  data: T | null
}

export function ok<T>(message: string, data: T): ApiResponse<T> {
  return { success: true, message, data }
}

export function normalizeWorkDays(value: string | null): WorkDay[] {
  if (!value) return []
  return value.split(',').filter((day): day is WorkDay => WORK_DAYS.includes(day as WorkDay))
}
