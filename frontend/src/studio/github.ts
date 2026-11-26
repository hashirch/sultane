// Owner dashboard storage for the static (GitHub Pages) site: the catalogue and
// product photos live in the GitHub repository, and every save is one commit.
// Pushing to the branch runs the Pages workflow, which republishes the site.

export const REPO = (import.meta.env.VITE_GITHUB_REPO as string | undefined) || 'hashirch/sultane'
export const BRANCH = (import.meta.env.VITE_GITHUB_BRANCH as string | undefined) || 'main'
export const CATALOGUE_PATH = 'frontend/src/data/catalogue.json'
export const PHOTO_DIR = 'frontend/public/products'

// VITE_GITHUB_API lets tests point the dashboard at a local stand-in for GitHub.
const API = (import.meta.env.VITE_GITHUB_API as string | undefined) || 'https://api.github.com'

export class GitHubError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function gh<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    })
  } catch {
    throw new GitHubError(0, 'Could not reach GitHub. Check your internet connection and try again.')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const msg =
      res.status === 401
        ? 'GitHub did not accept this access key. It may have expired — create a new one.'
        : res.status === 403 || res.status === 404
          ? `This access key cannot change ${REPO}. Give it "Contents: Read and write" access to that repository.`
          : body.message || `GitHub request failed (${res.status})`
    throw new GitHubError(res.status, msg)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

// ── base64 helpers (UTF-8 safe) ────────────────────────────────
export function utf8ToBase64(text: string) {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
function base64ToUtf8(b64: string) {
  const bin = atob(b64.replace(/\n/g, ''))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

/** Confirms the key works and can write to the repository. */
export async function verifyAccess(token: string) {
  const repo = await gh<{ full_name: string; permissions?: { push?: boolean } }>(token, `/repos/${REPO}`)
  if (repo.permissions && !repo.permissions.push) {
    throw new GitHubError(403, `This access key can read ${REPO} but not save changes. Give it "Contents: Read and write".`)
  }
  return repo.full_name
}

async function headSha(token: string) {
  const ref = await gh<{ object: { sha: string } }>(token, `/repos/${REPO}/git/ref/heads/${BRANCH}`)
  return ref.object.sha
}

export interface CatalogueFile {
  // Same shape as src/data/catalogue.json (rows as the API returns them).
  products: Record<string, unknown>[]
  collections: Record<string, unknown>[]
  gemstones: string[]
  settings: Record<string, unknown>
}

/** Reads the catalogue as it is right now on the branch (not the published copy). */
export async function readCatalogue(token: string): Promise<{ catalogue: CatalogueFile; head: string }> {
  const head = await headSha(token)
  // Blob API handles files over the 1 MB limit of the contents API.
  const commit = await gh<{ tree: { sha: string } }>(token, `/repos/${REPO}/git/commits/${head}`)
  const tree = await gh<{ tree: { path: string; sha: string }[] }>(token, `/repos/${REPO}/git/trees/${commit.tree.sha}?recursive=1`)
  const entry = tree.tree.find((t) => t.path === CATALOGUE_PATH)
  if (!entry) throw new GitHubError(404, `${CATALOGUE_PATH} was not found in ${REPO}.`)
  const blob = await gh<{ content: string }>(token, `/repos/${REPO}/git/blobs/${entry.sha}`)
  return { catalogue: JSON.parse(base64ToUtf8(blob.content)), head }
}

export interface NewFile {
  path: string
  /** base64 content */
  base64: string
}

/**
 * Commits `files` plus the catalogue produced by `update(latest)` in one commit.
 * `update` always runs on the newest catalogue on the branch, so a save never
 * overwrites changes made meanwhile from another device. Retries once if the
 * branch moved during the save.
 */
export async function saveCatalogue(
  token: string,
  message: string,
  update: (latest: CatalogueFile) => CatalogueFile,
  files: NewFile[] = [],
): Promise<{ commit: string; catalogue: CatalogueFile }> {
  // Upload photos once; their blob ids stay valid across a retry.
  const photoBlobs = await Promise.all(
    files.map(async (f) => ({
      path: f.path,
      sha: (await gh<{ sha: string }>(token, `/repos/${REPO}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: f.base64, encoding: 'base64' }) })).sha,
    })),
  )
  for (let attempt = 0; ; attempt++) {
    const { catalogue: latest, head } = await readCatalogue(token)
    const next = update(latest)
    const json = JSON.stringify(next, null, 1) + '\n'
    const catBlob = await gh<{ sha: string }>(token, `/repos/${REPO}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: utf8ToBase64(json), encoding: 'base64' }) })
    const parent = await gh<{ tree: { sha: string } }>(token, `/repos/${REPO}/git/commits/${head}`)
    const tree = await gh<{ sha: string }>(token, `/repos/${REPO}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({
        base_tree: parent.tree.sha,
        tree: [{ path: CATALOGUE_PATH, sha: catBlob.sha }, ...photoBlobs].map((t) => ({ path: t.path, sha: t.sha, mode: '100644', type: 'blob' })),
      }),
    })
    const commit = await gh<{ sha: string }>(token, `/repos/${REPO}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({ message: `${message}\n\nSaved from the SULTANÉ owner dashboard.`, tree: tree.sha, parents: [head] }),
    })
    try {
      await gh(token, `/repos/${REPO}/git/refs/heads/${BRANCH}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) })
      return { commit: commit.sha, catalogue: next }
    } catch (err) {
      // 422 = the branch moved since we read it; redo the update on top of it.
      if (err instanceof GitHubError && err.status === 422 && attempt === 0) continue
      throw err
    }
  }
}

export type PublishState = 'queued' | 'building' | 'live' | 'failed' | 'unknown'

/** Status of the Pages deploy for a commit (needs "Actions: Read"; otherwise 'unknown'). */
export async function publishState(token: string, commit: string): Promise<PublishState> {
  try {
    const runs = await gh<{ workflow_runs: { status: string; conclusion: string | null }[] }>(token, `/repos/${REPO}/actions/runs?head_sha=${commit}&per_page=5`)
    const run = runs.workflow_runs[0]
    if (!run) return 'queued'
    if (run.status !== 'completed') return run.status === 'queued' ? 'queued' : 'building'
    return run.conclusion === 'success' ? 'live' : 'failed'
  } catch {
    return 'unknown'
  }
}
