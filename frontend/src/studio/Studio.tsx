// SULTANÉ owner dashboard for the static site: edit the catalogue, prices,
// descriptions and photos, launch new products and run New Arrivals.
// Every save is committed to the GitHub repository and republishes the site.
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ExternalLink, ImagePlus, LogOut, Plus, Search, Sparkles, Star, Trash2 } from 'lucide-react'
import Wordmark from '../components/Wordmark'
import { CATEGORIES, type Category } from '../data/types'
import { photoUrl } from '../lib/api'
import { DEFAULT_NEW_ARRIVAL_DAYS } from '../lib/newArrivals'
import { inputCls, Panel, Badge, AdminButton, Label, Notice } from '../components/admin/ui'
import { BRANCH, PHOTO_DIR, REPO, GitHubError, publishState, readCatalogue, saveCatalogue, verifyAccess, type CatalogueFile, type NewFile, type PublishState } from './github'
import { blankProduct, nextSku, rowsOf, today, uniqueSlug, withDerived, type PhotoRow, type ProductRow } from './catalogueRows'
import { preparePhoto, type PreparedPhoto } from './photos'

const TOKEN_KEY = 'sultane_studio_key'
const readToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}
const writeToken = (t: string) => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* private window: the key just isn't remembered */
  }
}

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong')
const siteUrl = (path: string) => `${import.meta.env.BASE_URL.replace(/\/$/, '')}${path}`

// ═══ Sign-in ═══════════════════════════════════════════════════
function SignIn({ onSignedIn }: { onSignedIn: (token: string) => void }) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await verifyAccess(key.trim())
      writeToken(key.trim())
      onSignedIn(key.trim())
    } catch (err) {
      setError(errText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-cream-dark flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg bg-cream border border-line p-8">
        <Wordmark className="text-3xl" />
        <h1 className="font-display text-3xl mt-6 mb-2">Owner dashboard</h1>
        <p className="text-sm text-stone mb-6">
          Sign in with your GitHub access key. Changes you save here are published to the website in about a minute.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <Label>GitHub access key</Label>
            <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} className={inputCls} placeholder="github_pat_…" required />
          </label>
          {error && <Notice tone="bad">{error}</Notice>}
          <AdminButton type="submit" disabled={busy || !key.trim()} className="w-full">
            {busy ? 'Checking…' : 'Sign in'}
          </AdminButton>
        </form>
        <details className="mt-8 text-sm text-stone">
          <summary className="cursor-pointer text-ink">How do I get an access key?</summary>
          <ol className="list-decimal pl-5 mt-3 space-y-1.5">
            <li>
              Signed in to GitHub as the owner of <strong>{REPO}</strong>, open{' '}
              <a className="underline" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
                github.com/settings/personal-access-tokens/new
              </a>
              .
            </li>
            <li>Name it "SULTANÉ dashboard" and choose an expiry date.</li>
            <li>
              Under <em>Repository access</em> choose <strong>Only select repositories</strong> → <strong>{REPO}</strong>.
            </li>
            <li>
              Under <em>Permissions → Repository</em> set <strong>Contents: Read and write</strong> and <strong>Actions: Read-only</strong>.
            </li>
            <li>Generate it, copy it and paste it above. Keep it private — anyone with it can change the website.</li>
          </ol>
          <p className="mt-3">The key is remembered only in this browser. Use <em>Sign out</em> on shared computers.</p>
        </details>
      </div>
    </div>
  )
}

// ═══ Publish status ════════════════════════════════════════════
function usePublishWatcher(token: string) {
  const [commit, setCommit] = useState<string | null>(null)
  const [state, setState] = useState<PublishState | null>(null)

  useEffect(() => {
    if (!commit) return
    let stop = false
    let tries = 0
    const tick = async () => {
      if (stop) return
      const s = await publishState(token, commit)
      setState(s)
      if (s === 'queued' || s === 'building') {
        if (++tries < 40) setTimeout(tick, 8000)
      }
    }
    setState('queued')
    setTimeout(tick, 5000)
    return () => {
      stop = true
    }
  }, [commit, token])

  return { watch: setCommit, state }
}

function PublishBanner({ state }: { state: PublishState | null }) {
  if (!state) return null
  const text: Record<PublishState, ReactNode> = {
    queued: 'Saved. Publishing to the website…',
    building: 'Saved. Publishing to the website… (usually about a minute)',
    live: (
      <>
        Your changes are live on the website.{' '}
        <a href={siteUrl('/')} target="_blank" rel="noreferrer" className="underline">
          Open the shop
        </a>
      </>
    ),
    failed: 'Saved, but publishing failed. Open GitHub → Actions to see why, or save again to retry.',
    unknown: 'Saved. The website updates in about a minute (refresh the shop to see it).',
  }
  return <Notice tone={state === 'failed' ? 'bad' : state === 'live' || state === 'unknown' ? 'good' : 'warn'}>{text[state]}</Notice>
}

// ═══ Product list ══════════════════════════════════════════════
function isNew(r: ProductRow, days: number) {
  if (!r.launched_at || r.status === 'draft') return false
  const [y, m, d] = r.launched_at.split('-').map(Number)
  const age = Math.round((new Date(new Date().toDateString()).getTime() - new Date(y, m - 1, d).getTime()) / 86_400_000)
  return age >= 0 && age < days
}

function ProductList({ rows, days, onEdit, onNew }: { rows: ProductRow[]; days: number; onEdit: (id: string) => void; onNew: () => void }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<'' | Category>('')
  const [show, setShow] = useState<'' | 'new' | 'unpriced' | 'hidden'>('')
  const list = rows.filter(
    (r) =>
      (!cat || r.category === cat) &&
      (!q || `${r.name} ${r.sku}`.toLowerCase().includes(q.toLowerCase())) &&
      (show !== 'new' || isNew(r, days)) &&
      (show !== 'unpriced' || !r.price_pkr) &&
      (show !== 'hidden' || r.status !== 'active'),
  )
  const counts = { all: rows.length, unpriced: rows.filter((r) => !r.price_pkr).length, fresh: rows.filter((r) => isNew(r, days)).length }

  return (
    <Panel
      title={`Products (${counts.all})`}
      actions={
        <AdminButton onClick={onNew}>
          <span className="inline-flex items-center gap-1.5"><Plus size={14} /> Launch new product</span>
        </AdminButton>
      }
    >
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or product ID" className={`${inputCls} pl-9`} />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value as Category | '')} className={`${inputCls} w-auto`}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={show} onChange={(e) => setShow(e.target.value as typeof show)} className={`${inputCls} w-auto`}>
          <option value="">Everything</option>
          <option value="new">New Arrivals ({counts.fresh})</option>
          <option value="unpriced">No price yet ({counts.unpriced})</option>
          <option value="hidden">Hidden or paused</option>
        </select>
      </div>
      <div className="divide-y divide-line">
        {list.map((r) => (
          <button key={r.id} onClick={() => onEdit(r.id)} className="w-full flex items-center gap-4 py-3 text-left hover:bg-cream-dark px-2 -mx-2">
            {r.images[0] ? (
              <img src={photoUrl(r.images[0].url)} alt="" className="w-14 h-14 object-cover bg-cream-dark shrink-0" loading="lazy" />
            ) : (
              <div className="w-14 h-14 bg-cream-dark shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-display text-lg leading-tight truncate">{r.name}</div>
              <div className="text-xs text-stone">
                {r.sku} · {r.category}
                {r.is_mens ? ' · Men' : ''}
              </div>
            </div>
            <div className="hidden sm:flex gap-1.5 flex-wrap justify-end">
              {isNew(r, days) && <Badge tone="rose">New arrival</Badge>}
              {r.status === 'draft' && <Badge tone="dark">Hidden</Badge>}
              {r.status === 'paused' && <Badge tone="warn">Paused</Badge>}
              {r.is_bestseller && <Badge>Bestseller</Badge>}
            </div>
            <div className={`w-28 text-right text-sm shrink-0 ${r.price_pkr ? '' : 'text-warn'}`}>{r.price_pkr ? `Rs. ${r.price_pkr.toLocaleString('en-PK')}` : 'No price'}</div>
          </button>
        ))}
        {list.length === 0 && <p className="py-8 text-center text-stone text-sm">No products match.</p>}
      </div>
    </Panel>
  )
}

// ═══ Product editor ════════════════════════════════════════════
type EditPhoto = { kind: 'saved'; row: PhotoRow } | { kind: 'new'; photo: PreparedPhoto }

function ProductEditor({
  initial,
  isNewProduct,
  rows,
  collections,
  days,
  saving,
  onSave,
  onDelete,
  onBack,
}: {
  initial: ProductRow
  isNewProduct: boolean
  rows: ProductRow[]
  collections: { slug: string; name: string }[]
  days: number
  saving: boolean
  onSave: (row: ProductRow, photos: EditPhoto[]) => void
  onDelete: (row: ProductRow) => void
  onBack: () => void
}) {
  const [p, setP] = useState<ProductRow>(initial)
  const [photos, setPhotos] = useState<EditPhoto[]>(initial.images.map((row) => ({ kind: 'saved', row })))
  const [photoError, setPhotoError] = useState('')
  const [preparing, setPreparing] = useState(false)
  const set = <K extends keyof ProductRow>(k: K, v: ProductRow[K]) => setP((x) => ({ ...x, [k]: v }))

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return
    setPhotoError('')
    setPreparing(true)
    try {
      const base = uniqueSlug(p.name || 'product', [])
      const ready = await Promise.all([...files].map((f) => preparePhoto(f, base)))
      setPhotos((ph) => [...ph, ...ready.map((photo) => ({ kind: 'new' as const, photo }))])
    } catch (err) {
      setPhotoError(errText(err))
    } finally {
      setPreparing(false)
    }
  }
  const move = (i: number, d: -1 | 1) =>
    setPhotos((ph) => {
      const next = [...ph]
      const j = i + d
      if (j < 0 || j >= next.length) return ph
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const problems = [
    !p.name.trim() && 'Add a product name.',
    !p.description.trim() && 'Add a description.',
    p.status !== 'draft' && photos.length === 0 && 'Add at least one photo (or set the product to Hidden).',
    p.collections.length === 0 && 'Choose at least one collection.',
  ].filter(Boolean) as string[]

  const newNow = isNew(p, days)
  const livePath = `/product/${isNewProduct ? uniqueSlug(p.name || 'product', rows, p.id) : p.slug}`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className="text-sm text-stone hover:text-noir inline-flex items-center gap-1.5">
          <ArrowLeft size={15} /> All products
        </button>
        {!isNewProduct && p.status !== 'draft' && (
          <a href={siteUrl(livePath)} target="_blank" rel="noreferrer" className="text-sm text-rose-dark inline-flex items-center gap-1.5 underline underline-offset-2">
            View on website <ExternalLink size={13} />
          </a>
        )}
      </div>

      <Panel title={isNewProduct ? 'Launch a new product' : `Edit · ${initial.sku}`}>
        <div className="grid md:grid-cols-2 gap-5">
          <label className="block md:col-span-2">
            <Label>Product name</Label>
            <input value={p.name} onChange={(e) => set('name', e.target.value)} className={inputCls} placeholder="e.g. Ocean Whisper Ring" />
          </label>
          <label className="block">
            <Label hint="Leave at 0 to show “Price on request” with an Ask-on-WhatsApp button.">Price (PKR)</Label>
            <input type="number" min={0} step={1} value={p.price_pkr || ''} onChange={(e) => set('price_pkr', Math.max(0, Math.round(Number(e.target.value) || 0)))} className={inputCls} placeholder="0" />
          </label>
          <label className="block">
            <Label hint="Hidden products are not shown on the website at all.">Visibility</Label>
            <select value={p.status} onChange={(e) => set('status', e.target.value as ProductRow['status'])} className={inputCls}>
              <option value="active">Published — on sale</option>
              <option value="paused">Paused — visible, orders paused</option>
              <option value="draft">Hidden — not on the website</option>
            </select>
          </label>
          <label className="block">
            <Label>Category</Label>
            <select value={p.category} onChange={(e) => set('category', e.target.value as Category)} className={inputCls}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="block">
            <Label>Production time</Label>
            <input value={p.production_time} onChange={(e) => set('production_time', e.target.value)} className={inputCls} />
          </label>
          <div className="md:col-span-2">
            <Label>Collections</Label>
            <div className="flex flex-wrap gap-4">
              {collections.map((c) => (
                <label key={c.slug} className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="accent-noir"
                    checked={p.collections.includes(c.slug)}
                    onChange={(e) => set('collections', e.target.checked ? [...p.collections, c.slug] : p.collections.filter((s) => s !== c.slug))}
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
          <label className="block md:col-span-2">
            <Label hint="Blank lines start a new paragraph on the website.">Description</Label>
            <textarea value={p.description} onChange={(e) => set('description', e.target.value)} rows={8} className={inputCls} />
          </label>
          <div className="md:col-span-2 flex flex-wrap gap-x-6 gap-y-3 text-sm">
            {(
              [
                ['is_mens', "Men's collection"],
                ['is_bestseller', 'Bestseller (homepage)'],
                ['is_premium', 'Premium Collection'],
                ['purity_925', '925 Sterling Silver confirmed'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="inline-flex items-center gap-2">
                <input type="checkbox" className="accent-noir" checked={p[k]} onChange={(e) => set(k, e.target.checked)} />
                {label}
              </label>
            ))}
          </div>
        </div>
      </Panel>

      <Panel title="New Arrivals">
        <p className="text-sm text-stone mb-4">
          A product appears in <strong>New Arrivals</strong> for {days} days from its launch date, then leaves the section on its own.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <label className="block">
            <Label>Launch date</Label>
            <input type="date" value={p.launched_at ?? ''} onChange={(e) => set('launched_at', e.target.value || null)} className={`${inputCls} w-auto`} />
          </label>
          <AdminButton type="button" variant="outline" onClick={() => set('launched_at', today())}>
            <span className="inline-flex items-center gap-1.5"><Sparkles size={13} /> Show as new from today</span>
          </AdminButton>
          {p.launched_at && (
            <AdminButton type="button" variant="ghost" onClick={() => set('launched_at', null)}>
              Remove from New Arrivals
            </AdminButton>
          )}
          <span className="text-sm">{newNow ? <Badge tone="rose">Currently a new arrival</Badge> : <Badge>Not in New Arrivals</Badge>}</span>
        </div>
      </Panel>

      <Panel title="Photos">
        <p className="text-sm text-stone mb-4">The first photo is the main one (use the white-background shot). The second shows when a shopper hovers.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          {photos.map((ph, i) => (
            <div key={ph.kind === 'saved' ? ph.row.id : ph.photo.name} className="border border-line bg-white">
              <div className="relative aspect-square bg-cream-dark">
                <img src={ph.kind === 'saved' ? photoUrl(ph.row.url) : ph.photo.preview} alt="" className="absolute inset-0 w-full h-full object-cover" />
                {i === 0 && <span className="absolute top-2 left-2"><Badge tone="dark">Main</Badge></span>}
                {ph.kind === 'new' && <span className="absolute top-2 right-2"><Badge tone="rose">New</Badge></span>}
              </div>
              <div className="flex justify-between p-1.5">
                <button type="button" aria-label="Move left" disabled={i === 0} onClick={() => move(i, -1)} className="p-1.5 disabled:opacity-30"><ArrowLeft size={14} /></button>
                {i !== 0 && (
                  <button type="button" aria-label="Make main photo" onClick={() => setPhotos((x) => [x[i], ...x.filter((_, j) => j !== i)])} className="p-1.5" title="Make main photo"><Star size={14} /></button>
                )}
                <button type="button" aria-label="Remove photo" onClick={() => setPhotos((x) => x.filter((_, j) => j !== i))} className="p-1.5 text-danger"><Trash2 size={14} /></button>
                <button type="button" aria-label="Move right" disabled={i === photos.length - 1} onClick={() => move(i, 1)} className="p-1.5 disabled:opacity-30"><ArrowRight size={14} /></button>
              </div>
            </div>
          ))}
          <label className="aspect-square border border-dashed border-silver flex flex-col items-center justify-center gap-2 text-sm text-stone cursor-pointer hover:border-noir">
            <ImagePlus size={22} strokeWidth={1.3} />
            {preparing ? 'Preparing…' : 'Add photos'}
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = '' }} />
          </label>
        </div>
        {photoError && <Notice tone="bad">{photoError}</Notice>}
      </Panel>

      <div className="sticky bottom-0 bg-cream border-t border-line -mx-5 sm:-mx-8 px-5 sm:px-8 py-4 flex flex-wrap items-center gap-3">
        {problems.length > 0 && <span className="text-sm text-warn flex-1">{problems[0]}</span>}
        {problems.length === 0 && <span className="text-sm text-stone flex-1">Saving publishes to the website.</span>}
        {!isNewProduct && (
          <AdminButton type="button" variant="danger" disabled={saving} onClick={() => onDelete(p)}>
            Delete
          </AdminButton>
        )}
        <AdminButton type="button" disabled={saving || preparing || problems.length > 0} onClick={() => onSave(p, photos)}>
          {saving ? 'Saving…' : isNewProduct ? 'Launch product' : 'Save changes'}
        </AdminButton>
      </div>
    </div>
  )
}

// ═══ Settings ══════════════════════════════════════════════════
function SettingsPanel({ settings, saving, onSave }: { settings: Record<string, unknown>; saving: boolean; onSave: (s: Record<string, unknown>) => void }) {
  const [wa, setWa] = useState(String(settings.whatsapp_number ?? ''))
  const [days, setDays] = useState(Number(settings.new_arrival_days) || DEFAULT_NEW_ARRIVAL_DAYS)
  const [announcement, setAnnouncement] = useState(String(settings.announcement ?? ''))
  const waDigits = wa.replace(/\D/g, '').replace(/^0(?=3)/, '92')

  return (
    <Panel title="Shop settings">
      <div className="grid md:grid-cols-2 gap-5 max-w-3xl">
        <label className="block">
          <Label hint="Price questions and WhatsApp orders go to this number. Format: 923001234567 or 0300 1234567.">WhatsApp number</Label>
          <input value={wa} onChange={(e) => setWa(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <Label hint="How long a newly launched product stays in New Arrivals.">New Arrivals period (days)</Label>
          <input type="number" min={1} max={90} value={days} onChange={(e) => setDays(Math.min(90, Math.max(1, Number(e.target.value) || 1)))} className={inputCls} />
        </label>
        <label className="block md:col-span-2">
          <Label hint="The thin black bar at the very top of the website.">Announcement bar</Label>
          <input value={announcement} onChange={(e) => setAnnouncement(e.target.value)} className={inputCls} />
        </label>
      </div>
      <div className="mt-6 flex items-center gap-4">
        <AdminButton disabled={saving || !/^92\d{10}$/.test(waDigits)} onClick={() => onSave({ whatsapp_number: waDigits, new_arrival_days: days, announcement })}>
          {saving ? 'Saving…' : 'Save settings'}
        </AdminButton>
        {!/^92\d{10}$/.test(waDigits) && <span className="text-sm text-warn">Enter a Pakistani mobile number, e.g. 0300 1234567.</span>}
      </div>
    </Panel>
  )
}

// ═══ Shell ═════════════════════════════════════════════════════
export default function Studio() {
  const [token, setToken] = useState(readToken)
  const [catalogue, setCatalogue] = useState<CatalogueFile | null>(null)
  const [loadError, setLoadError] = useState('')
  const [view, setView] = useState<{ kind: 'list' } | { kind: 'edit'; id: string } | { kind: 'new' } | { kind: 'settings' }>({ kind: 'list' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null)
  const { watch, state } = usePublishWatcher(token)

  const signOut = useCallback(() => {
    writeToken('')
    setToken('')
    setCatalogue(null)
  }, [])

  useEffect(() => {
    if (!token) return
    readCatalogue(token)
      .then(({ catalogue }) => setCatalogue(catalogue))
      .catch((err) => {
        if (err instanceof GitHubError && err.status === 401) signOut()
        setLoadError(errText(err))
      })
  }, [token, signOut])

  useEffect(() => {
    document.title = 'Owner dashboard · SULTANÉ'
  }, [])

  const rows = useMemo(() => (catalogue ? rowsOf(catalogue) : []), [catalogue])
  const collections = useMemo(() => (catalogue?.collections ?? []).map((c) => ({ slug: String(c.slug), name: String(c.name) })), [catalogue])
  const days = Number(catalogue?.settings.new_arrival_days) || DEFAULT_NEW_ARRIVAL_DAYS

  const save = async (message: string, update: (c: CatalogueFile) => CatalogueFile, files: NewFile[] = [], after?: () => void) => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await saveCatalogue(token, message, (c) => withDerived(update(c)), files)
      setCatalogue(res.catalogue)
      watch(res.commit)
      after?.()
    } catch (err) {
      if (err instanceof GitHubError && err.status === 401) signOut()
      setMessage({ tone: 'bad', text: errText(err) })
    } finally {
      setSaving(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const saveProduct = (row: ProductRow, photos: EditPhoto[], isNewProduct: boolean) => {
    const files: NewFile[] = photos.flatMap((ph) =>
      ph.kind === 'new'
        ? [
            { path: `${PHOTO_DIR}/${ph.photo.name}`, base64: ph.photo.large },
            { path: `${PHOTO_DIR}/sm/${ph.photo.name}`, base64: ph.photo.small },
          ]
        : [],
    )
    const images: PhotoRow[] = photos.map((ph, i) =>
      ph.kind === 'saved' ? { ...ph.row, position: i } : { id: `${row.id.slice(0, 8)}-${ph.photo.name}`, url: `/products/${ph.photo.name}`, position: i },
    )
    const name = row.name.trim()
    save(
      `${isNewProduct ? 'Launch' : 'Update'} ${name}`,
      (latest) => {
        const all = rowsOf(latest)
        const existing = all.find((r) => r.id === row.id)
        const next: ProductRow = {
          ...row,
          name,
          description: row.description.trim(),
          images,
          // A new product gets its SKU and web address when it is first saved;
          // existing products keep theirs so shared links keep working.
          sku: existing?.sku || row.sku || nextSku(row.category, row.is_mens, all),
          slug: existing?.slug || uniqueSlug(name, all, row.id),
        }
        const products = existing ? all.map((r) => (r.id === row.id ? next : r)) : [next, ...all]
        return { ...latest, products: products as unknown as CatalogueFile['products'] }
      },
      files,
      () => {
        setMessage({ tone: 'good', text: `${name} ${isNewProduct ? 'launched' : 'saved'}.` })
        setView({ kind: 'edit', id: row.id })
      },
    )
  }

  const deleteProduct = (row: ProductRow) => {
    if (!window.confirm(`Delete "${row.name}" from the website? This cannot be undone here (set it to Hidden instead to keep it).`)) return
    save(`Delete ${row.name}`, (latest) => ({ ...latest, products: rowsOf(latest).filter((r) => r.id !== row.id) as unknown as CatalogueFile['products'] }), [], () => {
      setMessage({ tone: 'good', text: `${row.name} deleted.` })
      setView({ kind: 'list' })
    })
  }

  if (!token) return <SignIn onSignedIn={setToken} />

  const editing = view.kind === 'edit' ? rows.find((r) => r.id === view.id) : undefined

  return (
    <div className="min-h-screen bg-cream-dark">
      <header className="bg-noir text-cream">
        <div className="mx-auto max-w-[1200px] px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Wordmark className="text-xl text-cream" />
            <span className="hidden sm:inline text-[11px] uppercase tracking-[0.16em] text-silver">Owner dashboard</span>
          </div>
          <div className="flex items-center gap-5 text-[12px] uppercase tracking-[0.12em]">
            <button onClick={() => setView({ kind: 'list' })} className={view.kind === 'list' || view.kind === 'edit' ? 'text-rose-light' : 'hover:text-rose-light'}>Products</button>
            <button onClick={() => setView({ kind: 'new' })} className={view.kind === 'new' ? 'text-rose-light' : 'hover:text-rose-light'}>Launch</button>
            <button onClick={() => setView({ kind: 'settings' })} className={view.kind === 'settings' ? 'text-rose-light' : 'hover:text-rose-light'}>Settings</button>
            <Link to="/" className="hidden sm:inline hover:text-rose-light">Shop</Link>
            <button onClick={signOut} aria-label="Sign out" title="Sign out" className="hover:text-rose-light"><LogOut size={16} /></button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-5 sm:px-8 py-8">
        <PublishBanner state={state} />
        {message && <Notice tone={message.tone} onClose={() => setMessage(null)}>{message.text}</Notice>}
        {loadError && !catalogue && <Notice tone="bad">{loadError}</Notice>}
        {!catalogue ? (
          !loadError && <p className="py-16 text-center text-stone">Loading catalogue from {REPO} ({BRANCH})…</p>
        ) : view.kind === 'settings' ? (
          <SettingsPanel
            settings={catalogue.settings}
            saving={saving}
            onSave={(s) => save('Update shop settings', (latest) => ({ ...latest, settings: { ...latest.settings, ...s } }), [], () => setMessage({ tone: 'good', text: 'Settings saved.' }))}
          />
        ) : view.kind === 'new' ? (
          <ProductEditor key="new" initial={blankProduct()} isNewProduct rows={rows} collections={collections} days={days} saving={saving} onSave={(r, ph) => saveProduct(r, ph, true)} onDelete={() => undefined} onBack={() => setView({ kind: 'list' })} />
        ) : editing ? (
          <ProductEditor key={editing.id + editing.images.length + editing.slug} initial={editing} isNewProduct={false} rows={rows} collections={collections} days={days} saving={saving} onSave={(r, ph) => saveProduct(r, ph, false)} onDelete={deleteProduct} onBack={() => setView({ kind: 'list' })} />
        ) : (
          <ProductList rows={rows} days={days} onEdit={(id) => setView({ kind: 'edit', id })} onNew={() => setView({ kind: 'new' })} />
        )}
      </main>
    </div>
  )
}
