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
  nagerBaseUrl: 'https://holidays.invalid', nagerTimeoutMs: 1_000, holidaySyncRateLimitPerMinute: 1_000,
}

const providedHolidays = [
  { date: '2026-09-07', name: 'Independência do Brasil', externalKey: 'Independence Day', subdivisionCode: null, scope: 'NATIONAL' as const },
  { date: '2026-07-09', name: 'Revolução Constitucionalista', externalKey: 'Constitutionalist Revolution', subdivisionCode: 'BR-SP', scope: 'SUBDIVISION' as const },
]
// Never let the integration suite depend on the public holiday API.
const holidayProvider = { fetchYear: async () => providedHolidays }

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
    app = await buildApp({ config, pool, logger: false, holidayProvider })
  })

  beforeEach(async () => {
    await pool.query('TRUNCATE auth_refresh_tokens, work_logs, holiday_rules, holiday_year_syncs, holidays, users CASCADE')
  })

  afterAll(async () => {
    if (app) await app.close()
    if (pool) await pool.end()
  })

  it('runs a new database and safely adopts successful Flyway V1-V11 through the latest migration', async () => {
    const versions = await pool.query<{ version: number }>('SELECT version FROM app_schema_migrations ORDER BY version')
    expect(versions.rows.map((row) => row.version)).toEqual([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18])
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
      await adoptedPool.query('DROP TABLE holiday_rules')
      await adoptedPool.query('DROP TABLE holiday_year_syncs')
      await adoptedPool.query('DROP TABLE holidays')
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
      expect(adopted.rows.at(-1)).toEqual({ version: 18, source: 'typescript' })
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
  it('synchronizes a holiday year once and serves it from the local catalogue', async () => {
    const admin = await mobileRegister('holiday-admin@example.com')

    const first = await app.inject({
      method: 'GET', url: '/api/holidays?startDate=2026-07-01&endDate=2026-09-30', headers: auth(admin.token),
    })
    expect(first.statusCode).toBe(200)
    expect(first.json().data.days).toEqual([
      {
        holidayId: expect.any(String), date: '2026-07-09', holidayDate: '2026-07-09',
        name: 'Revolução Constitucionalista', kind: 'HOLIDAY',
        scope: 'SUBDIVISION', source: 'NAGER', subdivisionCode: 'BR-SP', dayOff: false, ruleId: null,
        ruleObservedDate: null, ruleBridgeDate: null,
      },
      {
        holidayId: expect.any(String), date: '2026-09-07', holidayDate: '2026-09-07',
        name: 'Independência do Brasil', kind: 'HOLIDAY',
        scope: 'NATIONAL', source: 'NAGER', subdivisionCode: null, dayOff: true, ruleId: null,
        ruleObservedDate: null, ruleBridgeDate: null,
      },
    ])

    const sync = await pool.query<{ year: number; status: string; holiday_count: number }>(
      'SELECT year,status,holiday_count FROM holiday_year_syncs WHERE country_code=$1', ['BR'],
    )
    expect(sync.rows).toEqual([{ year: 2026, status: 'SUCCESS', holiday_count: 2 }])

    // A second read must be served from the catalogue: no duplicated rows, no second provider call.
    expect((await app.inject({
      method: 'GET', url: '/api/holidays?startDate=2026-07-01&endDate=2026-09-30', headers: auth(admin.token),
    })).json().data.days).toHaveLength(2)
    expect((await pool.query('SELECT count(*) FROM holidays')).rows[0]?.count).toBe('2')
  })

  it('restricts the holiday resync to administrators and keeps the upsert idempotent', async () => {
    const admin = await mobileRegister('holiday-sync-admin@example.com')
    const employee = await app.inject({
      method: 'POST', url: '/api/users', headers: auth(admin.token),
      payload: { name: 'Holiday Employee', email: 'holiday-employee@example.com', password: 'Password123', role: 'USER' },
    })
    expect(employee.statusCode).toBe(201)
    const employeeSession = await app.inject({
      method: 'POST', url: '/api/auth/mobile/login',
      payload: { email: 'holiday-employee@example.com', password: 'Password123' },
    })
    const employeeToken = employeeSession.json().data.token as string

    expect((await app.inject({
      method: 'POST', url: '/api/holidays/sync', headers: auth(employeeToken), payload: { year: 2026 },
    })).statusCode).toBe(403)

    const first = await app.inject({
      method: 'POST', url: '/api/holidays/sync', headers: auth(admin.token), payload: { year: 2026 },
    })
    expect(first.statusCode).toBe(200)
    expect(first.json().data).toMatchObject({ year: 2026, countryCode: 'BR', holidayCount: 2 })

    expect((await app.inject({
      method: 'POST', url: '/api/holidays/sync', headers: auth(admin.token), payload: { year: 2026 },
    })).statusCode).toBe(200)
    expect((await pool.query('SELECT count(*) FROM holidays')).rows[0]?.count).toBe('2')
    expect((await pool.query<{ attempts: number }>('SELECT attempts FROM holiday_year_syncs')).rows[0]?.attempts).toBe(2)

    expect((await app.inject({
      method: 'POST', url: '/api/holidays/sync', headers: auth(admin.token), payload: { year: 1500 },
    })).statusCode).toBe(400)
  })

  it('rejects a holiday period that would fan out into many provider requests', async () => {
    const admin = await mobileRegister('holiday-period@example.com')
    const response = await app.inject({
      method: 'GET', url: '/api/holidays?startDate=2020-01-01&endDate=2026-12-31', headers: auth(admin.token),
    })
    expect(response.statusCode).toBe(400)
    expect(response.json().message).toContain('366 days')
  })
  it('removes the absence of a holiday from the hour bank once the year is synchronized', async () => {
    const admin = await mobileRegister('holiday-balance-admin@example.com')
    // 2026-09-07 is a Monday and is in the past, so without a holiday it is charged as an absence.
    const employee = await app.inject({
      method: 'POST', url: '/api/users', headers: auth(admin.token),
      payload: {
        name: 'Holiday Balance', email: 'holiday-balance@example.com', password: 'Password123', role: 'USER',
        standardEntryTime: '08:00', standardExitTime: '17:00', lunchEnabled: true, lunchDurationMinutes: 60,
        workDays: ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY'], workStartDate: '2026-09-01',
      },
    })
    expect(employee.statusCode).toBe(201)
    const employeeId = employee.json().data.id as string
    const period = 'startDate=2026-09-01&endDate=2026-09-09'
    const historyOf = async () => (await app.inject({
      method: 'GET', url: `/api/users/${employeeId}/history?${period}`, headers: auth(admin.token),
    })).json().data

    // Empty catalogue: the holiday is just another absent work day.
    const before = await historyOf()
    expect(before.totalBalanceMinutes).toBe(-3360)
    expect(before.days.find((day: { date: string }) => day.date === '2026-09-07')).toMatchObject({
      balanceMinutes: -480, holiday: null, workedOnHoliday: false,
    })

    // Reading the calendar is what fills the catalogue: the lazy path the calculation relies on.
    expect((await app.inject({
      method: 'GET', url: `/api/holidays?${period}`, headers: auth(admin.token),
    })).statusCode).toBe(200)

    const after = await historyOf()
    expect(after.totalBalanceMinutes).toBe(-2880)
    expect(after.days.find((day: { date: string }) => day.date === '2026-09-07')).toMatchObject({
      balanceMinutes: 0, workedOnHoliday: false,
      holiday: { name: 'Independência do Brasil', scope: 'NATIONAL', dayOff: true },
    })
  })

  it('credits work done on a holiday and flags it', async () => {
    const admin = await mobileRegister('holiday-worked-admin@example.com')
    const employee = await app.inject({
      method: 'POST', url: '/api/users', headers: auth(admin.token),
      payload: {
        name: 'Holiday Worked', email: 'holiday-worked@example.com', password: 'Password123', role: 'USER',
        standardEntryTime: '08:00', standardExitTime: '17:00', lunchEnabled: true, lunchDurationMinutes: 60,
        workDays: ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY'], workStartDate: '2026-09-07',
      },
    })
    const employeeId = employee.json().data.id as string
    expect((await app.inject({
      method: 'GET', url: '/api/holidays?startDate=2026-09-01&endDate=2026-09-30', headers: auth(admin.token),
    })).statusCode).toBe(200)
    expect((await app.inject({
      method: 'POST', url: `/api/users/${employeeId}/work-logs`, headers: auth(admin.token),
      payload: { entryAt: '2026-09-07T12:00:00.000Z', exitAt: '2026-09-07T16:00:00.000Z' },
    })).statusCode).toBe(200)

    const history = (await app.inject({
      method: 'GET', url: `/api/users/${employeeId}/history?startDate=2026-09-07&endDate=2026-09-07`,
      headers: auth(admin.token),
    })).json().data
    // Every worked minute is a credit: the day carried no workload to offset it.
    expect(history.days[0]).toMatchObject({ workedMinutes: 240, balanceMinutes: 240, workedOnHoliday: true })
  })

  it('leaves a state holiday as an ordinary working day', async () => {
    const admin = await mobileRegister('holiday-state-admin@example.com')
    const employee = await app.inject({
      method: 'POST', url: '/api/users', headers: auth(admin.token),
      payload: {
        name: 'Holiday State', email: 'holiday-state@example.com', password: 'Password123', role: 'USER',
        standardEntryTime: '08:00', standardExitTime: '17:00', lunchEnabled: true, lunchDurationMinutes: 60,
        workDays: ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY'], workStartDate: '2026-07-09',
      },
    })
    const employeeId = employee.json().data.id as string
    expect((await app.inject({
      method: 'GET', url: '/api/holidays?startDate=2026-07-01&endDate=2026-07-31', headers: auth(admin.token),
    })).statusCode).toBe(200)

    // 2026-07-09 is a Thursday and only a state holiday, so the workload still applies.
    const history = (await app.inject({
      method: 'GET', url: `/api/users/${employeeId}/history?startDate=2026-07-09&endDate=2026-07-09`,
      headers: auth(admin.token),
    })).json().data
    expect(history.days[0]).toMatchObject({
      balanceMinutes: -480,
      holiday: { scope: 'SUBDIVISION', subdivisionCode: 'BR-SP', dayOff: false },
    })
  })
  it('lets a rule turn a holiday into a working day and back', async () => {
    const admin = await mobileRegister('rule-admin@example.com')
    const employee = await app.inject({
      method: 'POST', url: '/api/users', headers: auth(admin.token),
      payload: {
        name: 'Rule Employee', email: 'rule-employee@example.com', password: 'Password123', role: 'USER',
        standardEntryTime: '08:00', standardExitTime: '17:00', lunchEnabled: true, lunchDurationMinutes: 60,
        workDays: ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY'], workStartDate: '2026-09-01',
      },
    })
    const employeeId = employee.json().data.id as string
    const calendar = await app.inject({
      method: 'GET', url: '/api/holidays?startDate=2026-09-01&endDate=2026-09-30', headers: auth(admin.token),
    })
    const holidayId = calendar.json().data.days[0].holidayId as string
    const balanceOf = async () => (await app.inject({
      method: 'GET', url: `/api/users/${employeeId}/history?startDate=2026-09-07&endDate=2026-09-07`,
      headers: auth(admin.token),
    })).json().data.days[0].balanceMinutes

    expect(await balanceOf()).toBe(0)

    const saved = await app.inject({
      method: 'PUT', url: `/api/holidays/${holidayId}/rule`, headers: auth(admin.token),
      payload: { userIds: null, dayOff: false, notes: 'Expediente normal' },
    })
    expect(saved.statusCode).toBe(200)
    expect(saved.json().data[0]).toMatchObject({
      userId: null, dayOff: false, notes: 'Expediente normal', createdByName: 'rule-admin',
      holidayName: 'Independência do Brasil',
    })

    // The rule turned the holiday back into a full working day, so the absence returns.
    expect(await balanceOf()).toBe(-480)

    const ruleId = saved.json().data[0].id as string
    expect((await app.inject({
      method: 'DELETE', url: `/api/holidays/rules/${ruleId}`, headers: auth(admin.token),
    })).statusCode).toBe(200)
    expect(await balanceOf()).toBe(0)
  })

  it('resolves a user rule ahead of the organization rule', async () => {
    const admin = await mobileRegister('precedence-admin@example.com')
    const create = async (email: string) => (await app.inject({
      method: 'POST', url: '/api/users', headers: auth(admin.token),
      payload: {
        name: email.split('@')[0], email, password: 'Password123', role: 'USER',
        standardEntryTime: '08:00', standardExitTime: '17:00', lunchEnabled: true, lunchDurationMinutes: 60,
        workDays: ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY'], workStartDate: '2026-09-01',
      },
    })).json().data.id as string
    const first = await create('precedence-a@example.com')
    const second = await create('precedence-b@example.com')

    const calendar = await app.inject({
      method: 'GET', url: '/api/holidays?startDate=2026-09-01&endDate=2026-09-30', headers: auth(admin.token),
    })
    const holidayId = calendar.json().data.days[0].holidayId as string

    // Organization says it is a working day; the first user is excepted back into a day off.
    expect((await app.inject({
      method: 'PUT', url: `/api/holidays/${holidayId}/rule`, headers: auth(admin.token),
      payload: { userIds: null, dayOff: false },
    })).statusCode).toBe(200)
    expect((await app.inject({
      method: 'PUT', url: `/api/holidays/${holidayId}/rule`, headers: auth(admin.token),
      payload: { userIds: [first], dayOff: true },
    })).statusCode).toBe(200)

    const balanceOf = async (userId: string) => (await app.inject({
      method: 'GET', url: `/api/users/${userId}/history?startDate=2026-09-07&endDate=2026-09-07`,
      headers: auth(admin.token),
    })).json().data.days[0].balanceMinutes
    expect(await balanceOf(first)).toBe(0)
    expect(await balanceOf(second)).toBe(-480)

    const forFirst = await app.inject({
      method: 'GET', url: `/api/holidays?startDate=2026-09-01&endDate=2026-09-30&userId=${first}`,
      headers: auth(admin.token),
    })
    expect(forFirst.json().data.days[0]).toMatchObject({ dayOff: true, ruleId: expect.any(String) })
  })

  it('keeps a second organization rule for the same holiday from being created', async () => {
    const admin = await mobileRegister('rule-conflict-admin@example.com')
    const calendar = await app.inject({
      method: 'GET', url: '/api/holidays?startDate=2026-09-01&endDate=2026-09-30', headers: auth(admin.token),
    })
    const holidayId = calendar.json().data.days[0].holidayId as string
    const save = () => app.inject({
      method: 'PUT', url: `/api/holidays/${holidayId}/rule`, headers: auth(admin.token),
      payload: { userIds: null, dayOff: false },
    })
    expect((await save()).statusCode).toBe(200)
    // The unique index makes the second write an update, not a duplicate.
    expect((await save()).statusCode).toBe(200)
    expect((await pool.query('SELECT count(*) FROM holiday_rules')).rows[0]?.count).toBe('1')
  })

  it('stops a manager from creating an organization-wide holiday rule', async () => {
    const admin = await mobileRegister('rule-manager-admin@example.com')
    expect((await app.inject({
      method: 'POST', url: '/api/users', headers: auth(admin.token),
      payload: { name: 'Boss', email: 'rule-boss@example.com', password: 'Password123', role: 'MANAGER' },
    })).statusCode).toBe(201)
    const managerToken = (await app.inject({
      method: 'POST', url: '/api/auth/mobile/login',
      payload: { email: 'rule-boss@example.com', password: 'Password123' },
    })).json().data.token as string

    const calendar = await app.inject({
      method: 'GET', url: '/api/holidays?startDate=2026-09-01&endDate=2026-09-30', headers: auth(admin.token),
    })
    const holidayId = calendar.json().data.days[0].holidayId as string

    const refused = await app.inject({
      method: 'PUT', url: `/api/holidays/${holidayId}/rule`, headers: auth(managerToken),
      payload: { userIds: null, dayOff: false },
    })
    expect(refused.statusCode).toBe(403)
    expect(refused.json().message).toContain('root administrator')
    expect((await pool.query('SELECT count(*) FROM holiday_rules')).rows[0]?.count).toBe('0')
  })
  it('moves a day off to another date and hands the workload back to the holiday', async () => {
    const admin = await mobileRegister('bridge-admin@example.com')
    const employee = await app.inject({
      method: 'POST', url: '/api/users', headers: auth(admin.token),
      payload: {
        name: 'Bridge Employee', email: 'bridge-employee@example.com', password: 'Password123', role: 'USER',
        standardEntryTime: '08:00', standardExitTime: '17:00', lunchEnabled: true, lunchDurationMinutes: 60,
        workDays: ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY'], workStartDate: '2026-09-01',
      },
    })
    const employeeId = employee.json().data.id as string
    const calendar = await app.inject({
      method: 'GET', url: '/api/holidays?startDate=2026-09-01&endDate=2026-09-30', headers: auth(admin.token),
    })
    const holidayId = calendar.json().data.days[0].holidayId as string
    const daysOf = async () => (await app.inject({
      method: 'GET', url: `/api/users/${employeeId}/history?startDate=2026-09-07&endDate=2026-09-08`,
      headers: auth(admin.token),
    })).json().data.days as Array<{ date: string; balanceMinutes: number; holiday: { kind: string } | null }>

    // 2026-09-07 is the Monday holiday; move its day off to Tuesday the 8th.
    expect((await app.inject({
      method: 'PUT', url: `/api/holidays/${holidayId}/rule`, headers: auth(admin.token),
      payload: { userIds: null, dayOff: true, observedDate: '2026-09-08' },
    })).statusCode).toBe(200)

    const moved = await daysOf()
    expect(moved.find((day) => day.date === '2026-09-07')).toMatchObject({
      balanceMinutes: -480, holiday: { kind: 'HOLIDAY', dayOff: false },
    })
    expect(moved.find((day) => day.date === '2026-09-08')).toMatchObject({
      balanceMinutes: 0, holiday: { kind: 'OBSERVED', dayOff: true, holidayDate: '2026-09-07' },
    })

    // Switching to a bridge clears both days instead.
    expect((await app.inject({
      method: 'PUT', url: `/api/holidays/${holidayId}/rule`, headers: auth(admin.token),
      payload: { userIds: null, dayOff: true, observedDate: null, bridgeDate: '2026-09-08' },
    })).statusCode).toBe(200)
    const bridged = await daysOf()
    expect(bridged.find((day) => day.date === '2026-09-07')?.balanceMinutes).toBe(0)
    expect(bridged.find((day) => day.date === '2026-09-08')).toMatchObject({
      balanceMinutes: 0, holiday: { kind: 'BRIDGE' },
    })
  })

  it('finds a moved day off whose holiday falls outside the requested period', async () => {
    const admin = await mobileRegister('bridge-window-admin@example.com')
    const calendar = await app.inject({
      method: 'GET', url: '/api/holidays?startDate=2026-09-01&endDate=2026-09-30', headers: auth(admin.token),
    })
    const holidayId = calendar.json().data.days[0].holidayId as string
    expect((await app.inject({
      method: 'PUT', url: `/api/holidays/${holidayId}/rule`, headers: auth(admin.token),
      payload: { userIds: null, dayOff: true, bridgeDate: '2026-10-05' },
    })).statusCode).toBe(200)

    // October alone contains no holiday, only the bridged day off that September's holiday produced.
    const october = await app.inject({
      method: 'GET', url: '/api/holidays?startDate=2026-10-01&endDate=2026-10-31', headers: auth(admin.token),
    })
    expect(october.json().data.days).toEqual([expect.objectContaining({
      date: '2026-10-05', holidayDate: '2026-09-07', kind: 'BRIDGE', dayOff: true,
    })])
  })

  it('rejects rule dates that are malformed or far from the holiday', async () => {
    const admin = await mobileRegister('bridge-validation-admin@example.com')
    const calendar = await app.inject({
      method: 'GET', url: '/api/holidays?startDate=2026-09-01&endDate=2026-09-30', headers: auth(admin.token),
    })
    const holidayId = calendar.json().data.days[0].holidayId as string
    const save = (payload: object) => app.inject({
      method: 'PUT', url: `/api/holidays/${holidayId}/rule`, headers: auth(admin.token), payload,
    })

    expect((await save({ userIds: null, dayOff: true, bridgeDate: '07/09/2026' })).statusCode).toBe(400)
    expect((await save({ userIds: null, dayOff: true, bridgeDate: '2027-09-07' })).statusCode).toBe(400)
    expect((await save({ userIds: null, dayOff: false, observedDate: '2026-09-08' })).statusCode).toBe(400)
    expect((await pool.query('SELECT count(*) FROM holiday_rules')).rows[0]?.count).toBe('0')
  })
  it('registers a municipal holiday and lets it zero the workload of the day', async () => {
    const admin = await mobileRegister('municipal-admin@example.com')
    const employee = await app.inject({
      method: 'POST', url: '/api/users', headers: auth(admin.token),
      payload: {
        name: 'Municipal Employee', email: 'municipal-employee@example.com', password: 'Password123', role: 'USER',
        standardEntryTime: '08:00', standardExitTime: '17:00', lunchEnabled: true, lunchDurationMinutes: 60,
        workDays: ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY'], workStartDate: '2026-09-01',
      },
    })
    const employeeId = employee.json().data.id as string
    const balanceOf = async () => (await app.inject({
      method: 'GET', url: `/api/users/${employeeId}/history?startDate=2026-09-09&endDate=2026-09-09`,
      headers: auth(admin.token),
    })).json().data.days[0].balanceMinutes

    // 2026-09-09 is an ordinary Wednesday until the company says otherwise.
    expect(await balanceOf()).toBe(-480)

    const created = await app.inject({
      method: 'POST', url: '/api/holidays', headers: auth(admin.token),
      payload: { date: '2026-09-09', name: 'Aniversário da cidade', scope: 'MUNICIPAL', subdivisionCode: 'BR-SP' },
    })
    expect(created.statusCode).toBe(201)
    expect(created.json().data).toMatchObject({
      date: '2026-09-09', name: 'Aniversário da cidade', scope: 'MUNICIPAL', source: 'MANUAL', dayOff: true,
    })
    expect(await balanceOf()).toBe(0)

    const holidayId = created.json().data.holidayId as string
    expect((await app.inject({
      method: 'DELETE', url: `/api/holidays/${holidayId}`, headers: auth(admin.token),
    })).statusCode).toBe(200)
    expect(await balanceOf()).toBe(-480)
  })

  it('keeps a manual holiday inside the organization that created it', async () => {
    const first = await mobileRegister('tenant-one@example.com')
    const second = await mobileRegister('tenant-two@example.com')
    expect((await app.inject({
      method: 'POST', url: '/api/holidays', headers: auth(first.token),
      payload: { date: '2026-09-09', name: 'Festa da cidade', scope: 'MUNICIPAL' },
    })).statusCode).toBe(201)

    const period = 'startDate=2026-09-01&endDate=2026-09-30'
    const namesFor = async (token: string) => (await app.inject({
      method: 'GET', url: `/api/holidays?${period}`, headers: auth(token),
    })).json().data.days.map((day: { name: string }) => day.name)

    expect(await namesFor(first.token)).toContain('Festa da cidade')
    expect(await namesFor(second.token)).not.toContain('Festa da cidade')
  })

  it('rejects a duplicated manual holiday and refuses to delete a synced one', async () => {
    const admin = await mobileRegister('municipal-dup-admin@example.com')
    const create = () => app.inject({
      method: 'POST', url: '/api/holidays', headers: auth(admin.token),
      payload: { date: '2026-09-09', name: 'Aniversário da cidade', scope: 'MUNICIPAL' },
    })
    expect((await create()).statusCode).toBe(201)
    const duplicated = await create()
    expect(duplicated.statusCode).toBe(409)
    expect(duplicated.json().message).toContain('already exists')

    // The synced catalogue is shared, so it is not the company's to delete.
    const calendar = await app.inject({
      method: 'GET', url: '/api/holidays?startDate=2026-09-01&endDate=2026-09-30', headers: auth(admin.token),
    })
    const synced = calendar.json().data.days.find((day: { source: string }) => day.source === 'NAGER')
    expect((await app.inject({
      method: 'DELETE', url: `/api/holidays/${synced.holidayId}`, headers: auth(admin.token),
    })).statusCode).toBe(404)
  })

  it('takes the rules of a manual holiday with it when it is removed', async () => {
    const admin = await mobileRegister('municipal-cascade-admin@example.com')
    const created = await app.inject({
      method: 'POST', url: '/api/holidays', headers: auth(admin.token),
      payload: { date: '2026-09-09', name: 'Aniversário da cidade', scope: 'MUNICIPAL' },
    })
    const holidayId = created.json().data.holidayId as string
    expect((await app.inject({
      method: 'PUT', url: `/api/holidays/${holidayId}/rule`, headers: auth(admin.token),
      payload: { userIds: null, dayOff: false },
    })).statusCode).toBe(200)
    expect((await pool.query('SELECT count(*) FROM holiday_rules')).rows[0]?.count).toBe('1')

    expect((await app.inject({
      method: 'DELETE', url: `/api/holidays/${holidayId}`, headers: auth(admin.token),
    })).statusCode).toBe(200)
    expect((await pool.query('SELECT count(*) FROM holiday_rules')).rows[0]?.count).toBe('0')
  })

  it('stops a manager and a non-root administrator from registering company holidays', async () => {
    const admin = await mobileRegister('municipal-perm-admin@example.com')
    const create = async (role: 'MANAGER' | 'ADMIN', email: string) => {
      expect((await app.inject({
        method: 'POST', url: '/api/users', headers: auth(admin.token),
        payload: { name: email.split('@')[0], email, password: 'Password123', role },
      })).statusCode).toBe(201)
      const token = (await app.inject({
        method: 'POST', url: '/api/auth/mobile/login', payload: { email, password: 'Password123' },
      })).json().data.token as string
      return app.inject({
        method: 'POST', url: '/api/holidays', headers: auth(token),
        payload: { date: '2026-09-09', name: 'Festa', scope: 'MUNICIPAL' },
      })
    }
    expect((await create('MANAGER', 'municipal-manager@example.com')).statusCode).toBe(403)
    expect((await create('ADMIN', 'municipal-subadmin@example.com')).statusCode).toBe(403)
    expect((await pool.query('SELECT count(*) FROM holidays WHERE source = $1', ['MANUAL'])).rows[0]?.count).toBe('0')
  })
})
