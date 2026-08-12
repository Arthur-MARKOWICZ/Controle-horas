export interface AppConfig {
  databaseUrl: string
  databasePoolMax: number
  jwtAccessSecret: string
  jwtRefreshSecret: string
  jwtAccessTtlSeconds: number
  jwtRefreshTtlSeconds: number
  bcryptRounds: number
  cookieSecure: boolean
  corsAllowedOrigins: string[]
  timeZone: string
  port: number
  nodeEnv: 'development' | 'test' | 'production'
  openApiEnabled: boolean
  logLevel: string
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function integer(environment: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = environment[name]?.trim()
  const value = raw ? Number.parseInt(raw, 10) : fallback
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`)
  }
  return value
}

function boolean(environment: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = environment[name]?.trim().toLowerCase()
  if (!raw) return fallback
  if (raw === 'true') return true
  if (raw === 'false') return false
  throw new Error(`${name} must be true or false`)
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = environment.NODE_ENV?.trim() || 'development'
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test or production')
  }

  const jwtAccessSecret = required(environment, 'JWT_ACCESS_SECRET')
  const jwtRefreshSecret = required(environment, 'JWT_REFRESH_SECRET')
  if (Buffer.byteLength(jwtAccessSecret) < 32 || Buffer.byteLength(jwtRefreshSecret) < 32) {
    throw new Error('JWT secrets must contain at least 32 bytes')
  }
  if (jwtAccessSecret === jwtRefreshSecret) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different')
  }

  const timeZone = environment.TIME_ZONE?.trim() || 'America/Sao_Paulo'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date())
  } catch {
    throw new Error('TIME_ZONE must be a valid IANA timezone')
  }

  return {
    databaseUrl: required(environment, 'DATABASE_URL'),
    databasePoolMax: integer(environment, 'DB_POOL_MAX', 5, 1, 5),
    jwtAccessSecret,
    jwtRefreshSecret,
    jwtAccessTtlSeconds: integer(environment, 'JWT_ACCESS_TTL_SECONDS', 900, 60, 86_400),
    jwtRefreshTtlSeconds: integer(environment, 'JWT_REFRESH_TTL_SECONDS', 2_592_000, 3_600, 31_536_000),
    bcryptRounds: integer(environment, 'BCRYPT_ROUNDS', 10, 10, 14),
    cookieSecure: boolean(environment, 'COOKIE_SECURE', nodeEnv === 'production'),
    corsAllowedOrigins: (environment.CORS_ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean),
    timeZone,
    port: integer(environment, 'PORT', 8080, 1, 65_535),
    nodeEnv: nodeEnv as AppConfig['nodeEnv'],
    openApiEnabled: boolean(environment, 'OPENAPI_ENABLED', nodeEnv !== 'production'),
    logLevel: environment.LOG_LEVEL?.trim() || (nodeEnv === 'production' ? 'warn' : 'info'),
  }
}
