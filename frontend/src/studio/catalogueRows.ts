// Helpers for editing rows of src/data/catalogue.json (snake_case, as the API returns them).
import type { Category } from '../data/types'
import type { CatalogueFile } from './github'

export interface PhotoRow {
  id: string
  url: string
  position: number
}

export interface ProductRow {
  id: string
  sku: string
  slug: string
  name: string
  category: Category
  price_pkr: number
  description: string
  sizes: string[] | null
  status: 'active' | 'paused' | 'draft'
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
  images: PhotoRow[]
  launched_at?: string | null
}

export const rowsOf = (c: CatalogueFile) => c.products as unknown as ProductRow[]

export function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function slugify(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function uniqueSlug(name: string, rows: ProductRow[], selfId?: string) {
  const base = slugify(name) || 'product'
  const taken = new Set(rows.filter((r) => r.id !== selfId).map((r) => r.slug))
  let slug = base
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`
  return slug
}

const PREFIX: Record<Category, string> = {
  Necklaces: 'NK',
  Pendants: 'PD',
  Chains: 'MC',
  Rings: 'RG',
  Bracelets: 'BR',
  Earrings: 'ER',
  Cufflinks: 'CL',
}

/** Next free SKU for the category, e.g. SLT-RG-017 (men's rings use MR). */
export function nextSku(category: Category, mens: boolean, rows: ProductRow[]) {
  const prefix = category === 'Rings' && mens ? 'MR' : PREFIX[category]
  const used = rows.map((r) => r.sku.match(new RegExp(`^SLT-${prefix}-(\\d+)$`))?.[1]).filter(Boolean).map(Number)
  return `SLT-${prefix}-${String(Math.max(0, ...used) + 1).padStart(3, '0')}`
}

export function blankProduct(): ProductRow {
  return {
    id: crypto.randomUUID(),
    sku: '',
    slug: '',
    name: '',
    category: 'Necklaces',
    price_pkr: 0,
    description: '',
    sizes: null,
    status: 'active',
    production_time: '7–10 working days',
    is_bestseller: false,
    is_premium: false,
    is_mens: false,
    allow_customisation: true,
    purity_925: false,
    material_note: null,
    gemstone_type: null,
    gemstone_origin: null,
    gemstone_details: null,
    testing_available: false,
    certification_info: null,
    position: 0,
    collections: [],
    images: [],
    launched_at: today(),
  }
}

/** Keeps derived fields (collection counts, gemstone filter list) in step with the products. */
export function withDerived(c: CatalogueFile): CatalogueFile {
  const rows = rowsOf(c)
  const live = rows.filter((r) => r.status !== 'draft')
  return {
    ...c,
    products: rows.map((r, i) => ({ ...r, position: i })) as unknown as CatalogueFile['products'],
    gemstones: [...new Set(live.map((r) => r.gemstone_type).filter((g): g is string => !!g))].sort(),
    collections: c.collections.map((col) => ({ ...col, product_count: live.filter((r) => r.collections.includes(String(col.slug))).length })),
  }
}
