import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import pg from 'pg'

const LOAD_DATABASE_NAME = 'controle_horas_load'
const DEFAULT_USER_COUNT = 100
const LOAD_PASSWORD = 'LoadTestPassword123'

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function userCount(): number {
  const value = Number.parseInt(process.env.LOAD_TEST_USER_COUNT || String(DEFAULT_USER_COUNT), 10)
  if (!Number.isInteger(value) || value < 10 || value > 100) {
    throw new Error('LOAD_TEST_USER_COUNT must be an integer between 10 and 100')
  }
  return value
}

function assertDisposableDatabase(databaseUrl: string): void {
  const parsed = new URL(databaseUrl)
  if (parsed.pathname !== `/${LOAD_DATABASE_NAME}` || process.env.LOAD_TEST_CONFIRM !== 'seed') {
    throw new Error(`Load fixtures only run against ${LOAD_DATABASE_NAME} with LOAD_TEST_CONFIRM=seed`)
  }
}

async function seed(): Promise<void> {
  const databaseUrl = required('DATABASE_URL')
  assertDisposableDatabase(databaseUrl)
  const count = userCount()
  const passwordHash = await bcrypt.hash(LOAD_PASSWORD, 10)
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('TRUNCATE auth_refresh_tokens, password_reset_tokens, work_logs, user_work_schedule_versions, users CASCADE')
    for (let index = 1; index <= count; index++) {
      const id = randomUUID()
      const email = `load-user-${String(index).padStart(3, '0')}@load.invalid`
      await client.query(
        `INSERT INTO users (
          id,name,email,password_hash,role,manager_id,created_by_id,work_start_date,
          daily_workload_minutes,standard_entry_time,standard_exit_time,
          lunch_enabled,lunch_duration_minutes,work_days,created_at,updated_at
        ) VALUES ($1,$2,$3,$4,'USER',NULL,NULL,'2026-01-01',480,'08:00','17:00',false,0,$5,NOW(),NOW())`,
        [id, `Load User ${index}`, email, passwordHash, 'MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY'],
      )
      await client.query(
        `INSERT INTO user_work_schedule_versions(user_id,effective_from,work_days)
         VALUES ($1,DATE '0001-01-01',$2)`,
        [id, 'MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY'],
      )
      await client.query(
        `INSERT INTO work_logs(id,user_id,entry_at,exit_at,close_reason,created_at,updated_at)
         VALUES ($1,$2,'2026-08-05T11:00:00.000Z','2026-08-05T20:00:00.000Z','EXIT',NOW(),NOW())`,
        [randomUUID(), id],
      )
    }
    await client.query('COMMIT')
    process.stdout.write(`Seeded ${count} disposable load-test users.\n`)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

seed().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
