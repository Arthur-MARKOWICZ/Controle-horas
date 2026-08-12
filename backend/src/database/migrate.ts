import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PoolClient } from 'pg'
import { loadConfig } from '../config.js'
import { createPool } from './pool.js'

interface Migration { version: number; description: string; filename: string; sql: string; checksum: string }

async function loadMigrations(): Promise<Migration[]> {
  const directory = join(dirname(fileURLToPath(import.meta.url)), 'migrations')
  const files = (await readdir(directory)).filter((file) => /^V\d+__.+\.sql$/.test(file))
  const migrations = await Promise.all(files.map(async (filename) => {
    const match = /^V(\d+)__(.+)\.sql$/.exec(filename)!
    const sql = await readFile(join(directory, filename), 'utf8')
    return {
      version: Number(match[1]),
      description: match[2]!.replaceAll('_', ' '),
      filename,
      sql,
      checksum: createHash('sha256').update(sql.replaceAll('\r\n', '\n')).digest('hex'),
    }
  }))
  return migrations.sort((left, right) => left.version - right.version)
}

async function tableExists(client: PoolClient, table: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    'SELECT to_regclass($1) IS NOT NULL AS exists', [`public.${table}`],
  )
  return result.rows[0]?.exists === true
}

async function bootstrapMetadata(client: PoolClient, migrations: Migration[]): Promise<void> {
  const appMetadataExists = await tableExists(client, 'app_schema_migrations')
  const usersExists = await tableExists(client, 'users')
  const flywayExists = await tableExists(client, 'flyway_schema_history')

  if (!appMetadataExists && usersExists && !flywayExists) {
    throw new Error('Existing schema has no recognized migration metadata; refusing automatic adoption')
  }

  await client.query(`
    CREATE TABLE IF NOT EXISTS app_schema_migrations (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      checksum CHAR(64) NOT NULL,
      source VARCHAR(20) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  if (flywayExists) {
    const failed = await client.query<{ version: string }>(
      'SELECT version FROM flyway_schema_history WHERE success = FALSE ORDER BY installed_rank',
    )
    if (failed.rowCount) throw new Error(`Flyway contains failed migration ${failed.rows[0]!.version}; repair it before continuing`)
    const applied = await client.query<{ version: string }>(
      "SELECT version FROM flyway_schema_history WHERE success = TRUE AND type = 'SQL'",
    )
    const versions = new Set(applied.rows.map((row) => Number.parseInt(row.version, 10)))
    if (usersExists && versions.size === 0) {
      throw new Error('Existing Flyway schema has no successful versioned SQL migrations; refusing automatic adoption')
    }
    const knownVersions = new Set(migrations.map((migration) => migration.version))
    for (const version of versions) {
      if (!Number.isInteger(version) || !knownVersions.has(version)) {
        throw new Error(`Flyway contains unknown migration version ${version}; refusing automatic adoption`)
      }
    }
    const highest = Math.max(0, ...versions)
    for (let version = 1; version <= highest; version += 1) {
      if (!versions.has(version)) throw new Error(`Flyway migration history is missing V${version}; refusing automatic adoption`)
    }
    for (const migration of migrations.filter((item) => versions.has(item.version))) {
      await client.query(
        `INSERT INTO app_schema_migrations(version, description, checksum, source)
         VALUES ($1, $2, $3, 'flyway') ON CONFLICT (version) DO NOTHING`,
        [migration.version, migration.description, migration.checksum],
      )
    }
  }
}

export async function runMigrations(): Promise<void> {
  const pool = createPool(loadConfig())
  const client = await pool.connect()
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('controle_horas_schema_migrations'))")
    const migrations = await loadMigrations()
    await client.query('BEGIN')
    try {
      await bootstrapMetadata(client, migrations)
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
    const appliedResult = await client.query<{ version: number; checksum: string }>(
      'SELECT version, checksum FROM app_schema_migrations ORDER BY version',
    )
    const applied = new Map(appliedResult.rows.map((row) => [row.version, row.checksum.trim()]))

    for (const migration of migrations) {
      const previousChecksum = applied.get(migration.version)
      if (previousChecksum && previousChecksum !== migration.checksum) {
        throw new Error(`Applied migration V${migration.version} checksum changed`)
      }
      if (previousChecksum) continue

      await client.query('BEGIN')
      try {
        await client.query(migration.sql)
        await client.query(
          `INSERT INTO app_schema_migrations(version, description, checksum, source)
           VALUES ($1, $2, $3, 'typescript')`,
          [migration.version, migration.description, migration.checksum],
        )
        await client.query('COMMIT')
        process.stdout.write(`Applied ${migration.filename}\n`)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('controle_horas_schema_migrations'))").catch(() => undefined)
    client.release()
    await pool.end()
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runMigrations().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
