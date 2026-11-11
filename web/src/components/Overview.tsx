import { Link } from 'react-router-dom'
import { fmt, useJson } from '../lib/data'
import type { CommunityIndex } from '../lib/community'
import { evaluate } from '../lib/planner'
import { portfolioStore, requirement } from '../lib/portfolio'
import { useStore } from '../lib/store'
import type { TownshipIndex } from '../lib/townships'
import { useAssets } from '../pages/Planner'
import { useLampsAtRisk } from '../lib/streetlights'

/** Community-first headline numbers. Commercial sales sit in the smaller "Funded by" tile. */
export default function Overview() {
  const [assets, data] = useAssets()
  const { data: cidx } = useJson<CommunityIndex>('community/index.json')
  const { data: tidx } = useJson<TownshipIndex>('townships/index.json')
  const portfolios = useStore(portfolioStore)
  const atRisk = useLampsAtRisk()
  if (!assets || !data || !cidx || !tidx) return null

  const res = assets.map((a) => {
    const t = tidx.townships.find((x) => x.id === a.township)
    const roofKwp = t ? ((t.summary.avg_mwh_surplus ?? t.summary.avg_mwh_good) * 1000) / t.summary.yield_kwh_kwp : 40
    return { a, r: evaluate(a, data, roofKwp) }
  })
  const neutral = res.filter((x) => x.r.bill_neutral).length
  const pps = res.filter((x) => x.a.type === 'hall' && x.r.battery_kwh > 0)
  const ppsHours = pps.length ? Math.min(...pps.map((x) => x.r.backup_hours)) : 0
  const solarMwh = res.reduce((s, x) => s + Math.min(x.r.solarKwhYr, x.a.annualKwh), 0) / 1000
  const elmina = cidx.townships.find((t) => t.id === 'elmina')?.summary
  const co2 = (solarMwh + (elmina?.lamp_mwh_yr ?? 0)) * cidx.grid_t_co2_per_mwh
  const saved = res.reduce((s, x) => s + x.r.savedRmYr, 0)
  const commercial = portfolios.reduce((s, p) => s + (p.demand > 0 ? requirement(p).solarNeed : 0), 0)

  const tile = (to: string, label: string, value: string, hint: string, warn = false) => (
    <Link to={to} className="card block px-5 py-4 hover:ring-1 hover:ring-primary">
      <div className="text-sm text-muted">{label}</div>
      <div className={`mt-1.5 text-[26px] font-medium leading-none num ${warn ? 'text-warn' : ''}`}>{value}</div>
      <div className="mt-1.5 text-xs text-muted">{hint}</div>
    </Link>
  )
  return (
    <section aria-label="Community overview" className="mb-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {tile('/planner', 'Community buildings bill-neutral', `${neutral} of ${assets.length}`, 'Schools, surau, halls, clinics in the planner')}
        {tile('/planner', 'Backup at evacuation centres', pps.length ? `${fmt(ppsHours)} h` : '—', pps.length ? `with no grid and no sun · ${pps.length} PPS` : 'No PPS with a battery yet')}
        {tile('/streetlights', 'Street lamps at risk this week', atRisk === null ? '…' : fmt(atRisk), 'Standalone solar lamps, City of Elmina', !!atRisk)}
        {tile('/planner', 'CO₂ avoided', `${fmt(co2)} t`, `a year · ${cidx.grid_t_co2_per_mwh} t/MWh (Energy Commission 2024)`)}
        {tile('/planner', 'Saved on community bills', `RM ${fmt(saved / 1000)}k`, 'a year · sample tariff RM 0.50/kWh')}
        <Link to="/portfolio" className="block rounded-card border border-dashed border-line px-5 py-4 hover:bg-card">
          <div className="text-sm text-muted">Funded by</div>
          <div className="mt-1.5 text-lg font-medium num">{fmt(commercial)} MWh/yr</div>
          <div className="mt-1 text-xs text-muted">sold to commercial buyers</div>
        </Link>
      </div>
      <p className="mt-2 text-xs text-muted">Buildings and roofs are real; loads, prices and lamp specs are sample values.</p>
    </section>
  )
}
