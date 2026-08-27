import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import pg from 'pg'
import { buildApp } from '../src/app.js'
import { runMigrations } from '../src/database/migrate.js'
import type { AppConfig } from '../src/config.js'

const databaseUrl = process.env.TEST_DATABASE_URL
const integration = describe.skipIf(!databaseUrl)
let app: FastifyInstance
let pool: pg.Pool

const config: AppConfig = {
  databaseUrl: databaseUrl || '', databasePoolMax: 5,
  jwtAccessSecret: 'integration-access-secret-that-is-long-enough',
  jwtRefreshSecret: 'integration-refresh-secret-that-is-long-enough',
  jwtAccessTtlSeconds: 900, jwtRefreshTtlSeconds: 2_592_000, bcryptRounds: 10,
  cookieSecure: false, corsAllowedOrigins: [], timeZone: 'America/Sao_Paulo', port: 8080,
  nodeEnv: 'test', openApiEnabled: true, logLevel: 'silent',
  smtpUrl: null, smtpFrom: null, publicAppUrl: null,
}

function auth(token: string) { return { authorization: `Bearer ${token}` } }
async function mobileRegister(email: string) {
  const response = await app.inject({
    method: 'POST', url: '/api/auth/mobile/register',
    payload: { name: email.split('@')[0], email, password: 'Password123' },
  })
  expect(response.statusCode).toBe(201)
  return response.json().data as { token: string; refreshToken: string; userId: string }
}

integration('Fastify with PostgreSQL', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.JWT_ACCESS_SECRET = config.jwtAccessSecret
    process.env.JWT_REFRESH_SECRET = config.jwtRefreshSecret
    process.env.NODE_ENV = 'test'
    await runMigrations()
    pool = new pg.Pool({ connectionString: databaseUrl, max: 5 })
    app = await buildApp({ config, pool, logger: false })
  })

  beforeEach(async () => {
    await pool.query('TRUNCATE auth_refresh_tokens, work_logs, users CASCADE')
  })

  afterAll(async () => {
    if (app) await app.close()
    if (pool) await pool.end()
  })

  it('runs a new database and safely adopts successful Flyway V1-V11 through the latest migration', async () => {
    const versions = await pool.query<{ version: number }>('SELECT version FROM app_schema_migrations ORDER BY version')
    expect(versions.rows.map((row) => row.version)).toEqual([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16])
    expect((await app.inject({ method: 'GET', url: '/ready' })).statusCode).toBe(200)

    const adoptedDatabase = 'controle_horas_adopt_test'
    const adoptedUrl = new URL(databaseUrl!); adoptedUrl.pathname = `/${adoptedDatabase}`
    await pool.query(`DROP DATABASE IF EXISTS ${adoptedDatabase} WITH (FORCE)`)
    await pool.query(`CREATE DATABASE ${adoptedDatabase}`)
    let adoptedPool: pg.Pool | undefined
    try {
      process.env.DATABASE_URL = adoptedUrl.toString()
      await runMigrations()
      adoptedPool = new pg.Pool({ connectionString: adoptedUrl.toString() })
      await adoptedPool.query('DROP TABLE mobile_biometric_credentials')
      await adoptedPool.query('DROP TABLE auth_refresh_tokens')
      await adoptedPool.query('DROP TABLE password_reset_tokens')
      await adoptedPool.query('ALTER TABLE users DROP COLUMN hour_bank_minutes')
      await adoptedPool.query('DROP TABLE user_work_schedule_versions')
      await adoptedPool.query('ALTER TABLE users DROP CONSTRAINT chk_users_worked_day_totals')
      await adoptedPool.query('ALTER TABLE users DROP COLUMN total_worked_days, DROP COLUMN scheduled_worked_days, DROP COLUMN outside_schedule_worked_days')
      await adoptedPool.query('DROP TABLE app_schema_migrations')
      await adoptedPool.query(`
        CREATE TABLE flyway_schema_history (
          installed_rank INTEGER PRIMARY KEY, version VARCHAR(50), description VARCHAR(200), type VARCHAR(20),
          script VARCHAR(1000), checksum INTEGER, installed_by VARCHAR(100), installed_on TIMESTAMP DEFAULT NOW(),
          execution_time INTEGER, success BOOLEAN
        )
      `)
      await adoptedPool.query(`
        INSERT INTO flyway_schema_history(installed_rank,version,description,type,script,success)
        SELECT value,value::text,'migration','SQL','V'||value,true FROM generate_series(1,11) value
      `)
      await runMigrations()
      const adopted = await adoptedPool.query<{ version: number; source: string }>(
        'SELECT version,source FROM app_schema_migrations ORDER BY version',
      )
      expect(adopted.rows.filter((row) => row.version <= 11).every((row) => row.source === 'flyway')).toBe(true)
      expect(adopted.rows.at(-1)).toEqual({ version: 16, source: 'typescript' })
    } finally {
      process.env.DATABASE_URL = databaseUrl
      if (adoptedPool) await adoptedPool.end()
      await pool.query(`DROP DATABASE IF EXISTS ${adoptedDatabase} WITH (FORCE)`)
    }
  }, 30_000)

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const first = await mobileRegister('rotation@example.com')
    const rotated = await app.inject({ method: 'POST', url: '/api/auth/mobile/refresh', payload: { refreshToken: first.refreshToken } })
    expect(rotated.statusCode).toBe(200)
    const secondToken = rotated.json().data.refreshToken as string
    const reuse = await app.inject({ method: 'POST', url: '/api/auth/mobile/refresh', payload: { refreshToken: first.refreshToken } })
    expect(reuse.statusCode).toBe(401)
    const revokedFamily = await app.inject({ method: 'POST', url: '/api/auth/mobile/refresh', payload: { refreshToken: secondToken } })
    expect(revokedFamily.statusCode).toBe(401)
  })

  it('uses a hashed device credential for biometric login without coupling it to refresh rotation', async () => {
    const passwordSession = await mobileRegister('biometric@example.com')
    const created = await app.inject({
      method: 'POST', url: '/api/auth/mobile/biometric-credentials', headers: auth(passwordSession.token),
    })
    expect(created.statusCode).toBe(200)
    const credential = created.json().data as { credentialId: string; credentialSecret: string; email: string }
    const secondCredential = (await app.inject({
      method: 'POST', url: '/api/auth/mobile/biometric-credentials', headers: auth(passwordSession.token),
    })).json().data as { credentialId: string; credentialSecret: string; email: string }
    const stored = await pool.query<{ secret_hash: string; last_used_at: Date | null }>(
      'SELECT secret_hash,last_used_at FROM mobile_biometric_credentials WHERE id=$1', [credential.credentialId],
    )
    expect(stored.rows[0]?.secret_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(stored.rows[0]?.secret_hash).not.toBe(credential.credentialSecret)
    expect(stored.rows[0]?.last_used_at).toBeNull()

    const login = await app.inject({
      method: 'POST', url: '/api/auth/mobile/biometric-login',
      payload: credential,
    })
    expect(login.statusCode).toBe(200)
    const biometricSession = login.json().data as { token: string; refreshToken: string }
    expect((await pool.query('SELECT last_used_at FROM mobile_biometric_credentials WHERE id=$1', [credential.credentialId])).rows[0]?.last_used_at).toBeTruthy()

    const rotated = await app.inject({
      method: 'POST', url: '/api/auth/mobile/refresh', payload: { refreshToken: biometricSession.refreshToken },
    })
    expect(rotated.statusCode).toBe(200)
    expect((await app.inject({
      method: 'POST', url: '/api/auth/mobile/biometric-login', payload: credential,
    })).statusCode).toBe(200)

    expect((await app.inject({
      method: 'POST', url: '/api/auth/mobile/biometric-login',
      payload: { ...credential, email: 'wrong@example.com' },
    })).statusCode).toBe(401)
    expect((await app.inject({
      method: 'POST', url: '/api/auth/mobile/biometric-login',
      payload: { ...credential, credentialSecret: 'x'.repeat(43) },
    })).statusCode).toBe(401)

    const revoked = await app.inject({
      method: 'DELETE', url: `/api/auth/mobile/biometric-credentials/${credential.credentialId}`,
      headers: auth(biometricSession.token),
    })
    expect(revoked.statusCode).toBe(200)
    expect((await app.inject({
      method: 'POST', url: '/api/auth/mobile/biometric-login', payload: credential,
    })).statusCode).toBe(401)
    expect((await app.inject({
      method: 'POST', url: '/api/auth/mobile/biometric-login', payload: secondCredential,
    })).statusCode).toBe(200)
  })

  it('revokes every biometric credential during password reset', async () => {
    const session = await mobileRegister('biometric-reset@example.com')
    const credential = (await app.inject({
      method: 'POST', url: '/api/auth/mobile/biometric-credentials', headers: auth(session.token),
    })).json().data as { credentialId: string; credentialSecret: string; email: string }
    const resetToken = 'r'.repeat(43)
    await pool.query(
      `INSERT INTO password_reset_tokens(id,user_id,token_hash,expires_at)
       VALUES ($1,$2,$3,NOW() + INTERVAL '30 minutes')`,
      [randomUUID(), session.userId, createHash('sha256').update(resetToken).digest('hex')],
    )

    const reset = await app.inject({
      method: 'POST', url: '/api/auth/password-reset/confirm',
      payload: { token: resetToken, newPassword: 'NewPassword123' },
    })
    expect(reset.statusCode).toBe(200)
    expect((await app.inject({
      method: 'POST', url: '/api/auth/mobile/biometric-login', payload: credential,
    })).statusCode).toBe(401)
  })

  it('isolates independent organization trees', async () => {
    const first = await mobileRegister('root-a@example.com')
    const second = await mobileRegister('root-b@example.com')
    const list = await app.inject({ method: 'GET', url: '/api/users', headers: auth(first.token) })
    expect(list.statusCode).toBe(200)
    expect(list.json().data.map((user: { id: string }) => user.id)).not.toContain(second.userId)
    const forbidden = await app.inject({ method: 'GET', url: `/api/users/${second.userId}/dashboard`, headers: auth(first.token) })
    expect(forbidden.statusCode).toBe(403)
  })

  it('runs the complete point, history, export, import and user-management smoke flow', async () => {
    const session = await mobileRegister('concurrent@example.com')
    await app.inject({
      method: 'PUT', url: '/api/users/me/daily-workload', headers: auth(session.token),
      payload: {
        standardEntryTime: '08:00', standardExitTime: '17:00', lunchEnabled: true,
        lunchDurationMinutes: 60, workDays: ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY'],
      },
    })
    const responses = await Promise.all([
      app.inject({ method: 'POST', url: '/api/work-logs/entry', headers: auth(session.token) }),
      app.inject({ method: 'POST', url: '/api/work-logs/entry', headers: auth(session.token) }),
    ])
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409])

    for (const action of ['pause', 'resume', 'lunch', 'resume', 'exit']) {
      const response = await app.inject({ method: 'POST', url: `/api/work-logs/${action}`, headers: auth(session.token) })
      expect(response.statusCode).toBe(200)
    }
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())
    const history = await app.inject({
      method: 'GET', url: `/api/history?startDate=${date}&endDate=${date}`, headers: auth(session.token),
    })
    expect(history.statusCode).toBe(200); expect(history.json().data.days).toHaveLength(1)
    for (const format of ['xlsx', 'pdf']) {
      const exported = await app.inject({
        method: 'GET', url: `/api/history/export.${format}?startDate=${date}&endDate=${date}`, headers: auth(session.token),
      })
      expect(exported.statusCode).toBe(200); expect(exported.rawPayload.byteLength).toBeGreaterThan(100)
    }

    const childEmail = 'smoke-child@example.com'
    const created = await app.inject({
      method: 'POST', url: '/api/users', headers: auth(session.token),
      payload: { name: 'Smoke Child', email: childEmail, password: 'Password123', role: 'USER' },
    })
    expect(created.statusCode).toBe(201)
    const boundary = '----controle-horas-smoke-boundary'
    const csv = `email,date,entry_at,exit_at,close_reason\n`
      + `${childEmail},05/01/2026,08:00,17:00,EXIT\n`
      + `${childEmail},05/01/2026,08:00,17:00,EXIT\n`
    const multipart = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="smoke.csv"\r\n`
      + `Content-Type: text/csv\r\n\r\n${csv}\r\n--${boundary}--\r\n`,
    )
    const imported = await app.inject({
      method: 'POST', url: '/api/migrations/import', headers: {
        ...auth(session.token), 'content-type': `multipart/form-data; boundary=${boundary}`,
      }, payload: multipart,
    })
    expect(imported.statusCode).toBe(200)
    expect(imported.json().data).toMatchObject({ importedCount: 1, errorCount: 1 })
  })

  it('allows an administrator to create and edit a forgotten work log, while enforcing its boundaries', async () => {
    const admin = await mobileRegister('adjustments-admin@example.com')
    const child = await app.inject({
      method: 'POST', url: '/api/users', headers: auth(admin.token),
      payload: { name: 'Adjustment Employee', email: 'adjustments-employee@example.com', password: 'Password123', role: 'USER' },
    })
    expect(child.statusCode).toBe(201)
    const childId = child.json().data.id as string
    const create = await app.inject({
      method: 'POST', url: `/api/users/${childId}/work-logs`, headers: auth(admin.token),
      payload: { entryAt: '2026-07-13T11:00:00.000Z', exitAt: '2026-07-13T20:00:00.000Z' },
    })
    expect(create.statusCode).toBe(200)
    expect(create.json().data).toMatchObject({ closeReason: 'EXIT', entryAt: '2026-07-13T11:00:00.000Z' })
    const workLogId = create.json().data.id as string

    const overlap = await app.inject({
      method: 'POST', url: `/api/users/${childId}/work-logs`, headers: auth(admin.token),
      payload: { entryAt: '2026-07-13T19:00:00.000Z', exitAt: '2026-07-13T21:00:00.000Z' },
    })
    expect(overlap.statusCode).toBe(409)
    const update = await app.inject({
      method: 'PUT', url: `/api/users/${childId}/work-logs/${workLogId}`, headers: auth(admin.token),
      payload: { entryAt: '2026-07-13T10:30:00.000Z', exitAt: '2026-07-13T19:30:00.000Z' },
    })
    expect(update.statusCode).toBe(200)
    expect(update.json().data).toMatchObject({ entryAt: '2026-07-13T10:30:00.000Z', exitAt: '2026-07-13T19:30:00.000Z' })

    const historyBeforeDelete = await app.inject({
      method: 'GET', url: `/api/users/${childId}/history?startDate=2026-07-13&endDate=2026-07-13`, headers: auth(admin.token),
    })
    expect(historyBeforeDelete.statusCode).toBe(200)
    expect(historyBeforeDelete.json().data.hourBankMinutes).toBe(540)

    const recalculated = await app.inject({
      method: 'POST', url: `/api/users/${childId}/hour-bank/recalculate`, headers: auth(admin.token),
    })
    expect(recalculated.statusCode).toBe(200)
    expect(recalculated.json().data).toMatchObject({ previousHourBankMinutes: 0, hourBankMinutes: 540 })
    expect((await pool.query<{ hour_bank_minutes: number }>('SELECT hour_bank_minutes FROM users WHERE id=$1', [childId])).rows[0])
      .toEqual({ hour_bank_minutes: 540 })

    const deleted = await app.inject({
      method: 'DELETE', url: `/api/users/${childId}/work-logs/${workLogId}`, headers: auth(admin.token),
    })
    expect(deleted.statusCode).toBe(200)
    expect(deleted.json()).toMatchObject({ success: true, data: null })
    const missing = await app.inject({
      method: 'DELETE', url: `/api/users/${childId}/work-logs/${workLogId}`, headers: auth(admin.token),
    })
    expect(missing.statusCode).toBe(404)

    const historyAfterDelete = await app.inject({
      method: 'GET', url: `/api/users/${childId}/history?startDate=2026-07-13&endDate=2026-07-13`, headers: auth(admin.token),
    })
    expect(historyAfterDelete.statusCode).toBe(200)
    expect(historyAfterDelete.json().data.hourBankMinutes).toBe(0)

    const recreated = await app.inject({
      method: 'POST', url: `/api/users/${childId}/work-logs`, headers: auth(admin.token),
      payload: { entryAt: '2026-07-13T10:30:00.000Z', exitAt: '2026-07-13T19:30:00.000Z' },
    })
    expect(recreated.statusCode).toBe(200)
    const recreatedId = recreated.json().data.id as string
    expect((await app.inject({
      method: 'DELETE', url: `/api/users/${childId}/work-logs/${recreatedId}`, headers: auth(admin.token),
    })).statusCode).toBe(200)

    const boundary = '----controle-horas-reimport-boundary'
    const csv = 'email,date,entry_at,exit_at,close_reason\n'
      + 'adjustments-employee@example.com,13/07/2026,07:30,16:30,EXIT\n'
    const multipart = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="reimport.csv"\r\n`
      + `Content-Type: text/csv\r\n\r\n${csv}\r\n--${boundary}--\r\n`,
    )
    const reimported = await app.inject({
      method: 'POST', url: '/api/migrations/import', headers: {
        ...auth(admin.token), 'content-type': `multipart/form-data; boundary=${boundary}`,
      }, payload: multipart,
    })
    expect(reimported.statusCode).toBe(200)
    expect(reimported.json().data).toMatchObject({ importedCount: 1, errorCount: 0 })

    const employee = await app.inject({
      method: 'POST', url: '/api/auth/mobile/login', payload: { email: 'adjustments-employee@example.com', password: 'Password123' },
    })
    const forbidden = await app.inject({
      method: 'POST', url: `/api/users/${childId}/work-logs`, headers: auth(employee.json().data.token as string),
      payload: { entryAt: '2026-07-14T11:00:00.000Z', exitAt: '2026-07-14T20:00:00.000Z' },
    })
    expect(forbidden.statusCode).toBe(403)
  })

  it('persists absolute worked day totals across records inside and outside the historical work calendar', async () => {
    const admin = await mobileRegister('worked-days-admin@example.com')
    const child = await app.inject({
      method: 'POST', url: '/api/users', headers: auth(admin.token),
      payload: {
        name: 'Worked Days Employee', email: 'worked-days-employee@example.com', password: 'Password123', role: 'USER',
        standardEntryTime: '08:00', standardExitTime: '17:50', lunchEnabled: true, lunchDurationMinutes: 60,
        workDays: ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY'], workStartDate: '2026-08-18',
      },
    })
    expect(child.statusCode).toBe(201)
    const childId = child.json().data.id as string
    const records = [
      ['2026-08-18T11:21:00.000Z', '2026-08-18T20:20:00.000Z'],
      ['2026-08-19T11:23:00.000Z', '2026-08-19T20:19:00.000Z'],
      ['2026-08-20T11:22:00.000Z', '2026-08-20T20:19:00.000Z'],
      ['2026-08-21T11:06:00.000Z', '2026-08-21T20:10:00.000Z'],
      ['2026-08-24T11:13:00.000Z', '2026-08-24T20:09:00.000Z'],
      ['2026-08-25T11:19:00.000Z', '2026-08-25T20:19:00.000Z'],
      ['2026-08-26T11:23:00.000Z', '2026-08-26T20:19:00.000Z'],
    ]
    for (const [entryAt, exitAt] of records) {
      expect((await app.inject({
        method: 'POST', url: `/api/users/${childId}/work-logs`, headers: auth(admin.token), payload: { entryAt, exitAt },
      })).statusCode).toBe(200)
    }
    const initialHistory = await app.inject({
      method: 'GET', url: `/api/users/${childId}/history?startDate=2026-08-01&endDate=2026-08-31`, headers: auth(admin.token),
    })
    expect(initialHistory.json().data).toMatchObject({
      totalBalanceMinutes: 58, workedDayTotals: { total: 7, inSchedule: 7, outsideSchedule: 0 },
    })

    expect((await app.inject({
      method: 'POST', url: `/api/users/${childId}/work-logs`, headers: auth(admin.token),
      payload: { entryAt: '2026-08-15T11:00:00.000Z', exitAt: '2026-08-15T20:00:00.000Z' },
    })).statusCode).toBe(200)
    const recalculated = await app.inject({
      method: 'POST', url: `/api/users/${childId}/worked-days/recalculate`, headers: auth(admin.token),
    })
    expect(recalculated.statusCode).toBe(200)
    expect(recalculated.json().data).toEqual({ total: 8, inSchedule: 7, outsideSchedule: 1 })
    expect((await pool.query(
      'SELECT total_worked_days,scheduled_worked_days,outside_schedule_worked_days FROM users WHERE id=$1', [childId],
    )).rows[0]).toEqual({ total_worked_days: 8, scheduled_worked_days: 7, outside_schedule_worked_days: 1 })

    expect((await app.inject({
      method: 'POST', url: `/api/users/${childId}/work-logs`, headers: auth(admin.token),
      payload: { entryAt: '2026-08-22T02:30:00.000Z', exitAt: '2026-08-22T04:30:00.000Z' },
    })).statusCode).toBe(200)
    expect((await pool.query(
      'SELECT total_worked_days,scheduled_worked_days,outside_schedule_worked_days FROM users WHERE id=$1', [childId],
    )).rows[0]).toEqual({ total_worked_days: 9, scheduled_worked_days: 7, outside_schedule_worked_days: 2 })

    expect((await app.inject({
      method: 'PUT', url: `/api/users/${childId}`, headers: auth(admin.token),
      payload: { name: 'Worked Days Employee', workDays: ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'] },
    })).statusCode).toBe(200)
    expect((await pool.query(
      `SELECT work_days FROM user_work_schedule_versions
       WHERE user_id=$1 AND effective_from=(NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE + 1`, [childId],
    )).rows[0]).toEqual({ work_days: 'MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY,SATURDAY' })
  })

  it('allows a manager to recalculate only an employee in their team', async () => {
    const admin = await mobileRegister('hour-bank-admin@example.com')
    const manager = await app.inject({
      method: 'POST', url: '/api/users', headers: auth(admin.token),
      payload: { name: 'Hour Bank Manager', email: 'hour-bank-manager@example.com', password: 'Password123', role: 'MANAGER' },
    })
    expect(manager.statusCode).toBe(201)
    const managerSession = await app.inject({
      method: 'POST', url: '/api/auth/mobile/login', payload: { email: 'hour-bank-manager@example.com', password: 'Password123' },
    })
    const managerToken = managerSession.json().data.token as string
    const employee = await app.inject({
      method: 'POST', url: '/api/users', headers: auth(managerToken),
      payload: { name: 'Hour Bank Employee', email: 'hour-bank-employee@example.com', password: 'Password123', role: 'USER' },
    })
    expect(employee.statusCode).toBe(201)
    const employeeId = employee.json().data.id as string

    const recalculated = await app.inject({
      method: 'POST', url: `/api/users/${employeeId}/hour-bank/recalculate`, headers: auth(managerToken),
    })
    expect(recalculated.statusCode).toBe(200)

    const recalculatedWorkedDays = await app.inject({
      method: 'POST', url: `/api/users/${employeeId}/worked-days/recalculate`, headers: auth(managerToken),
    })
    expect(recalculatedWorkedDays.statusCode).toBe(200)

    const employeeSession = await app.inject({
      method: 'POST', url: '/api/auth/mobile/login', payload: { email: 'hour-bank-employee@example.com', password: 'Password123' },
    })
    const forbidden = await app.inject({
      method: 'POST', url: `/api/users/${employeeId}/hour-bank/recalculate`, headers: auth(employeeSession.json().data.token as string),
    })
    expect(forbidden.statusCode).toBe(403)
    const workedDaysForbidden = await app.inject({
      method: 'POST', url: `/api/users/${employeeId}/worked-days/recalculate`, headers: auth(employeeSession.json().data.token as string),
    })
    expect(workedDaysForbidden.statusCode).toBe(403)
  })

  it('keeps web refresh tokens out of the JSON response', async () => {
    const response = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { name: 'Web User', email: 'web@example.com', password: 'Password123' },
    })
    expect(response.statusCode).toBe(201)
    expect(response.json().data.refreshToken).toBeUndefined()
    expect(response.headers['set-cookie']).toContain('HttpOnly')
    expect(response.headers['set-cookie']).toContain('SameSite=Strict')

    let limited
    for (let attempt = 0; attempt < 11; attempt += 1) {
      limited = await app.inject({
        method: 'POST', url: '/api/auth/login',
        payload: { email: 'rate-limit@example.com', password: 'wrong' },
      })
    }
    expect(limited?.statusCode).toBe(429)
    expect(limited?.json()).toMatchObject({ success: false, data: null })
  })

  it('rejects malformed public inputs and keeps SQL-looking names as literal data', async () => {
    const admin = await mobileRegister('validation-admin@example.com')
    const weakPassword = await app.inject({
      method: 'POST', url: '/api/auth/mobile/register',
      payload: { name: 'Weak password', email: 'weak@example.com', password: 'password' },
    })
    expect(weakPassword.statusCode).toBe(400)
    expect(weakPassword.json()).toMatchObject({ success: false, data: null })
    expect(weakPassword.json().message).toContain('pattern')

    const invalidDate = await app.inject({
      method: 'GET', url: '/api/history?startDate=nome&endDate=2026-08-27', headers: auth(admin.token),
    })
    expect(invalidDate.statusCode).toBe(400)
    expect(invalidDate.json()).toMatchObject({ success: false, data: null })

    const invalidPagination = await app.inject({
      method: 'GET', url: '/api/history?startDate=2026-08-01&endDate=2026-08-27&limit=1;SELECT', headers: auth(admin.token),
    })
    expect(invalidPagination.statusCode).toBe(400)
    expect(invalidPagination.json().message).toContain('Pagination values must be integers')

    const invalidId = await app.inject({
      method: 'GET', url: "/api/users/'%20OR%201=1--/dashboard", headers: auth(admin.token),
    })
    expect(invalidId.statusCode).toBe(400)
    expect(invalidId.json()).toMatchObject({ success: false, data: null })

    const sqlLookingName = "Ana'); DROP TABLE users; --"
    const created = await app.inject({
      method: 'POST', url: '/api/users', headers: auth(admin.token),
      payload: { name: sqlLookingName, email: 'literal-name@example.com', password: 'Password123', role: 'USER' },
    })
    expect(created.statusCode).toBe(201)
    const userId = created.json().data.id as string
    expect((await pool.query<{ name: string }>('SELECT name FROM users WHERE id=$1', [userId])).rows[0])
      .toEqual({ name: sqlLookingName })
    expect((await pool.query('SELECT count(*) FROM users')).rows[0]?.count).toBe('2')
  })
})
