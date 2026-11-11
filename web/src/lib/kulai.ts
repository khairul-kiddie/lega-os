// Design-stage solar planning for a township that doesn't exist yet (Kulai). Sample layout,
// real orientation lookup (NASA POWER hourly + pvlib Perez, see pipeline/lega/kulai_orientation.py).

export type HouseType = 'terrace' | 'terrace_hip' | 'semid' | 'shophouse'
export type RoofForm = 'gable' | 'hip' | 'flat' | 'mono'

export interface Lookup {
  site: { name: string; lat: number; lon: number }
  method: string
  ghi_kwh_m2_yr: number
  diffuse_share: number
  tilts: number[]
  azimuths: number[]
  kwh_kwp: number[][]
  best: number
  azimuth_spread_pct_at_20: number
  flat_kwh_kwp: number
}

export interface Plot {
  id: string
  phase: number
  type: HouseType
  x: number
  y: number
  w: number
  d: number
  footprint_m2: number
  shade: { loss: number; side: 'east' | 'west' }[]
}

export interface CommunityPlot {
  id: string
  type: 'school' | 'hall' | 'surau' | 'battery'
  name: string
  phase: number
  x: number
  y: number
  w: number
  d: number
  footprint_m2: number
  flood_zone: boolean
}

export interface Layout {
  sample: boolean
  note: string
  site: { w: number; h: number; flood_y: number; acres: number; first_phase: number; name: string }
  house_types: Record<HouseType, { label: string; roof: RoofForm; pitch: number; usable: number; height: number; use_kwh: number }>
  roof_forms: Record<RoofForm, { usable: number; faces: number[] }>
  phases: { id: number; name: string; x: [number, number] }[]
  community: CommunityPlot[]
  kwp_per_m2: number
  retrofit_rm_per_home: number
  grid_t_co2_per_mwh: number
  plots: Plot[]
}

export interface Settings {
  rotation: number
  forms: Record<HouseType, RoofForm>
  /** pitch for pitched roofs; null = each house type's default */
  pitch: number | null
  solarReady: boolean
  avoidWestShops: boolean
  noShade?: boolean
}

export const FLAT_TILT = 5
export const PANEL_W = 550

/** Bilinear interpolation in the tilt × azimuth table; azimuth wraps around 360°. */
export function lookupYield(t: Pick<Lookup, 'tilts' | 'azimuths' | 'kwh_kwp'>, tilt: number, az: number): number {
  const tl = t.tilts
  const tc = Math.min(Math.max(tilt, tl[0]), tl[tl.length - 1])
  let i = tl.findIndex((v, k) => k < tl.length - 1 && tc >= v && tc <= tl[k + 1])
  if (i < 0) i = tl.length - 2
  const ft = (tc - tl[i]) / (tl[i + 1] - tl[i])
  const step = t.azimuths[1] - t.azimuths[0]
  const a = ((az % 360) + 360) % 360
  const j = Math.floor(a / step) % t.azimuths.length
  const j2 = (j + 1) % t.azimuths.length
  const fa = (a - t.azimuths[j]) / step
  const row = (r: number) => t.kwh_kwp[r][j] * (1 - fa) + t.kwh_kwp[r][j2] * fa
  return row(i) * (1 - ft) + row(i + 1) * ft
}

export function roofOf(l: Layout, s: Settings, type: HouseType) {
  const form = s.forms[type]
  const tilt = form === 'flat' ? FLAT_TILT : s.pitch ?? (l.house_types[type].roof === 'flat' ? 22 : l.house_types[type].pitch)
  return { form, tilt, usable: l.roof_forms[form].usable, faces: l.roof_forms[form].faces }
}

export interface PlotResult {
  /** yield after shading as a share of the best roof in the lookup (0..1) */
  efficiency: number
  kwp: number
  yieldKwhKwp: number
  loss: number
  kwh: number
  neutral: boolean
}

export function plotResult(p: Plot, l: Layout, lk: Lookup, s: Settings): PlotResult {
  const r = roofOf(l, s, p.type)
  const yieldKwhKwp = r.faces.reduce((a, f) => a + lookupYield(lk, r.tilt, f + s.rotation), 0) / r.faces.length
  const kwp = p.footprint_m2 * r.usable * l.kwp_per_m2
  const loss = s.noShade ? 0 : Math.min(0.3, p.shade.filter((x) => !(s.avoidWestShops && x.side === 'west')).reduce((a, x) => a + x.loss, 0))
  const kwh = kwp * yieldKwhKwp * (1 - loss)
  return { efficiency: (yieldKwhKwp * (1 - loss)) / lk.best, kwp, yieldKwhKwp, loss, kwh, neutral: kwh >= l.house_types[p.type].use_kwh }
}

export interface Totals {
  homes: number
  kwh: number
  kwp: number
  neutral: number
  panels: number
}

export function totals(plots: Plot[], l: Layout, lk: Lookup, s: Settings): Totals {
  return plots.reduce(
    (t, p) => {
      const r = plotResult(p, l, lk, s)
      return { homes: t.homes + 1, kwh: t.kwh + r.kwh, kwp: t.kwp + r.kwp, neutral: t.neutral + Number(r.neutral), panels: t.panels + Math.floor((r.kwp * 1000) / PANEL_W) }
    },
    { homes: 0, kwh: 0, kwp: 0, neutral: 0, panels: 0 },
  )
}

/** "What actually moves the needle": % change in township energy from each design lever. */
export function needle(l: Layout, lk: Lookup, s: Settings) {
  const kwh = (o: Partial<Settings>) => totals(l.plots, l, lk, { ...s, ...o }).kwh
  const rot = [0, 15, 30, 45, 60, 75, 90].map((r) => kwh({ rotation: r }))
  const hip = kwh({ forms: { ...s.forms, terrace: 'hip', terrace_hip: 'hip', semid: 'hip' } })
  const gable = kwh({ forms: { ...s.forms, terrace: 'gable', terrace_hip: 'gable', semid: 'gable' } })
  const p30 = kwh({ pitch: 30 })
  const p15 = kwh({ pitch: 15 })
  const shaded = kwh({ avoidWestShops: false, noShade: false })
  const clear = kwh({ noShade: true })
  return [
    { id: 'rotation', label: 'Rotate the street grid 0–90°', pct: ((Math.max(...rot) - Math.min(...rot)) / Math.min(...rot)) * 100 },
    { id: 'roof', label: 'Hip roofs → gable roofs', pct: ((gable - hip) / hip) * 100 },
    { id: 'pitch', label: 'Roof pitch 30° → 15°', pct: ((p15 - p30) / p30) * 100 },
    { id: 'shade', label: 'Remove shading conflicts', pct: ((clear - shaded) / shaded) * 100 },
  ]
}

export const DEFAULT_SETTINGS = (l: Layout): Settings => ({
  rotation: 0,
  forms: Object.fromEntries(Object.entries(l.house_types).map(([k, v]) => [k, v.roof])) as Record<HouseType, RoofForm>,
  pitch: null,
  solarReady: false,
  avoidWestShops: false,
})
