import { useEffect, useState } from 'react'

export type ZoneType = 'f' | 'm' | 'c' | 'h' | 'a'
export type SiteKey = 'business_park' | 'homes'
export type ScorePart = 'yield' | 'shading' | 'condition' | 'likelihood'

export interface Roof {
  id: string
  /** Display name: "i41-B10" for factories, "Lot 107" for homes. */
  label: string
  row: number
  col: number
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

export interface ZoneSummary {
  n_roofs: number
  avg_score: number
  good_roofs: number
  total_kwp: number
  mwh_yr: number
  avg_mwh_per_roof: number
}

export interface Zone {
  id: string
  type: ZoneType
  rows: number
  cols: number
  x1: number
  y1: number
  x2: number
  y2: number
  target_score: number
  summary: ZoneSummary
  roofs: Roof[]
}

export interface Site {
  image: string | null
  frame: { w: number; h: number }
  zones: Zone[]
}

export interface RoofsData {
  sample: true
  weights: Record<ScorePart, number>
  site_yield_kwh_kwp: number
  type_label: Record<ZoneType, string>
  sites: Record<SiteKey, Site>
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

export const TYPE_PLURAL: Record<ZoneType, string> = {
  f: 'Ready-built factories',
  m: 'Medium industrial lots',
  c: 'Commercial',
  h: 'Terrace homes',
  a: 'Apartment blocks',
}

export const SITE_LABEL: Record<SiteKey, string> = { business_park: 'Business park', homes: 'Homes' }

export const scoreBand = (s: number) => (s >= 75 ? 'good' : s >= 55 ? 'fair' : 'poor')

/** Round axis maximum up to a 1 / 2 / 5 × 10^n step and return evenly spaced ticks. */
export function niceTicks(maxValue: number, count = 4): number[] {
  const raw = maxValue / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  return Array.from({ length: Math.ceil(maxValue / step) + 1 }, (_, i) => +(i * step).toFixed(6))
}

/** Greedy: how many top-scoring roofs to reach a target MWh/yr. */
export function ownersFor(roofs: Roof[], targetMwh: number): number | null {
  const sorted = [...roofs].sort((a, b) => b.score - a.score)
  let sum = 0
  for (let i = 0; i < sorted.length; i++) {
    sum += sorted[i].mwh_yr
    if (sum >= targetMwh) return i + 1
  }
  return null
}

export const fmt = (n: number, digits = 0) =>
  n.toLocaleString('en-MY', { minimumFractionDigits: digits, maximumFractionDigits: digits })
