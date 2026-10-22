import { useSyncExternalStore } from 'react'
import type { Roof, Zone } from './data'
import type { SatRoof } from './townships'

// Tiny localStorage-backed stores. Every storage access is wrapped: private windows
// and blocked storage must not break the app — state then just lives in memory.

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable */
  }
}

export function createStore<T>(key: string, fallback: T) {
  let state = read(key, fallback)
  const subs = new Set<() => void>()
  return {
    get: () => state,
    set(next: T | ((prev: T) => T)) {
      state = typeof next === 'function' ? (next as (p: T) => T)(state) : next
      write(key, state)
      subs.forEach((f) => f())
    },
    subscribe(f: () => void) {
      subs.add(f)
      return () => subs.delete(f)
    },
  }
}

export function useStore<T>(store: ReturnType<typeof createStore<T>>): T {
  return useSyncExternalStore(store.subscribe, store.get)
}

export type LeaseStatus = 'to_approach' | 'visited' | 'interested' | 'signed' | 'declined'

export interface LeaseItem {
  roofId: string
  label: string
  /** "Precinct 2", "Zone i41" or a township name. */
  group: string
  site: string
  score: number
  mwh_yr: number
  headline: string
  status: LeaseStatus
  addedAt: string
  portfolioId?: string
}

export const groupName = (zone: Zone) => (zone.id.startsWith('Precinct') ? zone.id : `Zone ${zone.id}`)

export function leaseItem(roof: Roof, zone: Zone, site: string, portfolioId?: string, status: LeaseStatus = 'to_approach'): LeaseItem {
  return {
    roofId: roof.id, label: roof.label, group: groupName(zone), site, score: roof.score, mwh_yr: roof.mwh_yr,
    headline: roof.headline, status, addedAt: new Date().toISOString(), portfolioId,
  }
}

export function leaseItemSat(roof: SatRoof, townshipName: string, portfolioId?: string, status: LeaseStatus = 'to_approach'): LeaseItem {
  return {
    roofId: roof.id, label: roof.label, group: townshipName, site: roof.township, score: roof.score, mwh_yr: roof.mwh_yr,
    headline: roof.headline, status, addedAt: new Date().toISOString(), portfolioId,
  }
}

// v2: roof ids changed (unique lot numbers for homes)
export const leasingStore = createStore<LeaseItem[]>('lega.leasing.v4', [])
export const shortlistStore = createStore<string[]>('lega.shortlist.v3', [])
