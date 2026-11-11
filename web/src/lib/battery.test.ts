import { expect, it } from 'vitest'
import data from '../../../shared/battery_cases.json'
import { dispatch, hoursUntilDark, RESERVE } from './battery'

it.each(data.cases)('dispatch matches the pipeline: $name', (c) => {
  const r = dispatch(c.pv, c.load, c.crit, c.cap, c.rain, c.start_soc, c.outage_from)
  for (const [k, v] of Object.entries(c.expected)) {
    const got = r[k as keyof typeof r] as (number | boolean)[]
    v.forEach((x, i) => (typeof x === 'number' ? expect(got[i] as number).toBeCloseTo(x, 6) : expect(got[i]).toBe(x)))
  }
})

it('storm raises the reserve to 100% within 24 h of heavy rain', () => {
  const c = data.cases.find((x) => x.name === 'storm')!
  const r = dispatch(c.pv, c.load, c.crit, c.cap, c.rain, 0.6)
  expect(r.reserve[20]).toBe(1)
  expect(r.reserve[10]).toBe(RESERVE)
  expect(r.soc[39]).toBeCloseTo(1)
})

it('an outage goes dark at the right hour', () => {
  const z = Array(48).fill(0)
  const load = Array(48).fill(2)
  const r = dispatch(z, load, load, 30, z, 0.6, 0)
  expect(r.dark.slice(0, 8).some(Boolean)).toBe(false)
  expect(r.dark[8]).toBe(true)
  expect(hoursUntilDark(z, load, 30, 0.6, z, 0)).toBe(8)
})
