import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'

const environment = {
  DATABASE_URL: 'postgres://localhost/test',
  JWT_ACCESS_SECRET: 'a'.repeat(32), JWT_REFRESH_SECRET: 'b'.repeat(32), NODE_ENV: 'test',
}

describe('configuration', () => {
  it('loads conservative defaults', () => {
    const config = loadConfig(environment)
    expect(config.databasePoolMax).toBe(5)
    expect(config.jwtAccessTtlSeconds).toBe(900)
    expect(config.cookieSecure).toBe(false)
  })
  it('fails fast for missing database URL', () => expect(() => loadConfig({ ...environment, DATABASE_URL: '' })).toThrow('DATABASE_URL is required'))
  it('requires different JWT secrets', () => expect(() => loadConfig({ ...environment, JWT_REFRESH_SECRET: 'a'.repeat(32) })).toThrow('must be different'))
  it('validates the connection pool limit', () => expect(() => loadConfig({ ...environment, DB_POOL_MAX: '50' })).toThrow('DB_POOL_MAX'))
})
