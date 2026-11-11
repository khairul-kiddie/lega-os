// Community energy planner. Formulas mirror pipeline/lega/planner.py exactly;
// both are tested against shared/planner_cases.json.
import { loadJson } from './data'
import type { CommunityPlan, Facility } from './community'
import { createStore } from './store'

export type AssetType = 'school' | 'surau' | 'hall' | 'guardhouse' | 'clinic' | 'commercial'
export type Ownership = 'sdp' | 'handed' | 'private'
export type Criticality = 'critical' | 'essential' | 'standard'
export type Goal = 'bills' | 'outage' | 'both'

export const DOD = 0.9
export const EFF = 0.95
export const NIGHT_SOLAR = 0.05
export const PANEL_W = 550

export interface Profile {
  label: string
  note: string
  kw: number[]
  emergency_kw?: number[]
  typical_kwh: number
  people: number
  own_kwp: number
  criticality: Criticality
  ownership: Ownership
  month: number[]
}

export interface PlannerData {
  sample: boolean
  note: string
  solar_shape: number[]
  criticality: Record<Criticality, number>
  people_full: number
  bill_full_rm: number
  economics: {
    tariff_rm_kwh: number
    battery_rm_kwh: number
    second_life_rm_kwh: number
    solar_rm_kwp: number
    commercial_margin_rm_kwh: number
    payback_years: number
  }
  profiles: Record<AssetType, Profile>
  townships: Record<string, { p90_kwh_kwp_day: number; typical_kwh_kwp_day: number; specific_yield: number; years: number }>
}

export const loadPlannerData = () => loadJson<PlannerData>('load_profiles.json')

export const OWNERSHIP_INFO: Record<Ownership, { label: string; note: string }> = {
  sdp: { label: 'SDP-owned', note: 'SDP can own panels and batteries here' },
  handed: { label: 'Handed over', note: 'Owned by the council, state or a committee' },
  private: { label: 'Private', note: 'Privately owned building' },
}

export const CRITICALITY_INFO: Record<Criticality, { label: string; note: string }> = {
  critical: { label: 'Critical', note: 'Evacuation, safety, health' },
  essential: { label: 'Essential', note: 'Daily community service' },
  standard: { label: 'Standard', note: 'Nice to have' },
}

export const GOAL_INFO: Record<Goal, { label: string; note: string }> = {
  bills: { label: 'Cut the bills', note: 'Solar over a year ≥ what the building uses' },
  outage: { label: 'Stay on in an outage', note: 'A battery keeps the critical load running when TNB is down' },
  both: { label: 'Both', note: 'Bill-neutral, and stays on in an outage' },
}

// ---------------------------------------------------------------- formulas
export const scale = (kw: number[], annualKwh: number) => annualKwh / (kw.reduce((a, b) => a + b, 0) * 365)

export function nightKwhDay(kw: number[], solarShape: number[], annualKwh: number) {
  const s = scale(kw, annualKwh)
  return kw.reduce((a, v, h) => a + (solarShape[h] < NIGHT_SOLAR ? v * s : 0), 0)
}

export function criticalKw(kw: number[], annualKwh: number, emergencyKw?: number[] | null) {
  const s = scale(kw, annualKwh)
  const src = emergencyKw ?? kw
  return (src.reduce((a, b) => a + b, 0) / 24) * s
}

export const batteryKwh = (nightKwh: number, critKw: number, backupHours: number) => Math.max(nightKwh, critKw * backupHours) / (DOD * EFF)

export interface AssetInput {
  annual_kwh: number
  goal: Goal
  backup_hours: number
  own_roof_kwp: number
  /** average size of a leased good roof nearby */
  roof_kwp: number
}

export interface AssetPlan {
  kwp: number
  kwp_bill: number
  battery_kwh: number
  night_kwh_day: number
  critical_kw: number
  panels: number
  own_kwp: number
  leased_roofs: number
  bill_neutral: boolean
  wettest_week_ok: boolean
  wettest_week_hours: number
  backup_hours: number
  kwp_wettest: number
}

export function planAsset(a: AssetInput, prof: { kw: number[]; emergency_kw?: number[] | null }, solarShape: number[], specificYield: number, wettestWeekDay: number): AssetPlan {
  const { kw } = prof
  const annual = a.annual_kwh
  const outage = a.goal === 'outage' || a.goal === 'both'
  const night = nightKwhDay(kw, solarShape, annual)
  const crit = criticalKw(kw, annual, prof.emergency_kw)
  const kwpBill = annual / specificYield
  const kwpOutage = (crit * 24 * 365) / specificYield
  const kwp = Math.max(a.goal !== 'outage' ? kwpBill : 0, outage ? kwpOutage : 0)
  const batt = outage ? batteryKwh(night, crit, a.backup_hours) : 0
  const weekEnergy = kwp * wettestWeekDay * 7 + batt * DOD * EFF
  const weekNeed = crit * 24 * 7
  const own = Math.min(kwp, a.own_roof_kwp)
  const leased = kwp > own ? Math.ceil((kwp - own) / a.roof_kwp - 1e-9) : 0
  return {
    kwp,
    kwp_bill: kwpBill,
    battery_kwh: batt,
    night_kwh_day: night,
    critical_kw: crit,
    panels: Math.ceil((kwp * 1000) / PANEL_W - 1e-9),
    own_kwp: own,
    leased_roofs: leased,
    bill_neutral: kwp * specificYield >= annual - 1e-6,
    wettest_week_ok: !outage || weekEnergy >= weekNeed - 1e-6,
    wettest_week_hours: crit ? Math.min(168, weekEnergy / crit) : 168,
    backup_hours: crit ? (batt * DOD * EFF) / crit : 0,
    kwp_wettest: outage ? Math.max(kwp, (weekNeed - batt * DOD * EFF) / (wettestWeekDay * 7)) : kwp,
  }
}

const CRIT_SCORE: Record<Criticality, number> = { critical: 100, essential: 60, standard: 20 }
export const PEOPLE_FULL = 1500
export const BILL_FULL_RM = 150_000

export const priority = (c: Criticality, people: number, floodZone: boolean, billRmYr: number) =>
  Math.round(0.4 * CRIT_SCORE[c] + 0.25 * Math.min(1, people / PEOPLE_FULL) * 100 + 0.2 * (floodZone ? 100 : 0) + 0.15 * Math.min(1, billRmYr / BILL_FULL_RM) * 100)

/** Commercial MWh a year whose margin pays the battery back within the payback period. */
export const fundingMwh = (battKwh: number, battRmKwh: number, marginRmKwh = 0.08, years = 10) => (battKwh * battRmKwh) / (marginRmKwh * 1000 * years)

// ---------------------------------------------------------------- assets
export interface Asset {
  id: string
  name: string
  type: Exclude<AssetType, 'commercial'>
  township: string
  annualKwh: number
  ownership: Ownership
  criticality: Criticality
  goal: Goal
  backupHours: number
  people: number
  floodZone: boolean
  ownRoofKwp: number
  /** OpenStreetMap facility id when imported from the township map */
  osm?: string
  status: 'Draft' | 'Plan ready' | 'Sent to leasing'
  createdAt: string
}

export const assetStore = createStore<Asset[] | null>('lega.assets.v1', null)

export function newAsset(type: Asset['type'], p: Profile, township = 'elmina'): Asset {
  return {
    id: `a-${Date.now().toString(36)}`,
    name: '',
    type,
    township,
    annualKwh: p.typical_kwh,
    ownership: p.ownership,
    criticality: p.criticality,
    goal: p.criticality === 'critical' ? 'both' : 'bills',
    backupHours: 48,
    people: p.people,
    floodZone: false,
    ownRoofKwp: p.own_kwp,
    status: 'Draft',
    createdAt: new Date().toISOString(),
  }
}

const TYPE_OF: Record<string, Asset['type']> = {
  university: 'school', school: 'school', rel_school: 'school', kindergarten: 'school', learning: 'school',
  masjid: 'surau', surau: 'surau', worship: 'surau', hall: 'hall', civic: 'hall', clinic: 'clinic', hospital: 'clinic',
}

/** Planner entries for a township's real OpenStreetMap facilities. Flood zones are sample flags. */
export function assetsFromFacilities(plan: CommunityPlan, data: PlannerData): Asset[] {
  const y = data.townships[plan.id]?.specific_yield ?? 1287
  return plan.facilities.map((f: Facility, i) => {
    const type = TYPE_OF[f.type] ?? 'hall'
    const p = data.profiles[type]
    return {
      ...newAsset(type, p, plan.id),
      id: `osm-${f.id}`,
      name: f.name,
      annualKwh: f.need_mwh * 1000,
      ownRoofKwp: Math.round((f.own_mwh * 1000) / y),
      people: type === 'school' && f.need_mwh < 50 ? 150 : p.people,
      floodZone: i % 4 === 1, // SAMPLE: replace with JPS flood maps
      osm: f.id,
      createdAt: new Date(Date.UTC(2026, 10, 1, 9, i)).toISOString(),
    }
  })
}

export interface AssetResult extends AssetPlan {
  priority: number
  billRmYr: number
  savedRmYr: number
  solarKwhYr: number
  fundingMwh: number
  batteryRm: number
}

export function evaluate(a: Asset, data: PlannerData, roofKwp: number, secondLife = false): AssetResult {
  const p = data.profiles[a.type]
  const t = data.townships[a.township] ?? data.townships.elmina
  const plan = planAsset(
    { annual_kwh: a.annualKwh, goal: a.goal, backup_hours: a.backupHours, own_roof_kwp: a.ownRoofKwp, roof_kwp: roofKwp },
    p, data.solar_shape, t.specific_yield, t.p90_kwh_kwp_day,
  )
  const e = data.economics
  const billRmYr = a.annualKwh * e.tariff_rm_kwh
  const solarKwhYr = plan.kwp * t.specific_yield
  const battRm = secondLife ? e.second_life_rm_kwh : e.battery_rm_kwh
  return {
    ...plan,
    priority: priority(a.criticality, a.people, a.floodZone, billRmYr),
    billRmYr,
    savedRmYr: Math.min(solarKwhYr, a.annualKwh) * e.tariff_rm_kwh,
    solarKwhYr,
    fundingMwh: fundingMwh(plan.battery_kwh, battRm, e.commercial_margin_rm_kwh, e.payback_years),
    batteryRm: plan.battery_kwh * battRm,
  }
}
