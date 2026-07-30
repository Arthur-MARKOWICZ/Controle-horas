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
 * Empty/null/undefined returns empty array (caller must validate).
 */
export function normalizeWorkDays(workDays) {
  if (workDays == null || !Array.isArray(workDays)) {
    return []
  }
  if (workDays.length === 0) {
    return []
  }
  return [...new Set(workDays)]
}
