import { useEffect, useState } from 'react'
import type { Product } from '../data/types'
import { getProducts } from './api'
import { useSettings } from '../context/SettingsContext'
import { DEFAULT_NEW_ARRIVAL_DAYS, newArrivals } from './newArrivals'

let cache: Promise<Product[]> | null = null

/** Products launched within the owner's New Arrivals window (null while loading). */
export function useNewArrivals() {
  const { settings } = useSettings()
  const [all, setAll] = useState<Product[] | null>(null)

  useEffect(() => {
    cache ??= getProducts().catch(() => [])
    let alive = true
    cache.then((p) => alive && setAll(p))
    return () => {
      alive = false
    }
  }, [])

  const days = Number(settings.new_arrival_days) || DEFAULT_NEW_ARRIVAL_DAYS
  return { products: all === null ? null : newArrivals(all, days), days }
}
