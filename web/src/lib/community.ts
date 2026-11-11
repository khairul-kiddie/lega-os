// Community energy plan, as written by pipeline/lega/community.py.
import { loadJson } from './data'

export type FacilityStatus = 'self' | 'shared' | 'short'
export type FacilityGroup = 'Schools' | 'Places of worship' | 'Community halls' | 'Health' | 'Public services'
export const FACILITY_GROUPS: FacilityGroup[] = ['Schools', 'Places of worship', 'Community halls', 'Health', 'Public services']

export interface Facility {
  /** OpenStreetMap id, e.g. w123456 */
  id: string
  name: string
  type: string
  label: string
  group: FacilityGroup
  lat: number
  lon: number
  /** typical annual use, MWh (placeholder until SDP has bills or meters) */
  need_mwh: number
  /** share of the load in daylight; the rest runs through a battery */
  day_share: number
  own_roofs: string[]
  own_mwh: number
  shared_roofs: string[]
  shared_mwh: number
  kwp: number
  battery_kwh: number
  /** solar in the worst month ÷ need (≥ 1 = covered all year) */
  cover_worst_month: number
  status: FacilityStatus
  surplus_mwh: number
}

export interface LampGroup {
  id: string
  lat: number
  lon: number
  lamps: number
  park_lamps: number
  night_kwh: number
  kwp_need: number
  kwp: number
  roofs: string[]
  battery_kwh: number | null
  battery_usable_kwh: number | null
  /** nights that would have gone dark over 2015–2025 */
  dark_nights: number | null
  lowest_pct: number | null
  lowest_date: string | null
  /** nights a battery holding only one night would have gone dark */
  one_night_dark: number | null
  ok: boolean
}

export interface CommunitySummary {
  facilities: number
  self: number
  shared: number
  short: number
  by_group: Record<FacilityGroup, number>
  lamps: number
  lamps_mapped_osm: number
  lamp_groups: number
  lamp_groups_ok: number
  dark_nights: number
  road_km: number
  lamp_mwh_yr: number
  facility_mwh_yr: number
  community_mwh_yr: number
  co2_t_yr: number
  roofs_used: number
  good_roofs_reserved: number
  good_roofs: number
  surplus_mwh_yr: number
  surplus_co2_t_yr: number
  battery_kwh: number
  yield_kwh_kwp: number
  worst_month_share: number
  wettest_week: { start: string; end: string; kwh_kwp: number; typical_kwh_kwp: number }
  record: { start: string; end: string; days: number }
}

export interface CommunityPlan {
  id: string
  name: string
  summary: CommunitySummary
  facilities: Facility[]
  lamp_groups: LampGroup[]
  /** all lamp batteries together around their emptiest morning in the record */
  lowest_curve: { dates: string[]; pct: number[]; lowest_date: string; lowest_pct: number; sun_kwh_kwp: number[] } | null
}

export interface CommunityIndex {
  sample: true
  grid_t_co2_per_mwh: number
  co2_source: string
  facility_source: string
  loads: Record<string, { label: string; mwh: number; day: number }>
  lamp_roads: Record<string, { spacing_m: number; watts: number }>
  lamp_hours: number
  battery_eff: number
  battery_dod: number
  lamp_pv_oversize: number
  neighbour_m: number
  good_score: number
  townships: { id: string; name: string; summary: CommunitySummary }[]
}

export const loadCommunityIndex = () => loadJson<CommunityIndex>('community/index.json')
export const loadCommunity = (id: string) => loadJson<CommunityPlan>(`community/${id}.json`)

export const STATUS_INFO: Record<FacilityStatus, { label: string; cls: string; color: string }> = {
  self: { label: 'Own roof', cls: 'bg-primary text-white', color: '#2BD18A' },
  shared: { label: 'Shared roofs', cls: 'bg-primary/10 text-primary', color: '#8CC7B0' },
  short: { label: 'Not yet covered', cls: 'bg-[#F6E1D8] text-warn', color: '#E8643F' },
}

/** Roofs a community plan uses (own + shared + lamp feeders). */
export const communityRoofIds = (p: CommunityPlan) =>
  new Set([...p.facilities.flatMap((f) => [...f.own_roofs, ...f.shared_roofs]), ...p.lamp_groups.flatMap((g) => g.roofs)])

export const RESERVE = 0.2

export interface BatteryDay {
  date: string
  /** charge left the next morning, share of usable capacity (0..1) under each forecast */
  p90: number
  p50: number
  /** nights that would run short under P90 */
  short: boolean
}

/**
 * Replay the 14-day forecast through a lamp group's solar + battery.
 * Charge by day from kWh/kWp × kWp (losses in and out), lamps draw their nightly need.
 * Starts from `start` (share of usable capacity): there is no live battery telemetry yet.
 */
export function projectBattery(
  days: { date: string; kwh_kwp?: { p50: number; p90: number } }[],
  kwp: number,
  usableKwh: number,
  nightKwh: number,
  eff: number,
  start = 1,
): BatteryDay[] {
  const eta = Math.sqrt(eff)
  let a = start * usableKwh
  let b = start * usableKwh
  return days.map((d) => {
    const k = d.kwh_kwp ?? { p50: 0, p90: 0 }
    a = Math.min(usableKwh, a + kwp * k.p90 * eta) - nightKwh / eta
    b = Math.min(usableKwh, b + kwp * k.p50 * eta) - nightKwh / eta
    const short = a < 0
    a = Math.max(0, a)
    b = Math.max(0, b)
    return { date: d.date, p90: a / usableKwh, p50: b / usableKwh, short }
  })
}
