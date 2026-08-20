import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient, QueryResultRow } from 'pg'
import type { CloseReason, User, UserRole, WorkDay, WorkLog } from '../domain/types.js'
import { ConflictError, RefreshTokenReuseError, UnauthorizedError } from '../shared/errors.js'
import { normalizeWorkDays } from '../domain/types.js'

type DatabaseClient = Pool | PoolClient

interface UserRow extends QueryResultRow {
  id: string; name: string; email: string; password_hash: string; role: UserRole
  manager_id: string | null; manager_name: string | null; created_by_id: string | null
  daily_workload_minutes: number; standard_entry_time: string | null; standard_exit_time: string | null
  lunch_enabled: boolean; lunch_duration_minutes: number; work_days: string | null; work_start_date: string | null
  created_at: Date; updated_at: Date
}

interface WorkLogRow extends QueryResultRow {
  id: string; user_id: string; entry_at: Date; exit_at: Date | null; close_reason: CloseReason | null
  created_at: Date; updated_at: Date
}

const USER_COLUMNS = `
  u.id, u.name, u.email, u.password_hash, u.role, u.manager_id,
  manager.name AS manager_name, u.created_by_id, u.daily_workload_minutes,
  u.standard_entry_time, u.standard_exit_time, u.lunch_enabled,
  u.lunch_duration_minutes, u.work_days, u.work_start_date, u.created_at, u.updated_at`

function mapUser(row: UserRow): User {
  return {
    id: row.id, name: row.name, email: row.email, passwordHash: row.password_hash, role: row.role,
    managerId: row.manager_id, managerName: row.manager_name, createdById: row.created_by_id,
    dailyWorkloadMinutes: row.daily_workload_minutes, standardEntryTime: row.standard_entry_time,
    standardExitTime: row.standard_exit_time, lunchEnabled: row.lunch_enabled,
    lunchDurationMinutes: row.lunch_duration_minutes, workDays: normalizeWorkDays(row.work_days),
    workStartDate: row.work_start_date, createdAt: row.created_at, updatedAt: row.updated_at,
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

export interface PasswordResetTokenRecord { id: string; userId: string; tokenHash: string; expiresAt: Date }

export interface ImportedWorkLog {
  rowNumber: number; userId: string; entryAt: Date; exitAt: Date; closeReason: CloseReason
}

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
    try {
      await this.pool.query(
        `INSERT INTO users (
           id, name, email, password_hash, role, manager_id, created_by_id, work_start_date,
           daily_workload_minutes, standard_entry_time, standard_exit_time,
           lunch_enabled, lunch_duration_minutes, work_days, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW())`,
        [id, input.name, input.email, input.passwordHash, input.role, input.managerId, input.createdById,
          input.workStartDate, input.dailyWorkloadMinutes, input.standardEntryTime, input.standardExitTime,
          input.lunchEnabled, input.lunchDurationMinutes, input.workDays.join(',')],
      )
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictError('Email is already registered')
      throw error
    }
    return (await this.findUserById(id))!
  }

  async saveUser(user: User): Promise<User> {
    try {
      await this.pool.query(
        `UPDATE users SET name=$2, email=$3, role=$4, manager_id=$5, work_start_date=$6,
         daily_workload_minutes=$7, standard_entry_time=$8, standard_exit_time=$9,
         lunch_enabled=$10, lunch_duration_minutes=$11, work_days=$12, updated_at=NOW()
       WHERE id=$1`,
        [user.id, user.name, user.email, user.role, user.managerId, user.workStartDate, user.dailyWorkloadMinutes,
        user.standardEntryTime, user.standardExitTime, user.lunchEnabled, user.lunchDurationMinutes,
        user.workDays.join(',') || null],
      )
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictError('Email is already registered')
      throw error
    }
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
    const result = await this.pool.query(
      `WITH target AS (
         SELECT id FROM work_logs WHERE user_id=$1 AND exit_at IS NULL ORDER BY entry_at DESC LIMIT 1 FOR UPDATE
       ) UPDATE work_logs SET exit_at=$2, close_reason=$3, updated_at=NOW()
       WHERE id IN (SELECT id FROM target)`, [userId, exitAt, reason],
    )
    return (result.rowCount || 0) > 0
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
      await client.query('COMMIT')
      return result.rows[0] ? mapWorkLog(result.rows[0]) : null
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

  async findFirstWorkLog(userId: string): Promise<WorkLog | null> {
    const result = await this.pool.query<WorkLogRow>(
      `SELECT id,user_id,entry_at,exit_at,close_reason,created_at,updated_at FROM work_logs
       WHERE user_id=$1 ORDER BY entry_at ASC LIMIT 1`, [userId],
    )
    return result.rows[0] ? mapWorkLog(result.rows[0]) : null
  }

  async createRefreshToken(record: RefreshTokenRecord, client: DatabaseClient = this.pool): Promise<void> {
    await client.query(
      `INSERT INTO auth_refresh_tokens(id,family_id,user_id,token_hash,expires_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [record.id, record.familyId, record.userId, record.tokenHash, record.expiresAt],
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
          await client.query(`RELEASE SAVEPOINT ${savepoint}`)
        } catch (error) {
          await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`)
          errors.set(row.rowNumber, error instanceof Error ? error.message : 'Unable to import row')
        }
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally { client.release() }
    return errors
  }
}
