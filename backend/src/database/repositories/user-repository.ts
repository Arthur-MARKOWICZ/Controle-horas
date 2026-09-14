import { randomUUID } from 'node:crypto'
import type { Pool, QueryResultRow } from 'pg'
import type { User, UserRole, WorkDay } from '../../domain/types.js'
import { normalizeWorkDays } from '../../domain/types.js'
import { ConflictError } from '../../shared/errors.js'
import type { DatabaseClient } from './database-client.js'

interface UserRow extends QueryResultRow {
  id: string; name: string; email: string; password_hash: string; role: UserRole
  manager_id: string | null; manager_name: string | null; created_by_id: string | null
  daily_workload_minutes: number; standard_entry_time: string | null; standard_exit_time: string | null
  lunch_enabled: boolean; lunch_duration_minutes: number; work_days: string | null; work_start_date: string | null; hour_bank_minutes: number
  total_worked_days: number; scheduled_worked_days: number; outside_schedule_worked_days: number
  created_at: Date; updated_at: Date
}

const USER_COLUMNS = `
  u.id, u.name, u.email, u.password_hash, u.role, u.manager_id,
  manager.name AS manager_name, u.created_by_id, u.daily_workload_minutes,
  u.standard_entry_time, u.standard_exit_time, u.lunch_enabled,
  u.lunch_duration_minutes, u.work_days, u.work_start_date, u.hour_bank_minutes,
  u.total_worked_days, u.scheduled_worked_days, u.outside_schedule_worked_days, u.created_at, u.updated_at`

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

export interface NewUser {
  name: string; email: string; passwordHash: string; role: UserRole
  managerId: string | null; createdById: string | null; workStartDate: string | null
  dailyWorkloadMinutes: number; standardEntryTime: string | null; standardExitTime: string | null
  lunchEnabled: boolean; lunchDurationMinutes: number; workDays: WorkDay[]
}

export class UserRepository {
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
}
