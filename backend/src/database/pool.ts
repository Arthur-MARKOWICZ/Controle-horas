import pg from 'pg'
import type { AppConfig } from '../config.js'

const { Pool, types } = pg
types.setTypeParser(1082, (value) => value)
types.setTypeParser(1083, (value) => value)

export function createPool(config: AppConfig): pg.Pool {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: config.databasePoolMax,
    min: 0,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: 'controle-horas-fastify',
  })
  pool.on('error', (error) => process.stderr.write(`Unexpected PostgreSQL pool error: ${error.message}\n`))
  return pool
}
