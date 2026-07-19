export const WEEK_DAYS = [
  { value: 'MONDAY', label: 'Segunda' },
  { value: 'TUESDAY', label: 'Terça' },
  { value: 'WEDNESDAY', label: 'Quarta' },
  { value: 'THURSDAY', label: 'Quinta' },
  { value: 'FRIDAY', label: 'Sexta' },
  { value: 'SATURDAY', label: 'Sábado' },
  { value: 'SUNDAY', label: 'Domingo' },
]

export const DEFAULT_WORK_DAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
]

export function normalizeWorkDays(workDays) {
  if (!Array.isArray(workDays) || workDays.length === 0) {
    return [...DEFAULT_WORK_DAYS]
  }
  return [...new Set(workDays)]
}
