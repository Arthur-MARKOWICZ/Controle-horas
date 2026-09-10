import type { HolidayYearSync, Repositories } from '../../database/repositories.js'
import { ExternalServiceError } from '../../shared/errors.js'
import type { HolidayProvider } from './nager-holiday-provider.js'

const FAILURE_COOLDOWN_MS = 60_000

export interface SyncLogger {
  warn(details: Record<string, unknown>, message: string): void
}

/**
 * Keeps the local holiday catalogue filled, one year at a time.
 *
 * A year is fetched from the provider only once: `holiday_year_syncs` records the outcome and
 * a successful row stops any further request. Failures are retried, but not before a cooldown,
 * so a burst of dashboards cannot hammer the provider while it is down.
 */
export class HolidaySyncService {
  private readonly failureCooldown = new Map<string, number>()

  constructor(
    private readonly repositories: Repositories,
    private readonly provider: HolidayProvider,
    private readonly logger: SyncLogger | null = null,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Best-effort synchronisation used by read paths. It never throws: a missing year simply
   * yields an empty calendar, which is exactly how the system behaved before holidays existed.
   */
  async ensureYears(years: readonly number[], countryCode: string): Promise<void> {
    const pending = await this.pendingYears(years, countryCode)
    for (const year of pending) {
      try {
        await this.syncYear(year, countryCode, false)
      } catch (error) {
        this.logger?.warn({ err: error, year, countryCode }, 'Holiday synchronisation failed')
      }
    }
  }

  /** Administrative resync. Unlike `ensureYears` it reports failures to the caller. */
  async resync(year: number, countryCode: string): Promise<HolidayYearSync> {
    return this.syncYear(year, countryCode, true)
  }

  private async pendingYears(years: readonly number[], countryCode: string): Promise<number[]> {
    const unique = [...new Set(years)].sort()
    if (unique.length === 0) return []
    const syncs = await this.repositories.findHolidayYearSyncs(countryCode, unique)
    const succeeded = new Set(syncs.filter((sync) => sync.status === 'SUCCESS').map((sync) => sync.year))
    return unique.filter((year) => !succeeded.has(year) && !this.inCooldown(year, countryCode))
  }

  private inCooldown(year: number, countryCode: string): boolean {
    const until = this.failureCooldown.get(`${countryCode}-${year}`)
    return until !== undefined && until > this.now()
  }

  private async syncYear(year: number, countryCode: string, force: boolean): Promise<HolidayYearSync> {
    try {
      const holidays = await this.provider.fetchYear(year, countryCode)
      const sync = await this.repositories.replaceSyncedHolidayYear(countryCode, year, holidays, force)
      this.failureCooldown.delete(`${countryCode}-${year}`)
      return sync
    } catch (error) {
      this.failureCooldown.set(`${countryCode}-${year}`, this.now() + FAILURE_COOLDOWN_MS)
      const message = error instanceof Error ? error.message : 'Unknown holiday provider failure'
      await this.repositories.recordHolidaySyncFailure(countryCode, year, message).catch(() => undefined)
      throw error instanceof ExternalServiceError ? error : new ExternalServiceError(message)
    }
  }
}
