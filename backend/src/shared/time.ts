import type { WorkDay, WorkLog } from '../domain/types.js'

const MINUTE_MS = 60_000
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const WEEK_DAYS: WorkDay[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

function partsAt(instant: Date, timeZone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]))
}

function offsetAt(instant: Date, timeZone: string): number {
  const parts = partsAt(instant, timeZone)
  const representedAsUtc = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!)
  return representedAsUtc - instant.getTime()
}

export function localDateStart(date: string, timeZone: string): Date {
  if (!DATE_PATTERN.test(date)) throw new Error(`Invalid date: ${date}`)
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const naiveUtc = Date.UTC(year, month - 1, day)
  let result = new Date(naiveUtc - offsetAt(new Date(naiveUtc), timeZone))
  result = new Date(naiveUtc - offsetAt(result, timeZone))
  return result
}

export function localDateOf(instant: Date, timeZone: string): string {
  const parts = partsAt(instant, timeZone)
  return `${parts.year!.toString().padStart(4, '0')}-${parts.month!.toString().padStart(2, '0')}-${parts.day!.toString().padStart(2, '0')}`
}

export function addDays(date: string, amount: number): string {
  if (!DATE_PATTERN.test(date)) throw new Error(`Invalid date: ${date}`)
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const result = new Date(Date.UTC(year, month - 1, day + amount))
  return result.toISOString().slice(0, 10)
}

export function compareDates(left: string, right: string): number { return left.localeCompare(right) }

export function daysBetween(start: string, end: string): number {
  return Math.round((localDateStart(end, 'UTC').getTime() - localDateStart(start, 'UTC').getTime()) / 86_400_000)
}

export function eachDate(start: string, end: string): string[] {
  const dates: string[] = []
  for (let date = start; compareDates(date, end) <= 0; date = addDays(date, 1)) dates.push(date)
  return dates
}

export function workDayOf(date: string): WorkDay {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return WEEK_DAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]!
}

export function isWorkDay(date: string, workDays: readonly WorkDay[]): boolean {
  return workDays.includes(workDayOf(date))
}

export function effectiveWorkload(date: string, dailyMinutes: number, workDays: readonly WorkDay[]): number {
  return dailyMinutes > 0 && isWorkDay(date, workDays) ? dailyMinutes : 0
}

export function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / MINUTE_MS))
}

export function groupLogsByEntryDate(logs: readonly WorkLog[], timeZone: string): Map<string, WorkLog[]> {
  const grouped = new Map<string, WorkLog[]>()
  for (const log of logs) {
    const date = localDateOf(log.entryAt, timeZone)
    const existing = grouped.get(date) || []
    existing.push(log)
    grouped.set(date, existing)
  }
  for (const dayLogs of grouped.values()) dayLogs.sort((left, right) => left.entryAt.getTime() - right.entryAt.getTime())
  return grouped
}

function partitionedMinutesByDate(logs: readonly WorkLog[], timeZone: string, openUntil: Date | null): Map<string, number> {
  const result = new Map<string, number>()
  for (const log of logs) {
    const end = log.exitAt || openUntil
    if (!end || end <= log.entryAt) continue
    let cursor = log.entryAt
    while (cursor < end) {
      const date = localDateOf(cursor, timeZone)
      const midnight = localDateStart(addDays(date, 1), timeZone)
      const segmentEnd = end < midnight ? end : midnight
      const minutes = minutesBetween(cursor, segmentEnd)
      if (minutes > 0) result.set(date, (result.get(date) || 0) + minutes)
      cursor = segmentEnd
    }
  }
  return result
}

export function closedMinutesByDate(logs: readonly WorkLog[], timeZone: string): Map<string, number> {
  return partitionedMinutesByDate(logs, timeZone, null)
}

export function minutesByDateIncludingOpen(logs: readonly WorkLog[], timeZone: string, now: Date): Map<string, number> {
  return partitionedMinutesByDate(logs, timeZone, now)
}

export function pausedMinutes(logs: readonly WorkLog[]): number {
  const ordered = [...logs].sort((left, right) => left.entryAt.getTime() - right.entryAt.getTime())
  let total = 0
  for (let index = 0; index < ordered.length - 1; index++) {
    const current = ordered[index]!
    const next = ordered[index + 1]!
    if (current.exitAt && (current.closeReason === 'PAUSE' || current.closeReason === 'LUNCH')) {
      total += minutesBetween(current.exitAt, next.entryAt)
    }
  }
  return total
}

export function isDayComplete(logs: readonly WorkLog[]): boolean {
  if (logs.length === 0 || logs.some((log) => !log.exitAt)) return false
  const last = [...logs].filter((log) => log.exitAt).sort((a, b) => b.exitAt!.getTime() - a.exitAt!.getTime())[0]
  return last?.closeReason !== 'PAUSE' && last?.closeReason !== 'LUNCH'
}
