/**
 * Deploy-time setup for hosts without a shell (e.g. Render free plan):
 * applies schema.sql (idempotent) and seeds sample data only on an empty
 * database, so restarts never overwrite what the owner changed in the dashboard.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pool } from './pool'

async function bootstrap() {
  await pool.query(readFileSync(join(__dirname, 'schema.sql'), 'utf-8'))
  console.log('Schema applied.')
  const { rows } = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM products')
  await pool.end()
  if (rows[0].n > 0) {
    console.log(`Database already has ${rows[0].n} products — skipping seed.`)
    return
  }
  console.log('Empty database — seeding sample data...')
  execFileSync(process.execPath, [require.resolve('tsx/cli'), join(__dirname, 'seed.ts')], { stdio: 'inherit' })
}

bootstrap().catch((err) => {
  console.error(err)
  process.exit(1)
})
