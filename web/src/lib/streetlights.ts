// Street-light watch. Mirrors pipeline/lega/streetlights.py; both are tested against shared/streetlight_cases.json.
import { useEffect, useState } from 'react'
import { loadJson } from './data'

export const FULL_HOURS = 8
export const DIM_HOURS = 4
export const DIM_LEVEL = 0.5
export const CHARGE_EFF = 0.85
export const AT_RISK = 0.1
export const HORIZON = 7

export interface Lamp {
  id: string
  road: string
  lat: number
  lon: number
  led_w: number
  panel_wp: number
  battery_wh: number
  /** battery state of health, 0..1 */
  soh: number
  /** share of sun reaching the panel (trees) */
  shade: number
  /** charge now, share of usable capacity */
  charge: number
}

export interface Fleet {
  sample: boolean
  note: string
  precinct: string
  lamps: Lamp[]
}

export const nightWh = (ledW: number) => ledW * (FULL_HOURS + DIM_HOURS * DIM_LEVEL)

export function project(l: Pick<Lamp, 'led_w' | 'panel_wp' | 'battery_wh' | 'soh' | 'shade' | 'charge'>, kwhKwpDays: number[]) {
  const cap = l.battery_wh * l.soh
  let soc = l.charge * cap
  const need = nightWh(l.led_w)
  const morning: number[] = []
  let daysToDark: number | null = null
  kwhKwpDays.slice(0, HORIZON).forEach((k, i) => {
    soc = Math.max(0, Math.min(cap, soc + l.panel_wp * k * l.shade * CHARGE_EFF) - need)
    morning.push(soc / cap)
    if (daysToDark === null && soc < AT_RISK * cap) daysToDark = i + 1
  })
  return { morning, days_to_dark: daysToDark as number | null }
}

export type Risk = 'ok' | 'later' | 'soon'
export const riskOf = (d: number | null): Risk => (d === null ? 'ok' : d <= 3 ? 'soon' : 'later')

/** Why a lamp is at risk, in plain words. */
export function reason(l: Lamp, rainyDays: number) {
  const r: string[] = []
  if (l.shade < 1) r.push(`shaded by trees (${Math.round(l.shade * 100)}% sun)`)
  if (l.soh < 0.8) r.push(`battery ${Math.round(l.soh * 100)}% health`)
  if (l.charge < 0.6) r.push(`only ${Math.round(l.charge * 100)}% charged now`)
  if (rainyDays) r.push(`${rainyDays} rainy day${rainyDays > 1 ? 's' : ''} ahead`)
  const s = r.join(', ')
  return s ? s[0].toUpperCase() + s.slice(1) : 'Low charge'
}

interface Live { days: { date: string; rain_mm: number; kwh_kwp?: { p50: number; p90: number } }[] }

export function useLampsAtRisk(): number | null {
  const [n, setN] = useState<number | null>(null)
  useEffect(() => {
    Promise.all([loadJson<Fleet>('streetlights.json'), loadJson<Live>('forecast_live.json')])
      .then(([f, live]) => {
        const k = live.days.map((d) => d.kwh_kwp?.p90 ?? 0)
        setN(f.lamps.filter((l) => project(l, k).days_to_dark !== null).length)
      })
      .catch(() => setN(null))
  }, [])
  return n
}
