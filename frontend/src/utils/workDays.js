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

/**
 * Normalizes work days from the API or form.
 * Empty array stays empty (caller must validate).
 * null/undefined falls back to Mon–Fri defaults.
 */
export function normalizeWorkDays(workDays) {
  if (workDays == null) {
    return [...DEFAULT_WORK_DAYS]
  }
  if (!Array.isArray(workDays)) {
    return [...DEFAULT_WORK_DAYS]
  }
  if (workDays.length === 0) {
    return []
  }
  return [...new Set(workDays)]
}
