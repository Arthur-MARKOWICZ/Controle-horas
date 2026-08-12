export function formatSignedDuration(minutes: number | null | undefined): string {
  if (minutes == null || Number.isNaN(minutes)) {
    return '—'
  }

  const absoluteMinutes = Math.abs(minutes)
  const hours = Math.floor(absoluteMinutes / 60)
  const remainingMinutes = absoluteMinutes % 60
  const formatted = `${hours}h${String(remainingMinutes).padStart(2, '0')}`

  if (minutes < 0) {
    return `-${formatted}`
  }

  if (minutes > 0) {
    return `+${formatted}`
  }

  return formatted
}

export function formatWorkload(minutes: number | null | undefined): string {
  if (minutes == null || Number.isNaN(minutes)) {
    return '—'
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h${String(remainingMinutes).padStart(2, '0')}`
}

export function formatTimeInput(time: string | null | undefined): string {
  return time ? time.slice(0, 5) : ''
}

export function formatInstantTime(value: string | null | undefined): string {
  if (!value) {
    return '—'
  }

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function formatDisplayDate(date: string | null | undefined): string {
  if (!date) {
    return '—'
  }

  return new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { dateStyle: 'full' })
}

export function formatShortDate(date: string | null | undefined): string {
  if (!date) {
    return '—'
  }

  return new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR')
}

export function getCurrentMonthRange(referenceDate: Date = new Date()): { startDate: string; endDate: string } {
  const year = referenceDate.getFullYear()
  const month = referenceDate.getMonth()
  const startDate = new Date(year, month, 1)
  const endDate = new Date(year, month + 1, 0)

  return {
    startDate: toIsoDate(startDate),
    endDate: toIsoDate(endDate),
  }
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
