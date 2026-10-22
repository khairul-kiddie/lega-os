import { loadJson } from './data'
import type { Roof, ScorePart } from './data'
import { createStore } from './store'

export type RoofClass = 'house' | 'terrace' | 'medium' | 'large'

export interface TownshipSummary {
  buildings_detected: number
  solar_ready: number
  good_roofs: number
  avg_mwh_good: number
  mwh_yr: number
  kwp: number
  avg_score: number
  by_class: Record<RoofClass, number>
  yield_kwh_kwp: number
  owners_for_1gwh: number | null
}

export interface TownshipMeta {
  id: string
  name: string
  state: string
  /** [south, north, west, east] */
  bbox: [number, number, number, number]
  extent: 'osm' | 'approx'
  master_plan: string | null
  /** Township this site belongs to on the Roof map (Elmina Business Park → City of Elmina). */
  parent?: string | null
  /** Label in the Business park | Homes toggle. */
  site?: string | null
  summary: TownshipSummary
}

export interface TownshipIndex {
  sample: true
  source: string
  list_note: string
  min_kwp: number
  townships: TownshipMeta[]
}

/** Columnar file as written by pipeline/lega/townships.py. */
interface TownshipFile {
  origin: [number, number]
  kx: number
  ky: number
  weights: ScorePart[]
  class_label: Record<RoofClass, string>
  id: string[]
  cls: RoofClass[]
  poly: number[][]
  area: number[]
  kwp: number[]
  mwh: number[]
  score: number[]
  parts: number[][]
  units: number[]
  spec: number[]
  shade: number[]
  age: number[]
  lease: number[]
  owner: string[]
  headline: string[]
  why: string[][]
  cx: number[]
  cy: number[]
}

/** One detected roof, shaped like the master-plan Roof so panels and leasing can share it. */
export interface SatRoof extends Roof {
  cls: RoofClass
  units: number
  /** [lat, lng] ring */
  ring: [number, number][]
  center: [number, number]
  township: string
}

export const CLASS_SHORT: Record<RoofClass, string> = { house: 'House', terrace: 'Terrace row', medium: 'Mid-size', large: 'Factory' }
export const isHome = (c: RoofClass) => c === 'house' || c === 'terrace'

export const loadIndex = () => loadJson<TownshipIndex>('townships/index.json')

const decoded = new Map<string, Promise<SatRoof[]>>()

export function loadRoofs(id: string): Promise<SatRoof[]> {
  if (!decoded.has(id)) {
    decoded.set(
      id,
      loadJson<TownshipFile>(`townships/${id}.json`).then((f) => {
        const [ox, oy] = f.origin
        return f.id.map((rid, i) => {
          const p = f.poly[i]
          const ring: [number, number][] = []
          for (let k = 0; k < p.length; k += 2) ring.push([oy + p[k + 1] / 10 / f.ky, ox + p[k] / 10 / f.kx])
          const parts = Object.fromEntries(f.weights.map((w, k) => [w, f.parts[i][k]])) as Record<ScorePart, number>
          const cls = f.cls[i]
          return {
            id: rid,
            label: `${CLASS_SHORT[cls]} ${rid.slice(rid.lastIndexOf('-') + 1)}`,
            row: 0,
            col: 0,
            score: f.score[i],
            parts,
            area_m2: f.area[i],
            kwp: f.kwp[i],
            yield_kwh_kwp: f.spec[i],
            mwh_yr: f.mwh[i],
            owner: f.owner[i],
            roof_age_yrs: f.age[i],
            lease_years_left: f.lease[i],
            why: f.why[i],
            headline: f.headline[i],
            aspect: cls === 'large' || cls === 'medium' ? 'Flat roof' : 'Pitched roof',
            usable_m2: Math.round(f.kwp[i] * 6.5),
            shade_loss_pct: f.shade[i],
            cls,
            units: f.units[i],
            ring,
            center: [f.cy[i], f.cx[i]],
            township: id,
          }
        })
      }),
    )
  }
  return decoded.get(id)!
}

/** A township on the Roof map: one pin, one or more scanned sites (homes, business park). */
export interface TownshipGroup {
  id: string
  name: string
  state: string
  /** pin position [lat, lng] */
  center: [number, number]
  sites: TownshipMeta[]
  buildings: number
  solarReady: number
  good: number
  mwh: number
}

export function townshipGroups(index: TownshipIndex): TownshipGroup[] {
  return index.townships
    .filter((t) => !t.parent)
    .map((t) => {
      const sites = [t, ...index.townships.filter((x) => x.parent === t.id)]
      const sum = (f: (m: TownshipMeta) => number) => sites.reduce((a, m) => a + f(m), 0)
      const [s, n, w, e] = t.bbox
      return {
        id: t.id, name: t.name, state: t.state, center: [(s + n) / 2, (w + e) / 2], sites,
        buildings: sum((m) => m.summary.buildings_detected), solarReady: sum((m) => m.summary.solar_ready),
        good: sum((m) => m.summary.good_roofs), mwh: sum((m) => m.summary.mwh_yr),
      }
    })
}

/** Townships this browser has scanned. Two are pre-scanned so the map is never empty on first load. */
export const scannedStore = createStore<string[]>('lega.scanned.v1', ['elmina', 'elmina-bp'])

export const markScanned = (...ids: string[]) => scannedStore.set((s) => [...s, ...ids.filter((id) => !s.includes(id))])
export const groupScanned = (g: TownshipGroup, scanned: string[]) => g.sites.every((m) => scanned.includes(m.id))
