import type { YieldData } from './data'
import { createStore } from './store'
import type { TownshipIndex, TownshipMeta } from './townships'
import {
  BUFFERS,
  dropoutCover,
  enoughRoofs,
  monthCover,
  needYr,
  PATTERN_SHARE,
  roofsBase,
  roofsNeeded,
  solarNeed,
  type Pattern,
  type Safety,
  type Unit,
} from './formulas'

export const GOOD_SCORE = 75

export type Township = TownshipMeta

export const BUYER_LOCATIONS = [
  'City of Elmina, Selangor', 'Bandar Bukit Raja, Selangor', 'Serenia City, Selangor', 'Ara Damansara, Selangor', 'Putra Heights, Selangor',
  'Nilai Impian, Negeri Sembilan', 'Bandar Ainsdale, Negeri Sembilan', 'Bandar Universiti Pagoh, Johor', 'Other',
]

export const PATTERN_INFO: Record<Pattern, { label: string; hours: string; note: string }> = {
  office: { label: 'Office hours', hours: '8am – 6pm, weekdays', note: 'Demand peaks while the sun is up.' },
  mall: { label: 'Mall hours', hours: '10am – 10pm, daily', note: 'Evenings run past sunset.' },
  '24h': { label: '24 hours', hours: 'Data centre, cold store', note: 'Over half the demand is at night.' },
}

export const SAFETY_INFO: Record<Safety, { label: string; note: string }> = {
  lean: { label: 'Lean', note: '+0% roofs' },
  balanced: { label: 'Balanced', note: '+15% roofs' },
  monsoon: { label: 'Monsoon-proof', note: '+25% roofs' },
}

export interface TownshipStats {
  good: number
  avgMwh: number
}

export interface Portfolio {
  id: string
  buyer: string
  location: string
  demand: number
  unit: Unit
  pattern: Pattern
  townships: string[]
  safety: Safety
  status: 'Draft' | 'Plan ready' | 'Sent to leasing'
  createdAt: string
}

export const SAMPLE_PORTFOLIO_ID = 'sample-innovation-park'

// Sample buyers (not real contracts). Innovation Park matches the firming forecast's sample demand.
const SAMPLES: Portfolio[] = [
  {
    id: SAMPLE_PORTFOLIO_ID, buyer: 'Innovation Park, Elmina', location: 'City of Elmina, Selangor', demand: 1800, unit: 'year',
    pattern: 'office', townships: ['elmina'], safety: 'balanced', status: 'Sent to leasing', createdAt: '2026-10-20T09:00:00.000Z',
  },
  {
    id: 'sample-lakeside-mall', buyer: 'Elmina Lakeside Mall', location: 'City of Elmina, Selangor', demand: 2400, unit: 'year',
    pattern: 'mall', townships: ['elmina'], safety: 'balanced', status: 'Draft', createdAt: '2026-10-20T09:05:00.000Z',
  },
]

export const STATUS_LABEL: Record<Portfolio['status'], string> = { Draft: 'Draft', 'Plan ready': 'Plan ready', 'Sent to leasing': 'Leasing' }

export const portfolioStore = createStore<Portfolio[]>('lega.portfolios.v3', SAMPLES)

export function newPortfolio(): Portfolio {
  return {
    id: `p-${Date.now().toString(36)}`,
    buyer: '',
    location: BUYER_LOCATIONS[0],
    demand: 0,
    unit: 'year',
    pattern: 'office',
    townships: ['elmina'],
    safety: 'balanced',
    status: 'Draft',
    createdAt: new Date().toISOString(),
  }
}

/** Good-roof stats from a township scan; null until this browser has scanned it. */
export function townshipStats(t: Township, scanned: string[]): TownshipStats | null {
  return scanned.includes(t.id) ? { good: t.summary.good_roofs, avgMwh: t.summary.avg_mwh_good } : null
}

export const monthlyShare = (y: YieldData) => {
  const total = y.monthly.reduce((a, m) => a + m.kwh_per_kwp, 0)
  return y.monthly.map((m) => m.kwh_per_kwp / total)
}

export interface Requirement {
  needYr: number
  perDay: number
  share: number
  solarNeed: number
}

export function requirement(p: Pick<Portfolio, 'demand' | 'unit' | 'pattern'>): Requirement {
  const share = PATTERN_SHARE[p.pattern]
  const ny = needYr(p.demand, p.unit)
  return { needYr: ny, perDay: ny / 365, share, solarNeed: solarNeed(p.demand, p.unit, share) }
}

export interface Plan extends Requirement {
  avgMwhPerRoof: number
  goodAvailable: number
  roofsBase: number
  roofsNeeded: number
  buffer: number
  covers: number[]
  dropoutCover: number
  enough: boolean
  allocation: { township: Township; stats: TownshipStats; roofs: number }[]
}

export function buildPlan(p: Portfolio, index: TownshipIndex, y: YieldData, scanned: string[]): Plan | null {
  const req = requirement(p)
  const sel = index.townships
    .filter((t) => p.townships.includes(t.id))
    .map((t) => ({ township: t, stats: townshipStats(t, scanned) }))
    .filter((x): x is { township: Township; stats: TownshipStats } => !!x.stats && x.stats.good > 0)
  const goodAvailable = sel.reduce((a, x) => a + x.stats.good, 0)
  if (!goodAvailable || req.solarNeed <= 0) return null

  // avg MWh per roof across the good roofs in the selected townships
  const avg = sel.reduce((a, x) => a + x.stats.good * x.stats.avgMwh, 0) / goodAvailable
  const base = roofsBase(req.solarNeed, avg)
  const buffer = BUFFERS[p.safety]
  const needed = roofsNeeded(base, buffer)
  const covers = monthCover(needed, avg, monthlyShare(y), req.solarNeed)

  // Split roofs across townships in proportion to good roofs (largest remainder), capped by availability.
  const target = Math.min(needed, goodAvailable)
  const raw = sel.map((x) => (x.stats.good / goodAvailable) * target)
  const alloc = raw.map(Math.floor)
  let left = target - alloc.reduce((a, b) => a + b, 0)
  raw
    .map((r, i) => ({ i, rem: r - Math.floor(r) }))
    .sort((a, b) => b.rem - a.rem)
    .forEach(({ i }) => {
      if (left > 0 && alloc[i] < sel[i].stats.good) {
        alloc[i]++
        left--
      }
    })

  return {
    ...req,
    avgMwhPerRoof: avg,
    goodAvailable,
    roofsBase: base,
    roofsNeeded: needed,
    buffer,
    covers,
    dropoutCover: dropoutCover(covers),
    enough: enoughRoofs(sel.map((x) => x.stats.good), needed),
    allocation: sel.map((x, i) => ({ ...x, roofs: alloc[i] })),
  }
}
