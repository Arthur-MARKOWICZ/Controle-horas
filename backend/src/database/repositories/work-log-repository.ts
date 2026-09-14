import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient, QueryResultRow } from 'pg'
import type { CloseReason, WorkDay, WorkedDayTotals, WorkLog } from '../../domain/types.js'
import { normalizeWorkDays } from '../../domain/types.js'
import { ConflictError } from '../../shared/errors.js'
import type { DatabaseClient } from './database-client.js'

interface WorkLogRow extends QueryResultRow {
  id: string; user_id: string; entry_at: Date; exit_at: Date | null; close_reason: CloseReason | null
  created_at: Date; updated_at: Date
}

function mapWorkLog(row: WorkLogRow): WorkLog {
  return {
    id: row.id, userId: row.user_id, entryAt: row.entry_at, exitAt: row.exit_at,
    closeReason: row.close_reason, createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

export interface ImportedWorkLog {
  rowNumber: number; userId: string; entryAt: Date; exitAt: Date; closeReason: CloseReason
}

export interface WorkScheduleVersion { effectiveFrom: string; workDays: WorkDay[] }

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

export class WorkLogRepository {
  constructor(readonly pool: Pool) {}

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
}
