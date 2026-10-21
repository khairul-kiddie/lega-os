import { describe, expect, it } from 'vitest'
import cases from '../../../shared/formula_cases.json'
import * as f from './formulas'

describe('portfolio sizing (shared cases)', () => {
  it.each(cases.sizing)('demand $demand/$unit share $share', (c) => {
    expect(f.needYr(c.demand, c.unit as f.Unit)).toBeCloseTo(c.need_yr)
    const sn = f.solarNeed(c.demand, c.unit as f.Unit, c.share)
    expect(sn).toBeCloseTo(c.solar_need)
    const base = f.roofsBase(sn, c.avg_mwh_per_roof)
    expect(base).toBe(c.roofs_base)
    expect(f.roofsNeeded(base, c.buffer)).toBe(c.roofs_needed)
  })
})

describe('dropout stress test', () => {
  it.each(cases.cover)('roofs $roofs', (c) => {
    const covers = f.monthCover(c.roofs, c.avg_mwh_per_roof, c.monthly_share, c.solar_need)
    expect(covers).toHaveLength(12)
    expect(Math.min(...covers)).toBeCloseTo(c.min_cover, 3)
    expect(f.dropoutCover(covers)).toBeCloseTo(c.dropout_cover, 3)
  })
})

it.each(cases.enough)('enough roofs %#', (c) => {
  expect(f.enoughRoofs(c.good, c.needed)).toBe(c.expected)
})

it.each(cases.p90)('p90 coverage %#', (c) => {
  expect(f.p90Coverage(c.actual, c.p90)).toBeCloseTo(c.expected)
})
