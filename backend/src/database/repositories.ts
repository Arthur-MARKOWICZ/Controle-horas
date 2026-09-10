import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient, QueryResultRow } from 'pg'
import type {
  CloseReason, Holiday, HolidayScope, HolidaySource, User, UserRole, WorkDay, WorkedDayTotals, WorkLog,
} from '../domain/types.js'
import { ConflictError, RefreshTokenReuseError, UnauthorizedError } from '../shared/errors.js'
import { normalizeWorkDays } from '../domain/types.js'

type DatabaseClient = Pool | PoolClient

interface UserRow extends QueryResultRow {
  id: string; name: string; email: string; password_hash: string; role: UserRole
  manager_id: string | null; manager_name: string | null; created_by_id: string | null
  daily_workload_minutes: number; standard_entry_time: string | null; standard_exit_time: string | null
  lunch_enabled: boolean; lunch_duration_minutes: number; work_days: string | null; work_start_date: string | null; hour_bank_minutes: number
  total_worked_days: number; scheduled_worked_days: number; outside_schedule_worked_days: number
  created_at: Date; updated_at: Date
}

interface WorkLogRow extends QueryResultRow {
  id: string; user_id: string; entry_at: Date; exit_at: Date | null; close_reason: CloseReason | null
  created_at: Date; updated_at: Date
}

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

const USER_COLUMNS = `
  u.id, u.name, u.email, u.password_hash, u.role, u.manager_id,
  manager.name AS manager_name, u.created_by_id, u.daily_workload_minutes,
  u.standard_entry_time, u.standard_exit_time, u.lunch_enabled,
  u.lunch_duration_minutes, u.work_days, u.work_start_date, u.hour_bank_minutes,
  u.total_worked_days, u.scheduled_worked_days, u.outside_schedule_worked_days, u.created_at, u.updated_at`

const WORKED_DAY_TOTALS_SQL = `
  WITH worked_dates AS (
    SELECT DISTINCT day.date::DATE AS worked_date
    FROM work_logs log
    CROSS JOIN LATERAL generate_series(
      (log.entry_at AT TIME ZONE 'America/Sao_Paulo')::DATE,
      ((log.exit_at - INTERVAL '1 microsecond') AT TIME ZONE 'America/Sao_Paulo')::DATE,
      INTERVAL '1 day'
    ) AS day(date)
    WHERE log.user_id=$1 AND log.exit_at IS NOT NULL AND log.exit_at > log.entry_at
  ), classified AS (
    SELECT worked_date,
      CASE EXTRACT(ISODOW FROM worked_date)::INTEGER
        WHEN 1 THEN 'MONDAY' WHEN 2 THEN 'TUESDAY' WHEN 3 THEN 'WEDNESDAY'
        WHEN 4 THEN 'THURSDAY' WHEN 5 THEN 'FRIDAY' WHEN 6 THEN 'SATURDAY'
        ELSE 'SUNDAY'
      END = ANY(string_to_array(COALESCE(schedule.work_days, ''), ',')) AS in_schedule
    FROM worked_dates
    LEFT JOIN LATERAL (
      SELECT work_days FROM user_work_schedule_versions
      WHERE user_id=$1 AND effective_from <= worked_dates.worked_date
      ORDER BY effective_from DESC LIMIT 1
    ) schedule ON TRUE
  ), totals AS (
    SELECT COUNT(*)::INTEGER AS total,
      COUNT(*) FILTER (WHERE in_schedule)::INTEGER AS in_schedule,
      COUNT(*) FILTER (WHERE NOT in_schedule)::INTEGER AS outside_schedule
    FROM classified
  )
  UPDATE users SET
    total_worked_days=(SELECT total FROM totals),
    scheduled_worked_days=(SELECT in_schedule FROM totals),
    outside_schedule_worked_days=(SELECT outside_schedule FROM totals),
    updated_at=NOW()
  WHERE id=$1
  RETURNING total_worked_days,scheduled_worked_days,outside_schedule_worked_days`

function mapUser(row: UserRow): User {
  return {
    id: row.id, name: row.name, email: row.email, passwordHash: row.password_hash, role: row.role,
    managerId: row.manager_id, managerName: row.manager_name, createdById: row.created_by_id,
    dailyWorkloadMinutes: row.daily_workload_minutes, standardEntryTime: row.standard_entry_time,
    standardExitTime: row.standard_exit_time, lunchEnabled: row.lunch_enabled,
    lunchDurationMinutes: row.lunch_duration_minutes, workDays: normalizeWorkDays(row.work_days),
    workStartDate: row.work_start_date, hourBankMinutes: row.hour_bank_minutes,
    workedDayTotals: { total: row.total_worked_days, inSchedule: row.scheduled_worked_days, outsideSchedule: row.outside_schedule_worked_days },
    createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

function mapWorkLog(row: WorkLogRow): WorkLog {
  return {
    id: row.id, userId: row.user_id, entryAt: row.entry_at, exitAt: row.exit_at,
    closeReason: row.close_reason, createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

export interface NewUser {
  name: string; email: string; passwordHash: string; role: UserRole
  managerId: string | null; createdById: string | null; workStartDate: string | null
  dailyWorkloadMinutes: number; standardEntryTime: string | null; standardExitTime: string | null
  lunchEnabled: boolean; lunchDurationMinutes: number; workDays: WorkDay[]
}

export interface RefreshTokenRecord {
  id: string; familyId: string; userId: string; tokenHash: string; expiresAt: Date
}

export interface BiometricCredentialRecord { id: string; userId: string; secretHash: string }

export interface PasswordResetTokenRecord { id: string; userId: string; tokenHash: string; expiresAt: Date }

export interface ImportedWorkLog {
  rowNumber: number; userId: string; entryAt: Date; exitAt: Date; closeReason: CloseReason
}

export interface WorkScheduleVersion { effectiveFrom: string; workDays: WorkDay[] }

export class Repositories {
  constructor(readonly pool: Pool) {}

  async findUserByEmail(email: string, client: DatabaseClient = this.pool): Promise<User | null> {
    const result = await client.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users u LEFT JOIN users manager ON manager.id = u.manager_id WHERE u.email = $1`,
      [email],
    )
    return result.rows[0] ? mapUser(result.rows[0]) : null
  }

  async findUserById(id: string, client: DatabaseClient = this.pool): Promise<User | null> {
    const result = await client.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users u LEFT JOIN users manager ON manager.id = u.manager_id WHERE u.id = $1`,
      [id],
    )
    return result.rows[0] ? mapUser(result.rows[0]) : null
  }

  async emailExists(email: string): Promise<boolean> {
    const result = await this.pool.query<{ exists: boolean }>('SELECT EXISTS(SELECT 1 FROM users WHERE email = $1) AS exists', [email])
    return result.rows[0]?.exists === true
  }

  async createUser(input: NewUser): Promise<User> {
    const id = randomUUID()
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `INSERT INTO users (
           id, name, email, password_hash, role, manager_id, created_by_id, work_start_date,
           daily_workload_minutes, standard_entry_time, standard_exit_time,
           lunch_enabled, lunch_duration_minutes, work_days, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW())`,
        [id, input.name, input.email, input.passwordHash, input.role, input.managerId, input.createdById,
          input.workStartDate, input.dailyWorkloadMinutes, input.standardEntryTime, input.standardExitTime,
          input.lunchEnabled, input.lunchDurationMinutes, input.workDays.join(',')],
      )
      await client.query(
        `INSERT INTO user_work_schedule_versions(user_id,effective_from,work_days)
         VALUES ($1,DATE '0001-01-01',$2)`, [id, input.workDays.join(',')],
      )
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      if ((error as { code?: string }).code === '23505') throw new ConflictError('Email is already registered')
      throw error
    } finally { client.release() }
    return (await this.findUserById(id))!
  }

  async saveUser(user: User): Promise<User> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const current = await client.query<{ work_days: string | null }>('SELECT work_days FROM users WHERE id=$1 FOR UPDATE', [user.id])
      await client.query(
        `UPDATE users SET name=$2, email=$3, role=$4, manager_id=$5, work_start_date=$6,
         daily_workload_minutes=$7, standard_entry_time=$8, standard_exit_time=$9,
         lunch_enabled=$10, lunch_duration_minutes=$11, work_days=$12, updated_at=NOW()
       WHERE id=$1`,
        [user.id, user.name, user.email, user.role, user.managerId, user.workStartDate, user.dailyWorkloadMinutes,
        user.standardEntryTime, user.standardExitTime, user.lunchEnabled, user.lunchDurationMinutes,
        user.workDays.join(',') || null],
      )
      if ((current.rows[0]?.work_days || '') !== user.workDays.join(',')) {
        await client.query(
          `INSERT INTO user_work_schedule_versions(user_id,effective_from,work_days)
           VALUES ($1,(NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE + 1,$2)
           ON CONFLICT (user_id,effective_from) DO UPDATE SET work_days=EXCLUDED.work_days`,
          [user.id, user.workDays.join(',')],
        )
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      if ((error as { code?: string }).code === '23505') throw new ConflictError('Email is already registered')
      throw error
    } finally { client.release() }
    return (await this.findUserById(user.id))!
  }

  async listCreatedSubtree(rootId: string): Promise<User[]> {
    const result = await this.pool.query<UserRow>(
      `WITH RECURSIVE tree AS (
         SELECT id FROM users WHERE id = $1
         UNION ALL
         SELECT child.id FROM users child JOIN tree parent ON child.created_by_id = parent.id
       )
       SELECT ${USER_COLUMNS} FROM users u
       LEFT JOIN users manager ON manager.id = u.manager_id
       JOIN tree ON tree.id = u.id ORDER BY u.name ASC`,
      [rootId],
    )
    return result.rows.map(mapUser)
  }

  async listManagerTeam(managerId: string): Promise<User[]> {
    const result = await this.pool.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users u LEFT JOIN users manager ON manager.id = u.manager_id
       WHERE u.id = $1 OR u.manager_id = $1 ORDER BY u.name ASC`, [managerId],
    )
    return result.rows.map(mapUser)
  }

  async isInCreatedSubtree(rootId: string, targetId: string): Promise<boolean> {
    const result = await this.pool.query<{ exists: boolean }>(
      `WITH RECURSIVE ancestors AS (
         SELECT id, created_by_id FROM users WHERE id = $2
         UNION ALL
         SELECT parent.id, parent.created_by_id FROM users parent
         JOIN ancestors child ON child.created_by_id = parent.id
       ) SELECT EXISTS(SELECT 1 FROM ancestors WHERE id = $1) AS exists`,
      [rootId, targetId],
    )
    return result.rows[0]?.exists === true
  }

  async findOpenWorkLog(userId: string, client: DatabaseClient = this.pool): Promise<WorkLog | null> {
    const result = await client.query<WorkLogRow>(
      `SELECT id,user_id,entry_at,exit_at,close_reason,created_at,updated_at FROM work_logs
       WHERE user_id=$1 AND exit_at IS NULL ORDER BY entry_at DESC LIMIT 1`, [userId],
    )
    return result.rows[0] ? mapWorkLog(result.rows[0]) : null
  }

  async openWorkLog(userId: string, entryAt: Date): Promise<void> {
    try {
      await this.pool.query(
        'INSERT INTO work_logs(id,user_id,entry_at,created_at,updated_at) VALUES ($1,$2,$3,NOW(),NOW())',
        [randomUUID(), userId, entryAt],
      )
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictError('An entry is already open. Pause or register the exit first.')
      }
      throw error
    }
  }

  async closeOpenWorkLog(userId: string, exitAt: Date, reason: CloseReason): Promise<boolean> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId])
      const result = await client.query(
        `WITH target AS (
           SELECT id FROM work_logs WHERE user_id=$1 AND exit_at IS NULL ORDER BY entry_at DESC LIMIT 1 FOR UPDATE
         ) UPDATE work_logs SET exit_at=$2, close_reason=$3, updated_at=NOW()
         WHERE id IN (SELECT id FROM target)`, [userId, exitAt, reason],
      )
      if (result.rowCount) await this.recalculateWorkedDayTotalsInTransaction(userId, client)
      await client.query('COMMIT')
      return (result.rowCount || 0) > 0
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally { client.release() }
  }

  async createClosedWorkLog(userId: string, entryAt: Date, exitAt: Date): Promise<WorkLog> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId])
      const overlap = await client.query(
        `SELECT id FROM work_logs WHERE user_id=$1 AND entry_at < $3
         AND (exit_at IS NULL OR exit_at > $2) LIMIT 1`, [userId, entryAt, exitAt],
      )
      if (overlap.rowCount) throw new ConflictError('Overlapping work log already exists for this period')
      const id = randomUUID()
      await client.query(
        `INSERT INTO work_logs(id,user_id,entry_at,exit_at,close_reason,created_at,updated_at)
         VALUES ($1,$2,$3,$4,'EXIT',NOW(),NOW())`, [id, userId, entryAt, exitAt],
      )
      await this.recalculateWorkedDayTotalsInTransaction(userId, client)
      await client.query('COMMIT')
      return (await this.findWorkLogById(userId, id))!
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally { client.release() }
  }

  async updateClosedWorkLog(userId: string, id: string, entryAt: Date, exitAt: Date): Promise<WorkLog | null> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId])
      const existing = await client.query<WorkLogRow>(
        `SELECT id,user_id,entry_at,exit_at,close_reason,created_at,updated_at FROM work_logs
         WHERE id=$1 AND user_id=$2 FOR UPDATE`, [id, userId],
      )
      if (!existing.rows[0]) { await client.query('COMMIT'); return null }
      if (!existing.rows[0].exit_at) throw new ConflictError('An open work log cannot be edited administratively')
      const overlap = await client.query(
        `SELECT id FROM work_logs WHERE user_id=$1 AND id <> $2 AND entry_at < $4
         AND (exit_at IS NULL OR exit_at > $3) LIMIT 1`, [userId, id, entryAt, exitAt],
      )
      if (overlap.rowCount) throw new ConflictError('Overlapping work log already exists for this period')
      const result = await client.query<WorkLogRow>(
        `UPDATE work_logs SET entry_at=$3, exit_at=$4, close_reason='EXIT', updated_at=NOW()
         WHERE id=$1 AND user_id=$2
         RETURNING id,user_id,entry_at,exit_at,close_reason,created_at,updated_at`, [id, userId, entryAt, exitAt],
      )
      await this.recalculateWorkedDayTotalsInTransaction(userId, client)
      await client.query('COMMIT')
      return result.rows[0] ? mapWorkLog(result.rows[0]) : null
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally { client.release() }
  }

  async deleteClosedWorkLog(userId: string, id: string): Promise<boolean> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId])
      const existing = await client.query<WorkLogRow>(
        `SELECT id,user_id,entry_at,exit_at,close_reason,created_at,updated_at FROM work_logs
         WHERE id=$1 AND user_id=$2 FOR UPDATE`, [id, userId],
      )
      if (!existing.rows[0]) { await client.query('COMMIT'); return false }
      if (!existing.rows[0].exit_at) throw new ConflictError('An open work log cannot be deleted administratively')
      await client.query('DELETE FROM work_logs WHERE id=$1 AND user_id=$2', [id, userId])
      await this.recalculateWorkedDayTotalsInTransaction(userId, client)
      await client.query('COMMIT')
      return true
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally { client.release() }
  }

  private async findWorkLogById(userId: string, id: string): Promise<WorkLog | null> {
    const result = await this.pool.query<WorkLogRow>(
      `SELECT id,user_id,entry_at,exit_at,close_reason,created_at,updated_at FROM work_logs
       WHERE id=$1 AND user_id=$2`, [id, userId],
    )
    return result.rows[0] ? mapWorkLog(result.rows[0]) : null
  }

  async findWorkLogsInRange(userId: string, start: Date, end: Date): Promise<WorkLog[]> {
    const result = await this.pool.query<WorkLogRow>(
      `SELECT id,user_id,entry_at,exit_at,close_reason,created_at,updated_at FROM work_logs
       WHERE user_id=$1 AND entry_at >= $2 AND entry_at < $3 ORDER BY entry_at ASC`, [userId, start, end],
    )
    return result.rows.map(mapWorkLog)
  }

  async findWorkLogsOverlappingRange(userId: string, start: Date, end: Date): Promise<WorkLog[]> {
    const result = await this.pool.query<WorkLogRow>(
      `SELECT id,user_id,entry_at,exit_at,close_reason,created_at,updated_at FROM work_logs
       WHERE user_id=$1 AND entry_at < $3 AND (exit_at IS NULL OR exit_at > $2) ORDER BY entry_at ASC`,
      [userId, start, end],
    )
    return result.rows.map(mapWorkLog)
  }

  async findWorkLogsUntil(userId: string, start: Date | null, end: Date): Promise<WorkLog[]> {
    const result = await this.pool.query<WorkLogRow>(
      `SELECT id,user_id,entry_at,exit_at,close_reason,created_at,updated_at FROM work_logs
       WHERE user_id=$1 AND ($2::timestamptz IS NULL OR entry_at >= $2) AND entry_at < $3 ORDER BY entry_at ASC`,
      [userId, start, end],
    )
    return result.rows.map(mapWorkLog)
  }

  async findClosedWorkLogs(userId: string): Promise<WorkLog[]> {
    const result = await this.pool.query<WorkLogRow>(
      `SELECT id,user_id,entry_at,exit_at,close_reason,created_at,updated_at FROM work_logs
       WHERE user_id=$1 AND exit_at IS NOT NULL ORDER BY entry_at ASC`, [userId],
    )
    return result.rows.map(mapWorkLog)
  }

  async findWorkScheduleVersions(userId: string): Promise<WorkScheduleVersion[]> {
    const result = await this.pool.query<{ effective_from: string; work_days: string }>(
      `SELECT effective_from::TEXT,work_days FROM user_work_schedule_versions
       WHERE user_id=$1 ORDER BY effective_from ASC`, [userId],
    )
    return result.rows.map((row) => ({ effectiveFrom: row.effective_from, workDays: normalizeWorkDays(row.work_days) }))
  }

  async findFirstWorkLog(userId: string): Promise<WorkLog | null> {
    const result = await this.pool.query<WorkLogRow>(
      `SELECT id,user_id,entry_at,exit_at,close_reason,created_at,updated_at FROM work_logs
       WHERE user_id=$1 ORDER BY entry_at ASC LIMIT 1`, [userId],
    )
    return result.rows[0] ? mapWorkLog(result.rows[0]) : null
  }

  async replaceHourBankMinutes(userId: string, hourBankMinutes: number): Promise<{ previousHourBankMinutes: number; hourBankMinutes: number }> {
    const result = await this.pool.query<{ previous_hour_bank_minutes: number; hour_bank_minutes: number }>(
      `WITH locked AS (
         SELECT hour_bank_minutes FROM users WHERE id=$1 FOR UPDATE
       ), updated AS (
         UPDATE users SET hour_bank_minutes=$2,updated_at=NOW() WHERE id=$1
         RETURNING hour_bank_minutes
       ) SELECT locked.hour_bank_minutes AS previous_hour_bank_minutes,updated.hour_bank_minutes
         FROM locked CROSS JOIN updated`,
      [userId, hourBankMinutes],
    )
    const row = result.rows[0]
    if (!row) throw new Error('User not found while replacing hour bank balance')
    return { previousHourBankMinutes: row.previous_hour_bank_minutes, hourBankMinutes: row.hour_bank_minutes }
  }

  async recalculateWorkedDayTotals(userId: string): Promise<WorkedDayTotals> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId])
      const totals = await this.recalculateWorkedDayTotalsInTransaction(userId, client)
      await client.query('COMMIT')
      return totals
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally { client.release() }
  }

  private async recalculateWorkedDayTotalsInTransaction(userId: string, client: PoolClient): Promise<WorkedDayTotals> {
    const result = await client.query<{
      total_worked_days: number; scheduled_worked_days: number; outside_schedule_worked_days: number
    }>(WORKED_DAY_TOTALS_SQL, [userId])
    const row = result.rows[0]
    if (!row) throw new Error('User not found while recalculating worked day totals')
    return { total: row.total_worked_days, inSchedule: row.scheduled_worked_days, outsideSchedule: row.outside_schedule_worked_days }
  }

  async createRefreshToken(record: RefreshTokenRecord, client: DatabaseClient = this.pool): Promise<void> {
    await client.query(
      `INSERT INTO auth_refresh_tokens(id,family_id,user_id,token_hash,expires_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [record.id, record.familyId, record.userId, record.tokenHash, record.expiresAt],
    )
  }

  async createBiometricCredential(record: BiometricCredentialRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO mobile_biometric_credentials(id,user_id,secret_hash)
       VALUES ($1,$2,$3)`,
      [record.id, record.userId, record.secretHash],
    )
  }

  async useBiometricCredential(id: string, secretHash: string, email: string): Promise<string | null> {
    const result = await this.pool.query<{ user_id: string }>(
      `UPDATE mobile_biometric_credentials credential SET last_used_at=NOW()
       FROM users user_account
       WHERE credential.id=$1 AND credential.secret_hash=$2
         AND credential.revoked_at IS NULL
         AND user_account.id=credential.user_id AND user_account.email=$3
       RETURNING credential.user_id`,
      [id, secretHash, email],
    )
    return result.rows[0]?.user_id || null
  }

  async revokeBiometricCredential(id: string, userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE mobile_biometric_credentials SET revoked_at=COALESCE(revoked_at,NOW())
       WHERE id=$1 AND user_id=$2`,
      [id, userId],
    )
  }

  async revokeAllBiometricCredentials(userId: string, client: DatabaseClient = this.pool): Promise<void> {
    await client.query(
      `UPDATE mobile_biometric_credentials SET revoked_at=COALESCE(revoked_at,NOW())
       WHERE user_id=$1`,
      [userId],
    )
  }

  async rotateRefreshToken(currentId: string, tokenHash: string, next: RefreshTokenRecord): Promise<string> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query<{
        id: string; family_id: string; user_id: string; token_hash: string; expires_at: Date; revoked_at: Date | null
      }>('SELECT id,family_id,user_id,token_hash,expires_at,revoked_at FROM auth_refresh_tokens WHERE id=$1 FOR UPDATE', [currentId])
      const current = result.rows[0]
      if (!current || current.token_hash.trim() !== tokenHash || current.expires_at <= new Date()) {
        throw new UnauthorizedError('Refresh token is invalid or expired')
      }
      if (current.revoked_at) {
        await client.query('UPDATE auth_refresh_tokens SET revoked_at=COALESCE(revoked_at,NOW()) WHERE family_id=$1', [current.family_id])
        await client.query('COMMIT')
        throw new RefreshTokenReuseError()
      }
      await this.createRefreshToken(next, client)
      await client.query(
        'UPDATE auth_refresh_tokens SET revoked_at=NOW(),last_used_at=NOW(),replaced_by_id=$2 WHERE id=$1',
        [currentId, next.id],
      )
      await client.query('COMMIT')
      return current.user_id
    } catch (error) {
      if (!(error instanceof RefreshTokenReuseError)) await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally { client.release() }
  }

  async revokeRefreshFamily(id: string, tokenHash: string): Promise<void> {
    await this.pool.query(
      `UPDATE auth_refresh_tokens SET revoked_at=COALESCE(revoked_at,NOW())
       WHERE family_id=(SELECT family_id FROM auth_refresh_tokens WHERE id=$1 AND token_hash=$2)`,
      [id, tokenHash],
    )
  }

  async cleanupRefreshTokens(): Promise<void> {
    await this.pool.query(
      `DELETE FROM auth_refresh_tokens
       WHERE expires_at < NOW() - INTERVAL '7 days' OR revoked_at < NOW() - INTERVAL '30 days'`,
    )
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.pool.query('UPDATE users SET password_hash=$2,updated_at=NOW() WHERE id=$1', [userId, passwordHash])
  }

  async revokeAllRefreshTokens(userId: string, client: DatabaseClient = this.pool): Promise<void> {
    await client.query('UPDATE auth_refresh_tokens SET revoked_at=COALESCE(revoked_at,NOW()) WHERE user_id=$1', [userId])
  }

  async createPasswordResetToken(record: PasswordResetTokenRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO password_reset_tokens(id,user_id,token_hash,expires_at)
       VALUES ($1,$2,$3,$4)`,
      [record.id, record.userId, record.tokenHash, record.expiresAt],
    )
  }

  async resetPasswordWithToken(tokenHash: string, passwordHash: string): Promise<boolean> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query<{ user_id: string }>(
        `UPDATE password_reset_tokens SET used_at=NOW()
         WHERE token_hash=$1 AND used_at IS NULL AND expires_at > NOW()
         RETURNING user_id`, [tokenHash],
      )
      const token = result.rows[0]
      if (!token) { await client.query('COMMIT'); return false }
      await client.query('UPDATE users SET password_hash=$2,updated_at=NOW() WHERE id=$1', [token.user_id, passwordHash])
      await this.revokeAllRefreshTokens(token.user_id, client)
      await this.revokeAllBiometricCredentials(token.user_id, client)
      await client.query('COMMIT')
      return true
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally { client.release() }
  }

  async cleanupPasswordResetTokens(): Promise<void> {
    await this.pool.query(`DELETE FROM password_reset_tokens WHERE expires_at < NOW() - INTERVAL '1 day' OR used_at < NOW() - INTERVAL '1 day'`)
  }

  async importClosedWorkLogs(rows: ImportedWorkLog[]): Promise<Map<number, string>> {
    const errors = new Map<number, string>()
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const userIds = [...new Set(rows.map((row) => row.userId))].sort()
      for (const userId of userIds) {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId])
      }
      const importedUserIds = new Set<string>()
      for (const row of rows) {
        const savepoint = `import_row_${row.rowNumber}`
        await client.query(`SAVEPOINT ${savepoint}`)
        try {
          const overlap = await client.query(
            `SELECT id FROM work_logs WHERE user_id=$1 AND entry_at < $3
             AND (exit_at IS NULL OR exit_at > $2) LIMIT 1`,
            [row.userId, row.entryAt, row.exitAt],
          )
          if (overlap.rowCount) throw new ConflictError('Overlapping work log already exists for this period')
          await client.query(
            `INSERT INTO work_logs(id,user_id,entry_at,exit_at,close_reason,created_at,updated_at)
             VALUES ($1,$2,$3,$4,$5,NOW(),NOW())`,
            [randomUUID(), row.userId, row.entryAt, row.exitAt, row.closeReason],
          )
          importedUserIds.add(row.userId)
          await client.query(`RELEASE SAVEPOINT ${savepoint}`)
        } catch (error) {
          await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`)
          errors.set(row.rowNumber, error instanceof Error ? error.message : 'Unable to import row')
        }
      }
      for (const userId of importedUserIds) await this.recalculateWorkedDayTotalsInTransaction(userId, client)
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally { client.release() }
    return errors
  }

  async findOrganizationRootId(userId: string): Promise<string | null> {
    const result = await this.pool.query<{ id: string }>(
      `WITH RECURSIVE ancestors AS (
         SELECT id, created_by_id, 0 AS depth FROM users WHERE id=$1
         UNION ALL
         SELECT parent.id, parent.created_by_id, child.depth + 1
         FROM users parent JOIN ancestors child ON child.created_by_id = parent.id
         WHERE child.depth < 64
       )
       SELECT id FROM ancestors ORDER BY (created_by_id IS NOT NULL) ASC, depth DESC LIMIT 1`,
      [userId],
    )
    return result.rows[0]?.id || null
  }

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
