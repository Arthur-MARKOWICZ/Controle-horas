import type { HolidayScope } from '../../domain/types.js'
import { ExternalServiceError } from '../../shared/errors.js'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const SUBDIVISION_PATTERN = /^[A-Z]{2}-[A-Z0-9]{1,7}$/
const MAX_ENTRIES_PER_YEAR = 400
const MAX_NAME_LENGTH = 160

export interface ProvidedHoliday {
  date: string
  name: string
  externalKey: string
  subdivisionCode: string | null
  scope: HolidayScope
}

export interface HolidayProvider {
  fetchYear(year: number, countryCode: string): Promise<ProvidedHoliday[]>
}

interface NagerHoliday {
  date?: unknown
  localName?: unknown
  name?: unknown
  global?: unknown
  counties?: unknown
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, MAX_NAME_LENGTH) : null
}

function counties(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is string => typeof entry === 'string' && SUBDIVISION_PATTERN.test(entry))
    .slice(0, MAX_ENTRIES_PER_YEAR)
}

/**
 * Expands one Nager entry into the rows we persist: a national row when the holiday is
 * country wide, otherwise one subdivision row per county it applies to.
 */
function expand(entry: NagerHoliday): ProvidedHoliday[] {
  const date = typeof entry.date === 'string' && DATE_PATTERN.test(entry.date) ? entry.date : null
  const externalKey = text(entry.name)
  const name = text(entry.localName) || externalKey
  if (!date || !externalKey || !name) return []

  const subdivisions = entry.global === true ? [] : counties(entry.counties)
  if (subdivisions.length === 0) {
    return [{ date, name, externalKey, subdivisionCode: null, scope: 'NATIONAL' }]
  }
  return subdivisions.map((subdivisionCode) => ({
    date, name, externalKey, subdivisionCode, scope: 'SUBDIVISION' as HolidayScope,
  }))
}

export class NagerHolidayProvider implements HolidayProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async fetchYear(year: number, countryCode: string): Promise<ProvidedHoliday[]> {
    const url = `${this.baseUrl}/api/v3/PublicHolidays/${year}/${countryCode}`
    let response: Response
    try {
      response = await this.fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      throw new ExternalServiceError(`Holiday provider is unavailable: ${(error as Error).message}`)
    }
    if (!response.ok) {
      throw new ExternalServiceError(`Holiday provider responded with status ${response.status}`)
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new ExternalServiceError('Holiday provider returned an invalid payload')
    }
    if (!Array.isArray(payload)) {
      throw new ExternalServiceError('Holiday provider returned an invalid payload')
    }
    return payload.slice(0, MAX_ENTRIES_PER_YEAR).flatMap((entry) => expand(entry as NagerHoliday))
  }
}
