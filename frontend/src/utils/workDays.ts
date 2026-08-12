import type { WorkDay } from '../types/api'

export const WEEK_DAYS: ReadonlyArray<{ value: WorkDay; label: string }> = [
  { value: 'MONDAY', label: 'Segunda' },
  { value: 'TUESDAY', label: 'Terça' },
  { value: 'WEDNESDAY', label: 'Quarta' },
  { value: 'THURSDAY', label: 'Quinta' },
  { value: 'FRIDAY', label: 'Sexta' },
  { value: 'SATURDAY', label: 'Sábado' },
  { value: 'SUNDAY', label: 'Domingo' },
]

export const DEFAULT_WORK_DAYS: WorkDay[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
]

/**
 * Normalizes work days from the API or form.
 * Empty/null/undefined returns empty array (caller must validate).
 */
export function normalizeWorkDays(workDays: unknown): WorkDay[] {
  if (workDays == null || !Array.isArray(workDays)) {
    return []
  }
  if (workDays.length === 0) {
    return []
  }
  const validDays = new Set<WorkDay>(WEEK_DAYS.map((day) => day.value))
  return [...new Set(workDays.filter((day): day is WorkDay => typeof day === 'string' && validDays.has(day as WorkDay)))]
}
