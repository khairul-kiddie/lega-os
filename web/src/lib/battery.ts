// Battery controller dispatch. Mirrors pipeline/lega/battery.py; both are tested against shared/battery_cases.json.

export const RESERVE = 0.3
export const STORM_RESERVE = 1.0
export const STORM_MM_H = 10
export const STORM_LOOKAHEAD = 24
export const EFF = 0.95
export const SECOND_LIFE_SOH = 0.78

export interface Weather72 {
  time: string[]
  pv_kw_per_kwp: number[]
  rain_mm: number[]
  cloud_pct: number[]
}

export interface Site {
  id: string
  name: string
  type: 'hall' | 'surau' | 'guardhouse'
  kwp: number
  battery_kwh: number
  annual_kwh: number
  note: string
}

export interface BatteryData {
  sample: boolean
  status: 'live' | 'synthetic'
  generated_at: string
  source: string
  note: string
  rules: { reserve: number; storm_reserve: number; storm_mm_h: number; lookahead_h: number; eff: number; second_life_soh: number; start_soc: number }
  sites: Site[]
  live: Weather72
  drill: Weather72
}

/** Storm prep when heavy rain (> 10 mm/h) or a storm warning is forecast within the next 24 hours. */
export function stormFlags(rain: number[], storm?: boolean[]) {
  const n = rain.length
  return rain.map((_, h) => {
    for (let j = h; j < Math.min(n, h + STORM_LOOKAHEAD + 1); j++) if (rain[j] > STORM_MM_H || storm?.[j]) return true
    return false
  })
}

export interface Dispatch {
  soc: number[]
  imp: number[]
  exp: number[]
  dark: boolean[]
  reserve: number[]
  served: number[]
}

/** Hourly loop. pv/load/crit in kW (= kWh per hour). */
export function dispatch(pv: number[], load: number[], crit: number[], cap: number, rain: number[], startSoc = 0.6, outageFrom: number | null = null, storm?: boolean[]): Dispatch {
  const prep = stormFlags(rain, storm)
  let soc = startSoc * cap
  const out: Dispatch = { soc: [], imp: [], exp: [], dark: [], reserve: [], served: [] }
  for (let h = 0; h < pv.length; h++) {
    const outage = outageFrom !== null && h >= outageFrom
    const ld = outage ? crit[h] : load[h]
    const reserve = outage ? 0 : prep[h] ? STORM_RESERVE : RESERVE
    const direct = Math.min(pv[h], ld)
    const surplus = pv[h] - direct
    const deficit = ld - direct
    const charge = Math.min(surplus * EFF, cap - soc)
    soc += charge
    const exp = outage ? 0 : surplus - charge / EFF
    let imp = 0
    if (!outage && soc < reserve * cap) {
      const top = reserve * cap - soc
      soc += top
      imp += top / EFF
    }
    const avail = Math.max(0, soc - reserve * cap)
    const dis = Math.min(deficit / EFF, avail)
    soc -= dis
    const unmet = deficit - dis * EFF
    let dark = false
    if (unmet > 1e-9) {
      if (outage) dark = true
      else imp += unmet
    }
    out.soc.push(soc / cap)
    out.imp.push(imp)
    out.exp.push(Math.max(0, exp))
    out.dark.push(dark)
    out.reserve.push(reserve)
    out.served.push(ld - (dark ? unmet : 0))
  }
  return out
}

/** If the grid fails at `start`: hours the critical load stays on (null = to the end of the forecast). */
export function hoursUntilDark(pv: number[], crit: number[], cap: number, socNow: number, rain: number[], start = 0): number | null {
  const r = dispatch(pv, crit, crit, cap, rain, socNow, start)
  for (let h = start; h < pv.length; h++) if (r.dark[h]) return h - start
  return null
}
