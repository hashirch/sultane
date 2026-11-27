import { Pool, types } from 'pg'
import 'dotenv/config'

// DATE columns (launch date, dispatch date, purchase date) come back as plain
// 'YYYY-MM-DD' text, so they never shift a day with the server's time zone.
types.setTypeParser(types.builtins.DATE, (v: string) => v)

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

pool.on('error', (err: Error) => {
  console.error('Unexpected PostgreSQL client error', err)
})
