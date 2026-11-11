import { expect, it } from 'vitest'
import data from '../../../shared/streetlight_cases.json'
import { nightWh, project } from './streetlights'

it.each(data.cases)('days to dark matches the pipeline %#', (c) => {
  const r = project(c.lamp, c.days)
  expect(r.days_to_dark).toBe(c.expected.days_to_dark)
  r.morning.forEach((m, i) => expect(m).toBeCloseTo(c.expected.morning[i], 6))
})

it('night use includes 4 dimmed hours', () => expect(nightWh(30)).toBe(300))
