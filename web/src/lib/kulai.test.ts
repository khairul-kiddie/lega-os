import { expect, it } from 'vitest'
import { lookupYield } from './kulai'

const t = { tilts: [0, 10], azimuths: [0, 90, 180, 270], kwh_kwp: [[1000, 1000, 1000, 1000], [900, 1000, 1100, 1000]] }

it('returns grid values exactly', () => {
  expect(lookupYield(t, 10, 180)).toBe(1100)
  expect(lookupYield(t, 0, 270)).toBe(1000)
})
it('interpolates tilt and azimuth bilinearly', () => {
  expect(lookupYield(t, 5, 180)).toBeCloseTo(1050)
  expect(lookupYield(t, 10, 135)).toBeCloseTo(1050)
  expect(lookupYield(t, 5, 135)).toBeCloseTo(1025)
})
it('wraps azimuth past 360° and clamps tilt', () => {
  expect(lookupYield(t, 10, 315)).toBeCloseTo(950)
  expect(lookupYield(t, 10, 360 + 180)).toBe(1100)
  expect(lookupYield(t, 40, 180)).toBe(1100)
})
