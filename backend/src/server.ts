import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import fs from 'node:fs'
import path from 'node:path'

async function loadDotEnvIfPresent(): Promise<void> {
  const envPath = path.resolve(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) return
  const content = await fs.promises.readFile(envPath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*)\s*$/)
    if (!match) continue
    const [, rawKey, rawValue] = match
    if (rawKey === undefined || rawValue === undefined) continue
    const key = rawKey.trim()
    let val = rawValue.trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

await loadDotEnvIfPresent()

const config = loadConfig()
const app = await buildApp({ config })

const close = async (signal: string): Promise<void> => {
  app.log.info({ signal }, 'Shutting down')
  await app.close()
  process.exit(0)
}
process.on('SIGTERM', () => { void close('SIGTERM') })
process.on('SIGINT', () => { void close('SIGINT') })

try {
  await app.listen({ host: '0.0.0.0', port: config.port })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
