/**
 * Loads the shop's real catalogue (frontend/src/data/catalogue.json — the products,
 * photos, collections and settings the owner built on the static site) into the
 * database. Safe to re-run: rows are matched by id/slug and updated in place.
 *
 *   npm run import-catalogue              # uses ../frontend/src/data/catalogue.json
 *   npm run import-catalogue -- other.json
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pool } from './pool'

interface Row {
  id: string
  sku: string
  slug: string
  name: string
  category: string
  price_pkr: number
  description: string
  sizes: string[] | null
  status: string
  production_time: string
  is_bestseller: boolean
  is_premium: boolean
  is_mens: boolean
  allow_customisation: boolean
  purity_925: boolean
  material_note: string | null
  gemstone_type: string | null
  gemstone_origin: string | null
  gemstone_details: string | null
  testing_available: boolean
  certification_info: string | null
  position: number
  collections: string[]
  images: { url: string; position: number }[]
  launched_at?: string | null
}

interface Catalogue {
  products: Row[]
  collections: { slug: string; name: string; tagline: string; description: string; image_url: string | null; position: number }[]
  settings: Record<string, unknown>
}

// Settings that hold the owner's choices; everything else keeps the database defaults.
const SETTING_KEYS = ['whatsapp_number', 'announcement', 'new_arrival_days', 'hero_poster_url', 'hero_video_url'] as const

export async function importCatalogue(file = join(__dirname, '../frontend/src/data/catalogue.json')) {
  const cat: Catalogue = JSON.parse(readFileSync(file, 'utf-8'))
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const c of cat.collections) {
      await client.query(
        `INSERT INTO collections (slug, name, tagline, description, image_url, position) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (slug) DO UPDATE SET name=$2, tagline=$3, description=$4, image_url=$5, position=$6`,
        [c.slug, c.name, c.tagline, c.description, c.image_url, c.position],
      )
    }

    for (const p of cat.products) {
      const values = [
        p.id, p.sku, p.slug, p.name, p.category, p.price_pkr, p.description, p.sizes?.length ? p.sizes : null, p.status,
        p.production_time, p.is_bestseller, p.is_premium, p.is_mens, p.allow_customisation, p.purity_925, p.material_note,
        p.gemstone_type, p.gemstone_origin, p.gemstone_details, p.testing_available, p.certification_info, p.position,
        p.launched_at || null,
      ]
      await client.query(
        `INSERT INTO products (id, sku, slug, name, category, price_pkr, description, sizes, status, production_time,
           is_bestseller, is_premium, is_mens, allow_customisation, purity_925, material_note,
           gemstone_type, gemstone_origin, gemstone_details, testing_available, certification_info, position, launched_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
         ON CONFLICT (id) DO UPDATE SET sku=$2, slug=$3, name=$4, category=$5, price_pkr=$6, description=$7, sizes=$8,
           status=$9, production_time=$10, is_bestseller=$11, is_premium=$12, is_mens=$13, allow_customisation=$14,
           purity_925=$15, material_note=$16, gemstone_type=$17, gemstone_origin=$18, gemstone_details=$19,
           testing_available=$20, certification_info=$21, position=$22, launched_at=$23, updated_at=now()`,
        values,
      )
      await client.query(`DELETE FROM product_collections WHERE product_id = $1`, [p.id])
      for (const slug of new Set(p.collections)) {
        await client.query(`INSERT INTO product_collections (product_id, collection_slug) VALUES ($1,$2)`, [p.id, slug])
      }
      // Shipped photos live in frontend/public/products (served by the website itself).
      await client.query(`DELETE FROM product_images WHERE product_id = $1 AND url LIKE '/products/%'`, [p.id])
      for (const img of p.images) {
        await client.query(`INSERT INTO product_images (product_id, url, position) VALUES ($1,$2,$3)`, [p.id, img.url, img.position])
      }
    }

    for (const key of SETTING_KEYS) {
      if (cat.settings[key] === undefined || cat.settings[key] === '') continue
      await client.query(`INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = $2`, [
        key,
        JSON.stringify(cat.settings[key]),
      ])
    }
    await client.query('COMMIT')
    console.log(`Imported ${cat.products.length} products and ${cat.collections.length} collections from ${file}.`)
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

if (require.main === module) {
  const arg = process.argv[2]
  importCatalogue(arg ? resolve(arg) : undefined)
    .then(() => pool.end())
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
