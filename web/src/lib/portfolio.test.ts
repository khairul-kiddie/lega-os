import { expect, it } from 'vitest'
import { parseDemand } from './portfolio'

it('parses demand the way people type it', () => {
  expect(parseDemand('1800')).toBe(1800)
  expect(parseDemand('1,800')).toBe(1800)
  expect(parseDemand(' 1 800 ')).toBe(1800)
  expect(parseDemand('2.5')).toBe(2.5)
  expect(parseDemand('')).toBeNaN()
  expect(parseDemand('abc')).toBeNaN()
  expect(parseDemand('-5')).toBe(-5)
})
