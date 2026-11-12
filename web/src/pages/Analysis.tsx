import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Kpi, PageHeader, SampleNote, Segmented } from '../components/ui'
import { fmt, useJson } from '../lib/data'

// Energy analysis: rooftop solar each township could generate vs what it uses (estimated), per year.
// Data: pipeline/lega/energy_balance.py -> energy_balance.json

type UseKey = 'homes' | 'business' | 'community' | 'lamps'
interface Row {
  id: string
  name: string
  state: string
  parent: string | null
  generation_mwh: number
  generation_by_roof: { homes: number; business: number; public: number }
  use_mwh: number
  use: Record<UseKey, number>
  cover: number
  homes: number
  roofs: number
  facilities: number
  lamps: number
  yield_kwh_kwp: number
  co2_t_yr_if_all_used: number
}
interface Balance {
  note: string
  assumptions: { home_kwh_yr: number; apartment_floors: number; apartment_m2: number; business_kwh_m2: Record<string, number>; grid_t_co2_per_mwh: number }
  townships: Row[]
}

// Validated (dataviz validate_palette.js, light surface, in this stack order): all checks pass.
const C = { solar: '#C98500', homes: '#16835F', business: '#2F6CC2', community: '#C8457A' }
const USE_SERIES: { key: 'homes' | 'business' | 'community'; label: string; of: (r: Row) => number }[] = [
  { key: 'homes', label: 'Homes', of: (r) => r.use.homes },
  { key: 'business', label: 'Businesses', of: (r) => r.use.business },
  { key: 'community', label: 'Community (buildings + street lamps)', of: (r) => r.use.community + r.use.lamps },
]
const gwh = (mwh: number, d = 1) => fmt(mwh / 1000, d)
const pct = (x: number) => `${Math.round(x * 100)}%`

type Sort = 'use' | 'generation' | 'cover'

export default function Analysis() {
  const { data, error } = useJson<Balance>('energy_balance.json')
  const [sort, setSort] = useState<Sort>('use')
  const [tip, setTip] = useState<{ x: number; y: number; body: ReactNode } | null>(null)
  useEffect(() => {
    const hide = () => setTip(null)
    window.addEventListener('scroll', hide, { passive: true })
    return () => window.removeEventListener('scroll', hide)
  }, [])

  const rows = useMemo(() => {
    if (!data) return []
    const by: Record<Sort, (r: Row) => number> = { use: (r) => -r.use_mwh, generation: (r) => -r.generation_mwh, cover: (r) => -r.cover }
    return [...data.townships].sort((a, b) => by[sort](a) - by[sort](b))
  }, [data, sort])

  if (error) return <p className="text-warn">Could not load the energy analysis: {error}</p>
  if (!data) return <p className="text-muted">Loading…</p>

  const T = data.townships
  const gen = T.reduce((s, r) => s + r.generation_mwh, 0)
  const use = T.reduce((s, r) => s + r.use_mwh, 0)
  const homes = T.reduce((s, r) => s + r.homes, 0)
  const co2 = T.reduce((s, r) => s + r.co2_t_yr_if_all_used, 0)
  const over = T.filter((r) => r.cover >= 1).length
  const max = Math.max(...T.map((r) => Math.max(r.generation_mwh, r.use_mwh)))
  const w = (mwh: number) => `${(mwh / max) * 100}%`
  const show = (e: React.MouseEvent, body: ReactNode) => setTip(body === null ? null : { x: e.clientX, y: e.clientY, body })

  const genMix = { homes: T.reduce((s, r) => s + r.generation_by_roof.homes, 0), business: T.reduce((s, r) => s + r.generation_by_roof.business, 0), community: T.reduce((s, r) => s + r.generation_by_roof.public, 0) }
  const useMix = { homes: T.reduce((s, r) => s + r.use.homes, 0), business: T.reduce((s, r) => s + r.use.business, 0), community: T.reduce((s, r) => s + r.use.community + r.use.lamps, 0) }

  return (
    <div onMouseLeave={() => setTip(null)}>
      <PageHeader eyebrow="Data analysis · all SDP townships" title="Energy analysis"
        subtitle="How much electricity each township’s rooftops could generate in a year, against how much the township uses. Generation is computed from real roofs and weather; use is an estimate until SDP has meter or bill data." />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Rooftop solar potential" value={gwh(gen)} unit="GWh / yr" hint={`if every solar-ready roof had panels · ${fmt(T.reduce((s, r) => s + r.roofs, 0))} roofs in ${T.length} townships`} />
        <Kpi label="Electricity used (estimate)" value={gwh(use)} unit="GWh / yr" hint={`${fmt(homes)} homes, businesses, community buildings and street lamps`} />
        <Kpi label="Solar could cover" value={pct(gen / use)} hint={`of yearly use · ${over} of ${T.length} townships make more than they use`} />
        <Kpi label="CO₂ avoided if it were all used" value={fmt(co2 / 1000, 1)} unit="kt / yr" hint={`at ${data.assumptions.grid_t_co2_per_mwh} t/MWh (Energy Commission 2024)`} />
      </div>

      <section className="card p-6" aria-labelledby="bal-h">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="bal-h" className="text-lg font-semibold">Generated vs used, by township</h2>
            <p className="text-sm text-muted">GWh a year · top bar: rooftop solar potential · bottom bar: electricity used, by who uses it</p>
          </div>
          <Segmented label="Sort by" value={sort} onChange={setSort}
            options={[{ id: 'use', label: 'Most used' }, { id: 'generation', label: 'Most solar' }, { id: 'cover', label: 'Best covered' }]} />
        </div>
        <Legend items={[{ c: C.solar, label: 'Rooftop solar potential' }, ...USE_SERIES.map((s) => ({ c: C[s.key], label: s.label }))]} />

        <ul className="mt-4 space-y-4">
          {rows.map((r) => (
            <li key={r.id} className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)_64px] items-center gap-x-3 sm:grid-cols-[200px_minmax(0,1fr)_72px]">
              <div className="text-sm">
                <div className="font-semibold leading-tight">{r.name}</div>
                <div className="text-xs text-muted">{r.parent ? 'part of City of Elmina' : r.state}</div>
              </div>
              <div className="space-y-[3px]">
                <div className="flex items-center gap-2">
                  <div className="h-3.5 rounded-r-[4px]" style={{ width: w(r.generation_mwh), background: C.solar }}
                    onMouseLeave={() => setTip(null)} onMouseMove={(e) => show(e, <TipRows title={r.name} rows={[['Rooftop solar potential', `${gwh(r.generation_mwh)} GWh`], ['from homes’ roofs', `${gwh(r.generation_by_roof.homes)} GWh`], ['from business roofs', `${gwh(r.generation_by_roof.business)} GWh`], ['from public roofs', `${gwh(r.generation_by_roof.public)} GWh`], ['Yield', `${fmt(r.yield_kwh_kwp)} kWh/kWp`]]} />)} />
                  <span className="shrink-0 text-xs text-muted num">{gwh(r.generation_mwh)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex h-3.5 gap-[2px]" style={{ width: w(r.use_mwh) }}>
                    {USE_SERIES.map((s, i) => {
                      const v = s.of(r)
                      if (v <= 0) return null
                      return (
                        <div key={s.key} className={i === USE_SERIES.length - 1 || USE_SERIES.slice(i + 1).every((n) => n.of(r) <= 0) ? 'rounded-r-[4px]' : ''}
                          style={{ flexGrow: v, flexBasis: 0, minWidth: 2, background: C[s.key] }}
                          onMouseLeave={() => setTip(null)} onMouseMove={(e) => show(e, <TipRows title={`${r.name} · ${s.label}`} rows={[['Uses', `${gwh(v, 2)} GWh`], ['Share of township use', pct(v / r.use_mwh)], ...(s.key === 'community' ? [['buildings', `${fmt(r.use.community)} MWh`], ['street lamps', `${fmt(r.use.lamps)} MWh`]] as [string, string][] : []), ...(s.key === 'homes' ? [['homes counted', fmt(r.homes)]] as [string, string][] : [])]} />)} />
                      )
                    })}
                  </div>
                  <span className="shrink-0 text-xs text-muted num">{gwh(r.use_mwh)}</span>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-base font-semibold num ${r.cover >= 1 ? 'text-primary' : 'text-warn'}`}>{pct(r.cover)}</div>
                <div className="text-[11px] leading-tight text-muted">covered</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-6" aria-labelledby="mix-h">
          <h2 id="mix-h" className="text-lg font-semibold">Where it comes from, where it goes</h2>
          <p className="text-sm text-muted">All {T.length} townships together, share of the yearly total</p>
          <MixBar title={`Solar potential · ${gwh(gen)} GWh`} parts={[['homes', 'Homes’ roofs', genMix.homes], ['business', 'Business roofs', genMix.business], ['community', 'Public roofs', genMix.community]]} onTip={show} />
          <MixBar title={`Electricity used · ${gwh(use)} GWh`} parts={[['homes', 'Homes', useMix.homes], ['business', 'Businesses', useMix.business], ['community', 'Community', useMix.community]]} onTip={show} />
          <p className="mt-4 text-sm text-muted">
            Homes’ roofs make {pct(genMix.homes / gen)} of the potential while homes use {pct(useMix.homes / use)} of the power, so
            the surplus on residential roofs is what can be sold to local businesses. Community buildings and street lamps use only {pct(useMix.community / use)}:
            keeping them powered first costs the township very little.
          </p>
        </section>

        <section className="card p-6" aria-labelledby="cov-h">
          <h2 id="cov-h" className="text-lg font-semibold">Share of yearly use rooftop solar could cover</h2>
          <p className="text-sm text-muted">Over 100%: the township’s roofs make more than it uses in a year</p>
          <CoverBars rows={[...T].sort((a, b) => b.cover - a.cover)} onTip={show} />
        </section>
      </div>

      <section className="card mt-6 overflow-x-auto p-6" aria-labelledby="tbl-h">
        <h2 id="tbl-h" className="text-lg font-semibold">All numbers</h2>
        <table className="mt-3 w-full min-w-[860px] text-[15px]">
          <thead className="border-b border-line text-left text-sm text-muted">
            <tr>
              <th scope="col" className="py-2 pr-3 font-medium">Township</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Homes</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Solar potential</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Homes use</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Businesses use</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Community buildings</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Street lamps</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Total use</th>
              <th scope="col" className="py-2 pl-3 text-right font-medium">Covered</th>
            </tr>
          </thead>
          <tbody className="num">
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <th scope="row" className="py-2 pr-3 text-left font-sans font-medium"><Link to={`/map?t=${r.parent ?? r.id}`} className="text-primary underline-offset-2 hover:underline">{r.name}</Link></th>
                <td className="px-3 py-2 text-right">{fmt(r.homes)}</td>
                <td className="px-3 py-2 text-right">{fmt(r.generation_mwh)}</td>
                <td className="px-3 py-2 text-right">{fmt(r.use.homes)}</td>
                <td className="px-3 py-2 text-right">{fmt(r.use.business)}</td>
                <td className="px-3 py-2 text-right">{fmt(r.use.community)}</td>
                <td className="px-3 py-2 text-right">{fmt(r.use.lamps)}</td>
                <td className="px-3 py-2 text-right font-semibold">{fmt(r.use_mwh)}</td>
                <td className={`py-2 pl-3 text-right font-semibold ${r.cover >= 1 ? 'text-primary' : 'text-warn'}`}>{pct(r.cover)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-ink font-semibold">
              <th scope="row" className="py-2 pr-3 text-left font-sans">All townships</th>
              <td className="px-3 py-2 text-right">{fmt(homes)}</td>
              <td className="px-3 py-2 text-right">{fmt(gen)}</td>
              <td className="px-3 py-2 text-right">{fmt(useMix.homes)}</td>
              <td className="px-3 py-2 text-right">{fmt(useMix.business)}</td>
              <td className="px-3 py-2 text-right">{fmt(T.reduce((s, r) => s + r.use.community, 0))}</td>
              <td className="px-3 py-2 text-right">{fmt(T.reduce((s, r) => s + r.use.lamps, 0))}</td>
              <td className="px-3 py-2 text-right">{fmt(use)}</td>
              <td className="py-2 pl-3 text-right">{pct(gen / use)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">MWh a year. Click a township to open its roofs on the Roof map.</p>
      </section>

      <section className="card mt-6 p-6" aria-labelledby="read-h">
        <h2 id="read-h" className="text-lg font-semibold">How to read this</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[15px] text-muted">
          <li><span className="font-medium text-ink">These are yearly totals, not hour by hour.</span> Solar only generates in daylight, and homes use most of their power in the evening. A township at 150% still needs the grid or batteries at night; the extra daytime power is what LEGA OS sells to local businesses.</li>
          <li><span className="font-medium text-ink">Solar potential</span> assumes panels on every solar-ready roof (≥ 3 kWp). It is the ceiling, not what is installed today.</li>
          <li><span className="font-medium text-ink">Homes</span> are counted from the building scan: one per house, terrace rows split into houses, apartment blocks at {data.assumptions.apartment_floors} floors of {data.assumptions.apartment_m2} m² flats. Each home uses a sample {fmt(data.assumptions.home_kwh_yr)} kWh a year ({fmt(data.assumptions.home_kwh_yr / 12)} kWh a month).</li>
          <li><span className="font-medium text-ink">Businesses</span> use a sample amount per m² of roof: {Object.entries(data.assumptions.business_kwh_m2).map(([k, v]) => `${k === 'medium' ? 'mid-size (type unknown)' : k === 'large' ? 'large (type unknown)' : k === 'parking' ? 'car parks' : k} ${v}`).join(', ')} kWh/m² a year.</li>
          <li><span className="font-medium text-ink">Community buildings and street lamps</span> come from the community plan (Community energy planner → Township map).</li>
        </ul>
        <div className="mt-4"><SampleNote>Roofs, buildings and weather are real. Electricity use is estimated from the sample rates above until SDP has meter or TNB bill data. Kulai is not included: it has no buildings yet.</SampleNote></div>
      </section>

      {tip && (
        <div role="tooltip" className="pointer-events-none fixed z-50 rounded-lg border border-line bg-card px-3 py-2 text-sm shadow-lg"
          style={{ left: Math.min(tip.x + 14, window.innerWidth - 280), top: tip.y + 14 }}>{tip.body}</div>
      )}
    </div>
  )
}

function Legend({ items }: { items: { c: string; label: string }[] }) {
  return (
    <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted" aria-label="Legend">
      {items.map((i) => <li key={i.label} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: i.c }} />{i.label}</li>)}
    </ul>
  )
}

function TipRows({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="min-w-[200px]">
      <div className="mb-1 font-semibold">{title}</div>
      {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4"><span className="text-muted">{k}</span><span className="num">{v}</span></div>)}
    </div>
  )
}

type Tip = (e: React.MouseEvent, body: ReactNode) => void

function MixBar({ title, parts, onTip }: { title: string; parts: ['homes' | 'business' | 'community', string, number][]; onTip: Tip }) {
  const total = parts.reduce((s, p) => s + p[2], 0)
  return (
    <div className="mt-5">
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-2 flex h-6 gap-[2px] overflow-hidden rounded-[4px]">
        {parts.map(([k, label, v]) => (
          <div key={k} style={{ flexGrow: v, flexBasis: 0, background: C[k] }}
            onMouseLeave={(e) => onTip(e, null)} onMouseMove={(e) => onTip(e, <TipRows title={label} rows={[['GWh a year', gwh(v)], ['Share', pct(v / total)]]} />)} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {parts.map(([k, label, v]) => (
          <li key={k} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: C[k] }} /><span className="text-muted">{label}</span><span className="font-semibold num">{pct(v / total)}</span></li>
        ))}
      </ul>
    </div>
  )
}

function CoverBars({ rows, onTip }: { rows: Row[]; onTip: Tip }) {
  const top = Math.max(2, Math.ceil(Math.max(...rows.map((r) => r.cover)) * 2) / 2)
  const x = (v: number) => `${(v / top) * 100}%`
  return (
    <div className="mt-4">
      <div className="relative space-y-2.5">
        <div className="pointer-events-none absolute inset-y-0 border-l-2 border-dashed border-ink/50" style={{ left: `calc(130px + (100% - 130px - 48px) * ${1 / top})` }} aria-hidden="true" />
        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-[130px_minmax(0,1fr)_48px] items-center gap-0 text-sm">
            <span className="truncate pr-2" title={r.name}>{r.name}</span>
            <div className="h-4" onMouseLeave={(e) => onTip(e, null)} onMouseMove={(e) => onTip(e, <TipRows title={r.name} rows={[['Solar potential', `${gwh(r.generation_mwh)} GWh`], ['Used', `${gwh(r.use_mwh)} GWh`], ['Covered', pct(r.cover)]]} />)}>
              <div className="h-full rounded-r-[4px]" style={{ width: x(r.cover), background: C.solar }} />
            </div>
            <span className={`pl-2 text-right font-semibold num ${r.cover >= 1 ? 'text-primary' : 'text-warn'}`}>{pct(r.cover)}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-[130px_minmax(0,1fr)_48px] text-xs text-muted">
        <span />
        <div className="relative h-4">
          {[0, 1, top].map((v) => <span key={v} className="absolute -translate-x-1/2 num" style={{ left: x(v) }}>{pct(v)}</span>)}
        </div>
      </div>
      <p className="mt-3 text-sm text-muted">Dashed line: 100%, the township’s roofs make exactly what it uses in a year. Townships whose figure is in rust fall short of it: they need power from elsewhere even on paper.</p>
    </div>
  )
}
