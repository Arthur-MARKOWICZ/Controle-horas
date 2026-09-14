import { randomUUID } from 'node:crypto'
import type { Pool, QueryResultRow } from 'pg'
import type { Holiday, HolidayScope, HolidaySource } from '../../domain/types.js'
import { ConflictError } from '../../shared/errors.js'

interface HolidayRow extends QueryResultRow {
  id: string; organization_id: string | null; country_code: string
  subdivision_code: string | null; date: string; name: string
  scope: HolidayScope; source: HolidaySource
}

export interface HolidayRule {
  id: string
  organizationId: string
  holidayId: string
  holidayDate: string
  holidayName: string
  userId: string | null
  userName: string | null
  dayOff: boolean
  observedDate: string | null
  bridgeDate: string | null
  notes: string | null
  createdById: string | null
  createdByName: string
  createdAt: Date
  updatedAt: Date
}

/** A holiday in a period together with the rule that applies to one user, if any. */
export interface ResolvedHoliday {
  holiday: Holiday
  ruleId: string | null
  ruleUserId: string | null
  dayOff: boolean
}

export interface ManualHolidayInput {
  organizationId: string
  countryCode: string
  subdivisionCode: string | null
  date: string
  name: string
  scope: HolidayScope
  createdById: string
}

export interface HolidayRuleInput {
  organizationId: string
  holidayId: string
  userId: string | null
  dayOff: boolean
  observedDate: string | null
  bridgeDate: string | null
  notes: string | null
  createdById: string
  createdByName: string
}

interface HolidayRuleRow extends QueryResultRow {
  id: string; organization_id: string; holiday_id: string; user_id: string | null
  holiday_date: string; holiday_name: string; user_name: string | null
  day_off: boolean; observed_date: string | null; bridge_date: string | null
  notes: string | null; created_by_id: string | null; created_by_name: string
  created_at: Date; updated_at: Date
}

function mapHolidayRule(row: HolidayRuleRow): HolidayRule {
  return {
    id: row.id, organizationId: row.organization_id, holidayId: row.holiday_id,
    holidayDate: row.holiday_date, holidayName: row.holiday_name,
    userId: row.user_id, userName: row.user_name,
    dayOff: row.day_off, observedDate: row.observed_date, bridgeDate: row.bridge_date, notes: row.notes, createdById: row.created_by_id, createdByName: row.created_by_name,
    createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

const HOLIDAY_RULE_COLUMNS = `
  rule.id, rule.organization_id, rule.holiday_id, rule.user_id, rule.day_off, rule.notes,
  rule.observed_date::TEXT AS observed_date, rule.bridge_date::TEXT AS bridge_date,
  rule.created_by_id, rule.created_by_name, rule.created_at, rule.updated_at,
  holiday.date::TEXT AS holiday_date, holiday.name AS holiday_name, target.name AS user_name`

const HOLIDAY_RULE_JOINS = `
  FROM holiday_rules rule
  JOIN holidays holiday ON holiday.id = rule.holiday_id
  LEFT JOIN users target ON target.id = rule.user_id`

export interface SyncedHolidayInput {
  date: string
  name: string
  scope: HolidayScope
  subdivisionCode: string | null
  externalKey: string
}

export interface HolidayYearSync {
  year: number
  status: 'SUCCESS' | 'FAILED'
  holidayCount: number
  syncedAt: Date
}

function mapHoliday(row: HolidayRow): Holiday {
  return {
    id: row.id, organizationId: row.organization_id, countryCode: row.country_code,
    subdivisionCode: row.subdivision_code, date: row.date, name: row.name,
    scope: row.scope, source: row.source,
  }
}

export class HolidayRepository {
  constructor(readonly pool: Pool) {}

  async findHolidayYearSyncs(countryCode: string, years: readonly number[]): Promise<HolidayYearSync[]> {
    if (years.length === 0) return []
    const result = await this.pool.query<{
      year: number; status: 'SUCCESS' | 'FAILED'; holiday_count: number; synced_at: Date
    }>(
      `SELECT year,status,holiday_count,synced_at FROM holiday_year_syncs
       WHERE country_code=$1 AND year = ANY($2::INTEGER[]) ORDER BY year ASC`,
      [countryCode, [...years]],
    )
    return result.rows.map((row) => ({
      year: row.year, status: row.status, holidayCount: row.holiday_count, syncedAt: row.synced_at,
    }))
  }

  /**
   * Persists one synced year atomically. The advisory lock plus the re-check inside the
   * transaction make concurrent requests for the same year fetch and write only once.
   */
  async replaceSyncedHolidayYear(
    countryCode: string, year: number, holidays: readonly SyncedHolidayInput[], force: boolean,
  ): Promise<HolidayYearSync> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`holiday-sync-${countryCode}-${year}`])
      if (!force) {
        const existing = await client.query<{ year: number; status: 'SUCCESS' | 'FAILED'; holiday_count: number; synced_at: Date }>(
          `SELECT year,status,holiday_count,synced_at FROM holiday_year_syncs
           WHERE country_code=$1 AND year=$2 AND status='SUCCESS'`, [countryCode, year],
        )
        const row = existing.rows[0]
        if (row) {
          await client.query('COMMIT')
          return { year: row.year, status: row.status, holidayCount: row.holiday_count, syncedAt: row.synced_at }
        }
      }
      for (const holiday of holidays) {
        await client.query(
          `INSERT INTO holidays(id,organization_id,country_code,subdivision_code,date,name,scope,source,external_key,created_at,updated_at)
           VALUES ($1,NULL,$2,$3,$4::DATE,$5,$6,'NAGER',$7,NOW(),NOW())
           ON CONFLICT (country_code,date,(COALESCE(subdivision_code,'')),external_key) WHERE source='NAGER'
           DO UPDATE SET name=EXCLUDED.name,scope=EXCLUDED.scope,updated_at=NOW()`,
          [
            randomUUID(), countryCode, holiday.subdivisionCode, holiday.date,
            holiday.name, holiday.scope, holiday.externalKey,
          ],
        )
      }
      const saved = await client.query<{ year: number; status: 'SUCCESS' | 'FAILED'; holiday_count: number; synced_at: Date }>(
        `INSERT INTO holiday_year_syncs(country_code,year,status,holiday_count,attempts,error_message,synced_at)
         VALUES ($1,$2,'SUCCESS',$3,1,NULL,NOW())
         ON CONFLICT (country_code,year) DO UPDATE SET
           status='SUCCESS', holiday_count=EXCLUDED.holiday_count,
           attempts=holiday_year_syncs.attempts + 1, error_message=NULL, synced_at=NOW()
         RETURNING year,status,holiday_count,synced_at`,
        [countryCode, year, holidays.length],
      )
      await client.query('COMMIT')
      const row = saved.rows[0]!
      return { year: row.year, status: row.status, holidayCount: row.holiday_count, syncedAt: row.synced_at }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally { client.release() }
  }

  async recordHolidaySyncFailure(countryCode: string, year: number, message: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO holiday_year_syncs(country_code,year,status,holiday_count,attempts,error_message,synced_at)
       VALUES ($1,$2,'FAILED',0,1,$3,NOW())
       ON CONFLICT (country_code,year) DO UPDATE SET
         status='FAILED', attempts=holiday_year_syncs.attempts + 1,
         error_message=EXCLUDED.error_message, synced_at=NOW()`,
      [countryCode, year, message.slice(0, 255)],
    )
  }

  /**
   * Holidays in a period with the rule that wins for one user.
   *
   * The precedence "user rule beats organization rule beats no rule" is decided here, by the
   * ORDER BY: `false` (a user rule) sorts before `true` (an organization rule) before `NULL`
   * (no rule at all), and DISTINCT ON keeps the first. Resolving it in SQL keeps a single
   * source of truth instead of two that can drift.
   */
  async findResolvedHolidays(
    countryCode: string, organizationId: string, userId: string, startDate: string, endDate: string,
  ): Promise<Array<{
    holiday: Holiday; ruleId: string | null; ruleUserId: string | null; ruleDayOff: boolean | null
    ruleObservedDate: string | null; ruleBridgeDate: string | null
  }>> {
    const result = await this.pool.query<HolidayRow & {
      rule_id: string | null; rule_user_id: string | null; rule_day_off: boolean | null
      rule_observed_date: string | null; rule_bridge_date: string | null
    }>(
      `SELECT * FROM (
         SELECT DISTINCT ON (h.id)
           h.id, h.organization_id, h.country_code, h.subdivision_code, h.date::TEXT AS date,
           h.name, h.scope, h.source,
           r.id AS rule_id, r.user_id AS rule_user_id, r.day_off AS rule_day_off,
           r.observed_date::TEXT AS rule_observed_date, r.bridge_date::TEXT AS rule_bridge_date
         FROM holidays h
         LEFT JOIN holiday_rules r
                ON r.holiday_id = h.id AND r.organization_id = $2
               AND (r.user_id IS NULL OR r.user_id = $3)
         WHERE h.country_code = $1
           AND (h.organization_id IS NULL OR h.organization_id = $2)
           AND (h.date BETWEEN $4::DATE AND $5::DATE
                OR r.observed_date BETWEEN $4::DATE AND $5::DATE
                OR r.bridge_date BETWEEN $4::DATE AND $5::DATE)
         ORDER BY h.id, (r.user_id IS NULL) ASC NULLS LAST
       ) resolved
       ORDER BY resolved.date ASC, resolved.name ASC`,
      [countryCode, organizationId, userId, startDate, endDate],
    )
    return result.rows.map((row) => ({
      holiday: mapHoliday(row),
      ruleId: row.rule_id,
      ruleUserId: row.rule_user_id,
      ruleDayOff: row.rule_day_off,
      ruleObservedDate: row.rule_observed_date,
      ruleBridgeDate: row.rule_bridge_date,
    }))
  }

  async findHolidayById(id: string): Promise<Holiday | null> {
    const result = await this.pool.query<HolidayRow>(
      `SELECT id,organization_id,country_code,subdivision_code,date::TEXT AS date,name,scope,source
       FROM holidays WHERE id=$1`, [id],
    )
    return result.rows[0] ? mapHoliday(result.rows[0]) : null
  }

  async findHolidayRules(organizationId: string, userIds: readonly string[] | null): Promise<HolidayRule[]> {
    // A null userIds means "every rule of the organization"; an array also keeps organization-wide rules.
    const result = await this.pool.query<HolidayRuleRow>(
      `SELECT ${HOLIDAY_RULE_COLUMNS} ${HOLIDAY_RULE_JOINS}
       WHERE rule.organization_id=$1
         AND ($2::UUID[] IS NULL OR rule.user_id IS NULL OR rule.user_id = ANY($2::UUID[]))
       ORDER BY holiday.date DESC, rule.created_at DESC`,
      [organizationId, userIds ? [...userIds] : null],
    )
    return result.rows.map(mapHolidayRule)
  }

  async findHolidayRuleById(id: string): Promise<HolidayRule | null> {
    const result = await this.pool.query<HolidayRuleRow>(
      `SELECT ${HOLIDAY_RULE_COLUMNS} ${HOLIDAY_RULE_JOINS} WHERE rule.id=$1`, [id],
    )
    return result.rows[0] ? mapHolidayRule(result.rows[0]) : null
  }

  async upsertHolidayRules(inputs: readonly HolidayRuleInput[]): Promise<HolidayRule[]> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const savedIds: string[] = []
      for (const input of inputs) {
        const conflict = input.userId
          ? 'ON CONFLICT (holiday_id, user_id) WHERE user_id IS NOT NULL'
          : 'ON CONFLICT (organization_id, holiday_id) WHERE user_id IS NULL'
        const result = await client.query<{ id: string }>(
          `INSERT INTO holiday_rules(
             id, organization_id, holiday_id, user_id, day_off, observed_date, bridge_date, notes,
             created_by_id, created_by_name, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6::DATE,$7::DATE,$8,$9,$10,NOW(),NOW())
           ${conflict} DO UPDATE SET
             day_off=EXCLUDED.day_off, observed_date=EXCLUDED.observed_date,
             bridge_date=EXCLUDED.bridge_date, notes=EXCLUDED.notes,
             created_by_id=EXCLUDED.created_by_id, created_by_name=EXCLUDED.created_by_name,
             updated_at=NOW()
           RETURNING id`,
          [
            randomUUID(), input.organizationId, input.holidayId, input.userId,
            input.dayOff, input.observedDate, input.bridgeDate, input.notes,
            input.createdById, input.createdByName,
          ],
        )
        savedIds.push(result.rows[0]!.id)
      }
      const saved = await client.query<HolidayRuleRow>(
        `SELECT ${HOLIDAY_RULE_COLUMNS} ${HOLIDAY_RULE_JOINS} WHERE rule.id = ANY($1::UUID[])
         ORDER BY holiday.date DESC, rule.created_at DESC`, [savedIds],
      )
      await client.query('COMMIT')
      return saved.rows.map(mapHolidayRule)
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally { client.release() }
  }

  async deleteHolidayRule(id: string, organizationId: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM holiday_rules WHERE id=$1 AND organization_id=$2', [id, organizationId],
    )
    return (result.rowCount || 0) > 0
  }

  async createManualHoliday(input: ManualHolidayInput): Promise<Holiday> {
    const id = randomUUID()
    try {
      await this.pool.query(
        `INSERT INTO holidays(
           id, organization_id, country_code, subdivision_code, date, name, scope, source,
           external_key, created_by_id, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5::DATE,$6,$7,'MANUAL',NULL,$8,NOW(),NOW())`,
        [
          id, input.organizationId, input.countryCode, input.subdivisionCode,
          input.date, input.name, input.scope, input.createdById,
        ],
      )
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictError('A holiday with this name already exists on this date')
      }
      throw error
    }
    return (await this.findHolidayById(id))!
  }

  /** Only a manual holiday of the given organization can be removed; its rules cascade away with it. */
  async deleteManualHoliday(id: string, organizationId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM holidays WHERE id=$1 AND organization_id=$2 AND source='MANUAL'`,
      [id, organizationId],
    )
    return (result.rowCount || 0) > 0
  }
}
