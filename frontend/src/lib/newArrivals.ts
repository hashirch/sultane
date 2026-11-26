import type { Product } from '../data/types'

export const DEFAULT_NEW_ARRIVAL_DAYS = 14

/** Whole days since a YYYY-MM-DD launch date (0 on the launch day itself). */
function daysSince(date: string, now: Date) {
  const [y, m, d] = date.split('-').map(Number)
  const launched = new Date(y, m - 1, d)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((today.getTime() - launched.getTime()) / 86_400_000)
}

/** Launched within the last `days` days — not in the future, not older. */
export function isNewArrival(p: Product, days = DEFAULT_NEW_ARRIVAL_DAYS, now = new Date()) {
  if (!p.launchedAt || p.status === 'draft') return false
  const age = daysSince(p.launchedAt, now)
  return age >= 0 && age < days
}

/** Newest first. */
export function newArrivals(products: Product[], days = DEFAULT_NEW_ARRIVAL_DAYS, now = new Date()) {
  return products.filter((p) => isNewArrival(p, days, now)).sort((a, b) => (b.launchedAt ?? '').localeCompare(a.launchedAt ?? ''))
}
