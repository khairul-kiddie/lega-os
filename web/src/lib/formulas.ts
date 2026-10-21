// Portfolio sizing formulas. Mirrors pipeline/lega/formulas.py exactly;
// both are tested against shared/formula_cases.json.

export type Unit = 'year' | 'month'
export type Pattern = 'office' | 'mall' | '24h'
export type Safety = 'lean' | 'balanced' | 'monsoon'

export const DROPOUT_RATE = 0.2
export const BUFFERS: Record<Safety, number> = { lean: 0, balanced: 0.15, monsoon: 0.25 }
// Placeholders from the brief; see README.
export const PATTERN_SHARE: Record<Pattern, number> = { office: 0.95, mall: 0.7, '24h': 0.45 }

export const needYr = (demand: number, unit: Unit) => demand * (unit === 'month' ? 12 : 1)

export const solarNeed = (demand: number, unit: Unit, patternShare: number) => needYr(demand, unit) * patternShare

export const roofsBase = (solarNeedMwh: number, avgMwhPerRoof: number) => Math.ceil(solarNeedMwh / avgMwhPerRoof)

export const roofsNeeded = (base: number, buffer: number) => Math.round(base * (1 + buffer))

/** supply[m] = roofs × avg annual MWh per roof × share of annual yield in month m. */
export function monthCover(roofs: number, avgMwhPerRoof: number, monthlyShare: number[], solarNeedMwh: number): number[] {
  const target = solarNeedMwh / 12
  return monthlyShare.map((s) => (roofs * avgMwhPerRoof * s) / target)
}

export const dropoutCover = (covers: number[], rate = DROPOUT_RATE) => Math.min(...covers) * (1 - rate)

export const enoughRoofs = (goodByTownship: number[], needed: number) =>
  goodByTownship.reduce((a, b) => a + b, 0) >= needed

/** Share of days where delivered energy met the P90 promise. */
export function p90Coverage(actual: number[], p90: number[]): number {
  if (actual.length === 0) return 0
  return actual.filter((a, i) => a >= p90[i]).length / actual.length
}
