import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
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

  it('runs a new database and safely adopts successful Flyway V1-V11 before V13', async () => {
    const versions = await pool.query<{ version: number }>('SELECT version FROM app_schema_migrations ORDER BY version')
    expect(versions.rows.map((row) => row.version)).toEqual([1,2,3,4,5,6,7,8,9,10,11,12,13])
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
      await adoptedPool.query('DROP TABLE auth_refresh_tokens')
      await adoptedPool.query('DROP TABLE password_reset_tokens')
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
      expect(adopted.rows.at(-1)).toEqual({ version: 13, source: 'typescript' })
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
    const csv = `email,entry_at,exit_at,close_reason\n`
      + `${childEmail},2026-01-05T08:00:00-03:00,2026-01-05T17:00:00-03:00,EXIT\n`
      + `${childEmail},2026-01-05T08:00:00-03:00,2026-01-05T17:00:00-03:00,EXIT\n`
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

    const employee = await app.inject({
      method: 'POST', url: '/api/auth/mobile/login', payload: { email: 'adjustments-employee@example.com', password: 'Password123' },
    })
    const forbidden = await app.inject({
      method: 'POST', url: `/api/users/${childId}/work-logs`, headers: auth(employee.json().data.token as string),
      payload: { entryAt: '2026-07-14T11:00:00.000Z', exitAt: '2026-07-14T20:00:00.000Z' },
    })
    expect(forbidden.statusCode).toBe(403)
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
})
