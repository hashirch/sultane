// Saves the public catalogue (products, collections, settings, gemstones) from a
// running API into src/data/catalogue.json, so the storefront can run on static
// hosting (GitHub Pages) with no API behind it.
//
//   API_URL=http://localhost:4000 node scripts/snapshot-catalogue.mjs
import { writeFileSync } from 'node:fs'

const api = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '') + '/api'
const get = async (path) => {
  const res = await fetch(api + path)
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json()
}

// Product/collection ids are database UUIDs; strip timestamps so diffs stay small.
const products = (await get('/products')).map(({ created_at, updated_at, ...p }) => p)
const catalogue = {
  products,
  collections: await get('/collections'),
  gemstones: await get('/products/gemstones'),
  settings: await get('/settings'),
}
const out = new URL('../src/data/catalogue.json', import.meta.url)
writeFileSync(out, JSON.stringify(catalogue, null, 1) + '\n')
console.log(`Saved ${products.length} products, ${catalogue.collections.length} collections → src/data/catalogue.json`)
