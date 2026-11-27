/**
 * Deploy-time setup for hosts without a shell (e.g. Render): applies schema.sql
 * (idempotent) and fills only an empty database, so restarts never overwrite what
 * the owner changed in the dashboard.
 *
 * An empty database gets the shop's real catalogue (frontend/src/data/catalogue.json)
 * plus the owner account and default settings. Set SEED_SAMPLES=yes to load the
 * sample catalogue instead (development and acceptance tests).
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pool } from './pool'
import { importCatalogue } from './import-catalogue'

async function bootstrap() {
  await pool.query(readFileSync(join(__dirname, 'schema.sql'), 'utf-8'))
  console.log('Schema applied.')
  const { rows } = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM products')
  if (rows[0].n > 0) {
    await pool.end()
    console.log(`Database already has ${rows[0].n} products — leaving it as it is.`)
    return
  }
  const samples = process.env.SEED_SAMPLES === 'yes'
  if (!samples) {
    console.log('Empty database — loading the shop catalogue...')
    await importCatalogue()
  }
  await pool.end()
  execFileSync(process.execPath, [require.resolve('tsx/cli'), join(__dirname, 'seed.ts')], {
    stdio: 'inherit',
    env: { ...process.env, SEED_SAMPLES: samples ? 'yes' : 'no' },
  })
}

bootstrap().catch((err) => {
  console.error(err)
  process.exit(1)
})
