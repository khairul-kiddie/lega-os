import { useEffect, useState } from 'react'

export type ScorePart = 'yield' | 'shading' | 'condition' | 'likelihood'

export interface Roof {
  id: string
  /** Display name, e.g. "House 01370" or "Factory 00200". */
  label: string
  score: number
  parts: Record<ScorePart, number>
  area_m2: number
  kwp: number
  yield_kwh_kwp: number
  mwh_yr: number
  owner: string
  roof_age_yrs: number
  lease_years_left: number
  why: string[]
  headline: string
  aspect: string
  usable_m2: number
  shade_loss_pct: number
}

export interface YieldData {
  source: string
  annual_kwh_per_kwp: number
  annual_by_year: Record<string, number>
  sanity: { range: [number, number]; ok: boolean }
  monthly: { month: string; kwh_per_kwp: number; p10_kwh_per_kwp: number; daily_mean: number }[]
  hourly_shape: Record<string, number>
}

const cache = new Map<string, Promise<unknown>>()

export function loadJson<T>(name: string): Promise<T> {
  if (!cache.has(name)) {
    cache.set(
      name,
      fetch(`./data/${name}`).then((r) => {
        if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`)
        return r.json()
      }),
    )
  }
  return cache.get(name) as Promise<T>
}

export function useJson<T>(name: string): { data: T | null; error: string | null } {
  const [state, setState] = useState<{ data: T | null; error: string | null }>({ data: null, error: null })
  useEffect(() => {
    let live = true
    loadJson<T>(name).then(
      (data) => live && setState({ data, error: null }),
      (e: Error) => live && setState({ data: null, error: e.message }),
    )
    return () => {
      live = false
    }
  }, [name])
  return state
}

/** Round axis maximum up to a 1 / 2 / 5 × 10^n step and return evenly spaced ticks. */
export function niceTicks(maxValue: number, count = 4): number[] {
  const raw = maxValue / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  return Array.from({ length: Math.ceil(maxValue / step) + 1 }, (_, i) => +(i * step).toFixed(6))
}

export const fmt = (n: number, digits = 0) =>
  n.toLocaleString('en-MY', { minimumFractionDigits: digits, maximumFractionDigits: digits })
