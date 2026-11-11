import { describe, expect, it } from 'vitest'
import cases from '../../../shared/planner_cases.json'
import * as p from './planner'

describe('community planner (shared cases with pipeline/lega/planner.py)', () => {
  it.each(cases.assets)('$type / $input.goal', (c) => {
    const r = p.planAsset(c.input as p.AssetInput, { kw: c.kw, emergency_kw: c.emergency_kw }, cases.solar_shape, c.specific_yield, c.wettest_week_day)
    for (const [k, v] of Object.entries(c.expected)) {
      const got = r[k as keyof p.AssetPlan]
      if (typeof v === 'number') expect(got as number).toBeCloseTo(v, 3)
      else expect(got).toBe(v)
    }
  })
  it.each(cases.priority)('priority $criticality', (c) => {
    expect(p.priority(c.criticality as p.Criticality, c.people, c.flood_zone, c.bill_rm_yr)).toBe(c.expected)
  })
  it('funding', () => {
    for (const c of cases.funding) expect(p.fundingMwh(c.battery_kwh, c.battery_rm_kwh)).toBeCloseTo(c.expected, 6)
  })
  it('battery = max(night, critical × hours) / (0.9 × 0.95)', () => {
    expect(p.batteryKwh(30, 4, 48)).toBeCloseTo(192 / 0.855)
  })
})
