export const WEEK_DAYS = [{ value: 'MONDAY', label: 'Seg' }, { value: 'TUESDAY', label: 'Ter' }, { value: 'WEDNESDAY', label: 'Qua' }, { value: 'THURSDAY', label: 'Qui' }, { value: 'FRIDAY', label: 'Sex' }, { value: 'SATURDAY', label: 'Sáb' }, { value: 'SUNDAY', label: 'Dom' }]
export const DEFAULT_WORK_DAYS = WEEK_DAYS.slice(0, 5).map(({ value }) => value)
