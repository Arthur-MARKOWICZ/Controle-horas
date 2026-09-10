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
  it('requires the America/Sao_Paulo timezone', () => expect(() => loadConfig({ ...environment, TIME_ZONE: 'UTC' })).toThrow('TIME_ZONE must be America/Sao_Paulo'))
  it('defaults the holiday provider settings', () => {
    const config = loadConfig(environment)
    expect(config).toMatchObject({
      nagerBaseUrl: 'https://date.nager.at', nagerTimeoutMs: 5_000, holidaySyncRateLimitPerMinute: 5,
    })
  })
  it('trims a trailing slash from the holiday provider url', () => {
    expect(loadConfig({ ...environment, NAGER_BASE_URL: 'https://example.test/' }).nagerBaseUrl)
      .toBe('https://example.test')
  })
  it('validates the holiday provider timeout', () => {
    expect(() => loadConfig({ ...environment, NAGER_TIMEOUT_MS: '10' })).toThrow('NAGER_TIMEOUT_MS')
  })
  it('validates the holiday sync rate limit', () => {
    expect(() => loadConfig({ ...environment, HOLIDAY_SYNC_RATE_LIMIT_PER_MINUTE: '0' }))
      .toThrow('HOLIDAY_SYNC_RATE_LIMIT_PER_MINUTE')
  })
})
