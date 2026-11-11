import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import CommunityMap, { MAP_COLORS } from '../components/CommunityMap'
import { Kpi, PageHeader, SampleNote } from '../components/ui'
import { fmt, useJson } from '../lib/data'
import { shortDate } from '../lib/forecast'
import {
  communityRoofIds,
  FACILITY_GROUPS,
  loadCommunity,
  STATUS_INFO,
  type CommunityIndex,
  type CommunityPlan,
  type Facility,
  type LampGroup,
} from '../lib/community'
import { leaseItemSat, leasingStore, useStore } from '../lib/store'
import { loadRoofs, type SatRoof, type TownshipIndex } from '../lib/townships'

export const COMMUNITY_PORTFOLIO = (id: string) => `community-${id}`

const longDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** Real events behind the hardest days in the weather record, for the story. */
const EVENTS: Record<string, string> = {
  '2021-12': 'the December 2021 Selangor floods',
  '2015-09': 'the 2015 haze',
  '2015-10': 'the 2015 haze',
}
const eventFor = (iso: string) => EVENTS[iso.slice(0, 7)]

export default function Community({ embedded = false }: { embedded?: boolean }) {
  const { data: cidx, error } = useJson<CommunityIndex>('community/index.json')
  const { data: tidx } = useJson<TownshipIndex>('townships/index.json')
  const [params, setParams] = useSearchParams()
  const tid = params.get('t') ?? 'elmina'
  const meta = tidx?.townships.find((t) => t.id === tid)
  const [plan, setPlan] = useState<CommunityPlan | null>(null)
  const [roofs, setRoofs] = useState<SatRoof[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [focusKey, setFocusKey] = useState(0)
  const leasing = useStore(leasingStore)

  useEffect(() => {
    let live = true
    setPlan(null)
    setSelected(null)
    Promise.all([loadCommunity(tid), loadRoofs(tid)]).then(([p, rs]) => {
      if (!live) return
      const used = communityRoofIds(p)
      setPlan(p)
      setRoofs(rs.filter((r) => used.has(r.id)))
    })
    return () => {
      live = false
    }
  }, [tid])

  const select = (id: string, fly = true) => {
    setSelected(id)
    if (fly) setFocusKey((k) => k + 1)
  }

  const sent = plan ? leasing.filter((x) => x.portfolioId === COMMUNITY_PORTFOLIO(plan.id)).length : 0
  const sendToLeasing = () => {
    if (!plan || !meta) return
    const have = new Set(leasingStore.get().map((x) => x.roofId))
    const add = roofs.filter((r) => !have.has(r.id)).map((r) => leaseItemSat(r, meta.name, COMMUNITY_PORTFOLIO(plan.id)))
    leasingStore.set((l) => [...add, ...l])
  }

  const s = plan?.summary
  const powered = s ? s.self + s.shared : 0
  return (
    <>
      <PageHeader
        eyebrow={embedded ? 'Community energy planner' : 'Community first'}
        title={embedded ? 'Township map' : 'Community energy plan'}
        subtitle="Every school, surau, hall and clinic powered by the township’s own roofs, and every street lamp kept lit, before any power is sold to businesses."
        right={
          cidx && (
            <label className="flex items-center gap-2 text-sm text-muted">
              Township
              <select className="input !w-auto min-w-[220px] font-medium text-ink" value={tid} onChange={(e) => setParams({ t: e.target.value }, { replace: true })}>
                {cidx.townships.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          )
        }
      />
      {error && <p className="text-warn">Could not load the community plan: {error}</p>}
      {(!plan || !meta || !s || !cidx) && !error && <p className="text-muted">Loading…</p>}
      {plan && meta && s && cidx && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Community buildings powered" value={`${powered} of ${s.facilities}`}
              hint={s.facilities ? `${s.self} from their own roof, ${s.shared} with nearby leased roofs` : 'No facilities mapped in OpenStreetMap here yet'} />
            <Kpi label="Street lamps kept lit" value={fmt(s.lamps)} hint={`Standalone solar lamps · ${s.dark_nights === 0 ? 'no dark nights' : `${fmt(s.dark_nights)} dark nights`} in 11 years of real weather`} />
            <Kpi label="CO₂ avoided" value={fmt(s.co2_t_yr)} unit="t / yr" hint={`${fmt(s.community_mwh_yr)} MWh a year of community power off the grid`} />
            <Kpi label="Left over for local businesses" value={fmt(s.surplus_mwh_yr / 1000, 1)} unit="GWh / yr" hint="Sold to fund batteries, upkeep and the next township" />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <section className="card p-4" aria-label="Map">
              <CommunityMap meta={meta} plan={plan} roofs={roofs} selected={selected} onSelect={(id) => select(id, false)} focusKey={focusKey} />
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 px-2 text-sm text-muted" aria-label="Map legend">
                {(['self', 'shared', 'short'] as const).map((k) => (
                  <li key={k} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-white" style={{ background: STATUS_INFO[k].color }} />{STATUS_INFO[k].label}</li>
                ))}
                <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border border-ink" style={{ background: MAP_COLORS.lamp }} />Solar street lamps (size = lamps)</li>
                <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: MAP_COLORS.facilityRoof }} />Roof powering a facility</li>
              </ul>
            </section>
            <Detail plan={plan} selected={selected} roofs={roofs} />
          </div>

          <FacilityTable plan={plan} selected={selected} onSelect={select} />
          <LampSection plan={plan} cidx={cidx} selected={selected} onSelect={select} />

          <section className="card mt-6 grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center" aria-labelledby="next-h">
            <div>
              <h2 id="next-h" className="text-lg font-semibold">From plan to rooftops</h2>
              <p className="mt-1 text-[15px] text-muted">
                This plan uses <span className="num font-semibold text-ink">{fmt(s.roofs_used)}</span> roofs, {fmt(s.good_roofs_reserved)} of them from the
                township’s {fmt(s.good_roofs)} good roofs (street lamps carry their own panels). The other good roofs make about{' '}
                <span className="num font-semibold text-ink">{fmt(s.surplus_mwh_yr / 1000, 1)} GWh</span> a year for{' '}
                <Link to="/portfolio" className="text-primary underline underline-offset-2">local business buyers</Link>, and that income pays for the
                batteries and upkeep. Community roofs are reserved first, so business plans can’t take them. Power from a leased roof reaches a building over TNB’s wires; SDP owns the panels and batteries on its own property.
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 lg:items-end">
              <button type="button" className="btn-primary" onClick={sendToLeasing} disabled={roofs.length === 0 || sent >= roofs.length}>
                {sent >= roofs.length && roofs.length > 0 ? 'On the leasing list' : `Send ${fmt(roofs.length)} roofs to leasing`}
              </button>
              {sent > 0 && <Link to="/leasing" className="text-sm text-primary underline underline-offset-2">Open leasing list</Link>}
            </div>
          </section>

          <Assumptions cidx={cidx} plan={plan} />
        </>
      )}
    </>
  )
}

function Detail({ plan, selected, roofs }: { plan: CommunityPlan; selected: string | null; roofs: SatRoof[] }) {
  const f = plan.facilities.find((x) => x.id === selected)
  const g = plan.lamp_groups.find((x) => x.id === selected)
  const byId = useMemo(() => new Map(roofs.map((r) => [r.id, r])), [roofs])
  const names = (ids: string[]) => ids.map((id) => byId.get(id)?.label ?? id)
  if (f) {
    const st = STATUS_INFO[f.status]
    return (
      <aside className="card p-6" aria-live="polite">
        <p className="label">{f.group} · {f.label}</p>
        <h2 className="mt-1 text-xl font-semibold">{f.name}</h2>
        <span className={`mt-3 inline-block rounded-full px-3 py-1 text-sm font-medium ${st.cls}`}>{st.label}</span>
        <dl className="mt-5 space-y-2 text-[15px]">
          <Row k="Uses (typical)" v={`${fmt(f.need_mwh)} MWh / yr`} />
          <Row k="Used in daylight" v={`${Math.round(f.day_share * 100)}%`} />
          <Row k="Own roof makes" v={f.own_roofs.length ? `${fmt(f.own_mwh, 1)} MWh / yr` : 'No roof mapped'} />
          {f.shared_roofs.length > 0 && <Row k={`${f.shared_roofs.length} nearby roof${f.shared_roofs.length > 1 ? 's' : ''}`} v={`+${fmt(f.shared_mwh, 1)} MWh / yr`} />}
          <Row k="Solar" v={`${fmt(f.kwp, 1)} kWp`} />
          <Row k="Battery for after dark" v={`${fmt(f.battery_kwh)} kWh`} />
          <Row k="Worst month covered" v={`${Math.round(Math.min(f.cover_worst_month, 3) * 100)}%${f.cover_worst_month > 3 ? '+' : ''}`} />
        </dl>
        {f.surplus_mwh > 0 && (
          <p className="mt-4 rounded-lg bg-page px-4 py-3 text-sm">Its roof makes <span className="num font-semibold">{fmt(f.surplus_mwh)} MWh</span> a year more than it needs (weekends, school holidays). That goes to the township pool.</p>
        )}
        {(f.own_roofs.length > 0 || f.shared_roofs.length > 0) && (
          <p className="mt-4 text-sm text-muted">Roofs: {names([...f.own_roofs, ...f.shared_roofs]).join(', ')}</p>
        )}
      </aside>
    )
  }
  if (g) {
    return (
      <aside className="card p-6" aria-live="polite">
        <p className="label">Street lamps</p>
        <h2 className="mt-1 text-xl font-semibold">Lamp group {g.id}</h2>
        <span className={`mt-3 inline-block rounded-full px-3 py-1 text-sm font-medium ${g.ok ? 'bg-primary text-white' : 'bg-[#F6E1D8] text-warn'}`}>
          {g.ok ? 'Never dark in 11 years' : 'Could not be sized'}
        </span>
        <dl className="mt-5 space-y-2 text-[15px]">
          <Row k="Lamps" v={`${fmt(g.lamps)}${g.park_lamps ? ` (${fmt(g.park_lamps)} in parks)` : ''}`} />
          <Row k="Needs each night" v={`${fmt(g.night_kwh, 1)} kWh`} />
          <Row k="Each lamp" v={`${fmt(g.lamp_w)} W LED`} />
          <Row k="Panel on each pole" v={`${fmt(g.panel_wp)} Wp`} />
          <Row k="Battery on each pole" v={`${fmt(g.battery_wh_per_lamp / 1000, 1)} kWh`} />
          {g.lowest_pct !== null && g.lowest_date && <Row k="Lowest charge" v={`${g.lowest_pct}% · ${longDate(g.lowest_date)}`} />}
          {g.one_night_dark !== null && <Row k="With a 1-night battery" v={`${fmt(g.one_night_dark)} dark nights`} />}
        </dl>
        <p className="mt-4 text-sm text-muted">Standalone solar lamps: every pole has its own panel and battery, so they take no roofs and keep working in a blackout.</p>
      </aside>
    )
  }
  return (
    <aside className="card p-6">
      <h2 className="text-lg font-semibold">How the plan works</h2>
      <ol className="mt-3 list-decimal space-y-3 pl-5 text-[15px]">
        <li><span className="font-medium">Find</span> every school, place of worship, hall and clinic in OpenStreetMap, plus every road that needs lighting.</li>
        <li><span className="font-medium">Own roof first.</span> Each building uses the roofs on its own grounds.</li>
        <li><span className="font-medium">Neighbours fill the gap.</span> If that isn’t enough for the cloudiest month, good roofs within {fmt(500)} m are leased (CREAM) and their power reaches the building over TNB’s wires.</li>
        <li><span className="font-medium">Lamps never go dark.</span> Street lamps become standalone solar lamps, each with its own panel and battery, sized so that no night in 11 years of real weather would have gone dark.</li>
        <li><span className="font-medium">The rest is sold</span> to local businesses to pay for it all.</li>
      </ol>
      <p className="mt-4 text-sm text-muted">Click a dot on the map or a row below for details.</p>
    </aside>
  )
}

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between gap-4"><dt className="text-muted">{k}</dt><dd className="num text-right font-medium">{v}</dd></div>
)

function FacilityTable({ plan, selected, onSelect }: { plan: CommunityPlan; selected: string | null; onSelect: (id: string) => void }) {
  const groups = FACILITY_GROUPS.map((g) => ({ g, items: plan.facilities.filter((f) => f.group === g) })).filter((x) => x.items.length)
  return (
    <section className="card mt-6 p-6" aria-labelledby="fac-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="fac-h" className="text-lg font-semibold">Schools, places of worship, halls and clinics</h2>
        <p className="text-[15px] text-muted">Real buildings from OpenStreetMap · energy use is a typical figure until SDP has bills</p>
      </div>
      {groups.length === 0 ? (
        <p className="mt-4 text-[15px] text-muted">OpenStreetMap has no community facilities mapped inside this township’s outline yet. SDP’s own township records would fill this in.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="mt-4 w-full text-[15px]">
            <thead className="border-b border-line text-left text-sm text-muted">
              <tr>
                <th scope="col" className="px-2 py-3 font-medium">Building</th>
                <th scope="col" className="px-2 py-3 font-medium">Uses</th>
                <th scope="col" className="px-2 py-3 font-medium">Powered by</th>
                <th scope="col" className="px-2 py-3 font-medium">Worst month</th>
                <th scope="col" className="px-2 py-3 font-medium">Status</th>
              </tr>
            </thead>
            {groups.map(({ g, items }) => (
              <tbody key={g}>
                <tr><th scope="rowgroup" colSpan={5} className="bg-page px-2 py-2 text-left text-sm font-semibold">{g} · {items.length}</th></tr>
                {items.map((f) => <FacilityRow key={f.id} f={f} active={f.id === selected} onSelect={onSelect} />)}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </section>
  )
}

function FacilityRow({ f, active, onSelect }: { f: Facility; active: boolean; onSelect: (id: string) => void }) {
  const st = STATUS_INFO[f.status]
  const by = [f.own_roofs.length ? 'own roof' : null, f.shared_roofs.length ? `${f.shared_roofs.length} leased roof${f.shared_roofs.length > 1 ? 's' : ''}` : null].filter(Boolean).join(' + ')
  return (
    <tr className={`border-b border-line last:border-0 ${active ? 'bg-primary/5' : ''}`}>
      <td className="px-2 py-3">
        <button type="button" className="min-h-touch text-left font-semibold text-primary underline-offset-2 hover:underline" onClick={() => onSelect(f.id)}>{f.name}</button>
        <div className="text-sm text-muted">{f.label}</div>
      </td>
      <td className="px-2 py-3 num">{fmt(f.need_mwh)} MWh/yr</td>
      <td className="px-2 py-3">{by || '—'}<div className="text-sm text-muted num">{fmt(f.kwp, 1)} kWp · {fmt(f.battery_kwh)} kWh battery</div></td>
      <td className={`px-2 py-3 num ${f.cover_worst_month >= 1 ? 'text-primary' : 'text-warn'}`}>{Math.round(Math.min(f.cover_worst_month, 3) * 100)}%{f.cover_worst_month > 3 ? '+' : ''}</td>
      <td className="px-2 py-3"><span className={`rounded-full px-3 py-1 text-sm font-medium ${st.cls}`}>{st.label}</span></td>
    </tr>
  )
}

function LampSection({ plan, cidx, selected, onSelect }: { plan: CommunityPlan; cidx: CommunityIndex; selected: string | null; onSelect: (id: string) => void }) {
  const s = plan.summary
  const c = plan.lowest_curve
  const worstOneNight = Math.max(0, ...plan.lamp_groups.map((g) => g.one_night_dark ?? 0))
  const ev = c && eventFor(c.lowest_date)
  return (
    <section className="card mt-6 p-6" aria-labelledby="lamp-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="lamp-h" className="text-lg font-semibold">Street lamps that never go dark</h2>
        <Link to="/streetlights" className="text-[15px] text-primary underline underline-offset-2">Street-light watch: lamps at risk this week →</Link>
      </div>
      <p className="mt-1 max-w-4xl text-[15px] text-muted">
        Lamps run at night, when solar overlap is zero, so rooftop solar can’t light them. Each lamp becomes a standalone solar lamp with its own panel and battery, dimmed to 50% from 1 am to 5 am. We replayed every day from{' '}
        {longDate(s.record.start)} to {longDate(s.record.end)} ({fmt(s.record.days)} days of real NASA weather) through every lamp, and sized the
        panel and battery so that <span className="font-semibold text-ink">no night went dark</span> and it always kept a {Math.round(0.2 * 100)}% reserve.
      </p>
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {c ? <ChargeChart c={c} /> : <p className="text-muted">No lamp groups.</p>}
        <dl className="grid content-start gap-3">
          <div className="rounded-card bg-page px-5 py-4">
            <dt className="text-sm text-muted">Hardest stretch in 11 years</dt>
            <dd className="mt-1 text-2xl font-medium num">{c ? `${c.lowest_pct}% left` : '—'}</dd>
            <dd className="mt-1 text-sm text-muted">{c ? `all lamps together, morning of ${longDate(c.lowest_date)}${ev ? `, during ${ev}` : ''}` : ''}</dd>
          </div>
          <div className="rounded-card bg-page px-5 py-4">
            <dt className="text-sm text-muted">Without a proper battery</dt>
            <dd className="mt-1 text-2xl font-medium num text-warn">{fmt(worstOneNight)} dark nights</dd>
            <dd className="mt-1 text-sm text-muted">in the worst group, if each lamp’s battery only held one night</dd>
          </div>
          <div className="rounded-card bg-page px-5 py-4">
            <dt className="text-sm text-muted">Lamps estimated from roads</dt>
            <dd className="mt-1 text-2xl font-medium num">{fmt(s.lamps)}</dd>
            <dd className="mt-1 text-sm text-muted">OpenStreetMap maps only {fmt(s.lamps_mapped_osm)} here, so we count one LED lamp every 30–40 m of road</dd>
          </div>
        </dl>
      </div>
      <details className="mt-5">
        <summary className="min-h-touch cursor-pointer py-2 text-[15px] text-primary">Show all {s.lamp_groups} lamp groups</summary>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-sm">
            <thead className="border-b border-line text-left text-muted">
              <tr>
                <th scope="col" className="py-2 pr-3 font-medium">Group</th><th scope="col" className="pr-3 font-medium">Lamps</th>
                <th scope="col" className="pr-3 font-medium">LED</th><th scope="col" className="pr-3 font-medium">Panel / pole</th>
                <th scope="col" className="pr-3 font-medium">Battery / pole</th><th scope="col" className="pr-3 font-medium">Lowest charge</th>
                <th scope="col" className="font-medium">Dark nights</th>
              </tr>
            </thead>
            <tbody className="num">
              {plan.lamp_groups.map((g: LampGroup) => (
                <tr key={g.id} className={`border-t border-line ${g.id === selected ? 'bg-primary/5' : ''}`}>
                  <td className="py-1.5 pr-3 font-sans"><button type="button" className="min-h-touch text-primary underline-offset-2 hover:underline" onClick={() => onSelect(g.id)}>{g.id}</button></td>
                  <td className="pr-3">{fmt(g.lamps)}</td>
                  <td className="pr-3">{fmt(g.lamp_w)} W</td>
                  <td className="pr-3">{fmt(g.panel_wp)} Wp</td>
                  <td className="pr-3">{fmt(g.battery_wh_per_lamp / 1000, 1)} kWh</td>
                  <td className="pr-3">{g.lowest_pct !== null && g.lowest_date ? `${g.lowest_pct}% · ${shortDate(g.lowest_date)} ${g.lowest_date.slice(0, 4)}` : '—'}</td>
                  <td className={g.ok && g.dark_nights === 0 ? 'text-primary' : 'text-warn'}>{g.ok ? fmt(g.dark_nights ?? 0) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">LED lamps {LAMP_W(cidx)}, {cidx.lamp_hours} hours a night, {cidx.dim_hours} of them at {Math.round(cidx.dim_level * 100)}% · solar sized to {cidx.lamp_pv_oversize}× the average night · battery {Math.round(cidx.battery_eff * 100)}% round trip, {Math.round(cidx.battery_dod * 100)}% usable.</p>
      </details>
    </section>
  )
}

const LAMP_W = (c: CommunityIndex) => {
  const w = Object.values(c.lamp_roads).map((r) => r.watts)
  return `${Math.min(...w)}–${Math.max(...w)} W`
}

function ChargeChart({ c }: { c: NonNullable<CommunityPlan['lowest_curve']> }) {
  const W = 640, H = 240
  const M = { top: 16, right: 12, bottom: 30, left: 40 }
  const iw = W - M.left - M.right, ih = H - M.top - M.bottom
  const n = c.dates.length
  const slot = iw / n
  const x = (i: number) => M.left + slot * i + slot / 2
  const y = (p: number) => M.top + ih - (p / 100) * ih
  const sunMax = Math.max(...c.sun_kwh_kwp, 1)
  const li = c.dates.indexOf(c.lowest_date)
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Battery charge each morning around ${c.lowest_date}, lowest ${c.lowest_pct}%`}>
        {[0, 20, 50, 100].map((t) => (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke={t === 20 ? '#B5520F' : '#E2E0D8'} strokeDasharray={t === 20 ? '5 4' : undefined} />
            <text x={M.left - 6} y={y(t) + 4} fontSize={11} textAnchor="end" fill="#5B655F">{t}%</text>
          </g>
        ))}
        {c.sun_kwh_kwp.map((v, i) => (
          <rect key={i} x={x(i) - slot * 0.32} width={slot * 0.64} y={M.top + ih - (v / sunMax) * ih * 0.45} height={(v / sunMax) * ih * 0.45} fill="#FBEBD3" />
        ))}
        <text x={M.left + 6} y={y(20) - 6} fontSize={11} fill="#B5520F" stroke="#FFFFFF" strokeWidth={3} paintOrder="stroke">20% reserve</text>
        <polyline fill="none" stroke="#1F6F57" strokeWidth={2.5} points={c.pct.map((p, i) => `${x(i)},${y(p)}`).join(' ')} />
        {c.pct.map((p, i) => <circle key={i} cx={x(i)} cy={y(p)} r={i === li ? 5 : 2.5} fill={i === li ? '#15201B' : '#1F6F57'} />)}
        {c.dates.map((d, i) => ((i % 3 === 0 && Math.abs(i - li) > 1) || i === li) && (
          <text key={d} x={x(i)} y={H - 10} fontSize={11} textAnchor="middle" fill={i === li ? '#15201B' : '#5B655F'} fontWeight={i === li ? 600 : 400}>{shortDate(d)}</text>
        ))}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-5 text-sm text-muted">
        <span className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-primary" />Battery charge each morning, all lamps</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-amber-soft" />Sunshine that day</span>
        <span>{c.dates[0].slice(0, 4)}</span>
      </figcaption>
    </figure>
  )
}

function Assumptions({ cidx, plan }: { cidx: CommunityIndex; plan: CommunityPlan }) {
  const types = Object.values(cidx.loads)
  return (
    <details className="card mt-6 p-6">
      <summary className="min-h-touch cursor-pointer text-lg font-semibold">What is real and what is assumed</summary>
      <div className="mt-4 grid gap-6 text-[15px] md:grid-cols-2">
        <div>
          <p className="label">Real</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Facility names and locations: {cidx.facility_source}</li>
            <li>Road network ({fmt(plan.summary.road_km)} km inside the township outline): OpenStreetMap</li>
            <li>Roof outlines and sizes: Overture Maps</li>
            <li>Sunshine 2015–2025 on this township’s own NASA POWER cell, simulated with pvlib</li>
            <li>CO₂: {cidx.grid_t_co2_per_mwh} t per MWh, {cidx.co2_source}</li>
          </ul>
        </div>
        <div>
          <p className="label">Assumed (replace with SDP and council data)</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Energy use per building type (typical, not metered): {types.map((t) => `${t.label.toLowerCase()} ${fmt(t.mwh)} MWh`).join(', ')} a year</li>
            <li>Lamp positions: one every 30–40 m of road, parks by area. The council’s lamp register would replace this</li>
            <li>Roof scores still use sample shading and condition, so which neighbour roofs get picked is indicative</li>
            <li>Facilities OpenStreetMap hasn’t mapped are missing; SDP’s township records would add them</li>
          </ul>
        </div>
      </div>
      <div className="mt-4"><SampleNote>Energy use and lamp counts are estimates until SDP has bills and the council lamp register.</SampleNote></div>
    </details>
  )
}
