import styles from './WorkDaysField.module.css'
import { WEEK_DAYS } from '../../utils/workDays'
import type { WorkDay } from '../../types/api'

interface WorkDaysFieldProps {
  selectedDays?: WorkDay[]
  onChange: (days: WorkDay[]) => void
  disabled?: boolean
  idPrefix?: string
}

function WorkDaysField({ selectedDays = [], onChange, disabled = false, idPrefix = 'workDay' }: WorkDaysFieldProps) {
  const toggleDay = (dayValue: WorkDay) => {
    const isSelected = selectedDays.includes(dayValue)
    if (isSelected) {
      onChange(selectedDays.filter((day) => day !== dayValue))
      return
    }
    onChange([...selectedDays, dayValue])
  }

  return (
    <fieldset className={styles.fieldset} disabled={disabled}>
      <legend>Dias de trabalho</legend>
      <p className={styles.hint}>Selecione os dias em que a jornada é esperada.</p>
      <div className={styles.grid} role="group" aria-label="Dias de trabalho">
        {WEEK_DAYS.map((day) => {
          const inputId = `${idPrefix}-${day.value}`
          return (
            <label key={day.value} className={styles.dayLabel} htmlFor={inputId}>
              <input
                id={inputId}
                type="checkbox"
                checked={selectedDays.includes(day.value)}
                disabled={disabled}
                onChange={() => toggleDay(day.value)}
              />
              {day.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

export default WorkDaysField
