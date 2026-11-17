// Builds the products in src/data/catalogue.json from catalogue/products.tsv —
// the single list of real products (names, prices, photos, descriptions).
//
//   npm run catalogue
//
// To change a price: edit the `price` column (0 = "Price on request") and re-run.
// Photos live in public/products/ and are listed by filename, main photo first.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'

const root = new URL('..', import.meta.url)
const file = (p) => new URL(p, root)
const [header, ...lines] = readFileSync(file('catalogue/products.tsv'), 'utf8').replace(/\r/g, '').trim().split('\n')
const cols = header.split('\t')

// Shown in the homepage "Bestsellers" row.
const BESTSELLERS = new Set([
  'rose-amour-pendant', 'aisha-arabic-name-necklace', 'emerald-blossom-necklace', 'swan-pendant',
  'evil-eye-bracelet', 'blue-enamel-chandbali', 'green-signet-ring', 'curb-chain',
])
// Pieces whose 925 sterling purity the owner has confirmed (shows the "925" tag).
const PURITY_CONFIRMED = new Set(['rose-amour-pendant'])
const PREMIUM = new Set(['rose-amour-pendant'])

const catalogue = JSON.parse(readFileSync(file('src/data/catalogue.json'), 'utf8'))
const previousIds = new Map(catalogue.products.map((p) => [p.sku, p.id]))
// Stable UUID-shaped id per SKU, so bags saved in a browser keep working across rebuilds.
const idFor = (sku) => {
  if (previousIds.has(sku)) return previousIds.get(sku)
  const h = createHash('sha1').update(`sultane:${sku}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

const errors = []
const seen = new Set()
const products = lines.map((line, position) => {
  const v = Object.fromEntries(line.split('\t').map((x, i) => [cols[i], x]))
  for (const key of ['sku', 'slug']) {
    if (seen.has(v[key])) errors.push(`duplicate ${key} ${v[key]}`)
    seen.add(v[key])
  }
  const price = Number(v.price)
  if (!Number.isInteger(price) || price < 0) errors.push(`${v.sku}: price must be a whole number of rupees (0 = on request)`)
  const images = v.images.split(',').map((name, i) => {
    if (!existsSync(file(`public/products/${name}`))) errors.push(`${v.sku}: missing public/products/${name}`)
    return { id: `${v.sku}-${i + 1}`, url: `/products/${name}`, position: i }
  })
  return {
    id: idFor(v.sku),
    sku: v.sku,
    slug: v.slug,
    name: v.name,
    category: v.category,
    price_pkr: price,
    description: v.description.replace(/\\n/g, '\n'),
    sizes: null,
    status: 'active',
    production_time: '7–10 working days',
    is_bestseller: BESTSELLERS.has(v.slug),
    is_premium: PREMIUM.has(v.slug),
    is_mens: v.mens === '1',
    allow_customisation: true,
    purity_925: PURITY_CONFIRMED.has(v.slug),
    material_note: PURITY_CONFIRMED.has(v.slug) ? 'Silver composition confirmed by the jewellery maker for this design.' : null,
    gemstone_type: null,
    gemstone_origin: null,
    gemstone_details: null,
    testing_available: false,
    certification_info: null,
    position,
    collections: [v.collection],
    images,
  }
})
if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}

catalogue.products = products
catalogue.gemstones = [...new Set(products.map((p) => p.gemstone_type).filter(Boolean))].sort()
for (const c of catalogue.collections) c.product_count = products.filter((p) => p.collections.includes(c.slug)).length
writeFileSync(file('src/data/catalogue.json'), JSON.stringify(catalogue, null, 1) + '\n')
const unpriced = products.filter((p) => !p.price_pkr).length
console.log(`catalogue.json: ${products.length} products (${unpriced} on request), ${products.reduce((n, p) => n + p.images.length, 0)} photos`)
