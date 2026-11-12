import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, SampleNote, Segmented } from '../components/ui'
import { fmt, useJson } from '../lib/data'
import { dispatch, hoursUntilDark, SECOND_LIFE_SOH, stormFlags, type BatteryData, type Site } from '../lib/battery'
import type { PlannerData } from '../lib/planner'

type Scenario = 'live' | 'drill'
type Pack = 'new' | 'second'

const hourLabel = (iso: string) => {
  const d = new Date(iso)
  return `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${iso.slice(11, 16)}`
}

export default function BatteryController() {
  const { data, error } = useJson<BatteryData>('battery_72h.json')
  const { data: pd } = useJson<PlannerData>('load_profiles.json')
  if (error) return <p className="text-warn">Could not load the battery forecast: {error}</p>
  if (!data || !pd) return <p className="text-muted">Loading…</p>
  return <Controller data={data} pd={pd} />
}

function Controller({ data, pd }: { data: BatteryData; pd: PlannerData }) {
  const [siteId, setSiteId] = useState(data.sites[0].id)
  const [pack, setPack] = useState<Pack>('new')
  const [scenario, setScenario] = useState<Scenario>('drill')
  const [outageAt, setOutageAt] = useState(36)
  const [outage, setOutage] = useState(false)
  const site = data.sites.find((s) => s.id === siteId) as Site
  const w = data[scenario]
  const soh = pack === 'new' ? 1 : SECOND_LIFE_SOH
  const cap = site.battery_kwh * soh

  const { load, crit, pv } = useMemo(() => {
    const p = pd.profiles[site.type]
    const k = site.annual_kwh / p.typical_kwh
    const critKw = ((p.emergency_kw ?? p.kw).reduce((a, b) => a + b, 0) / 24) * k
    return {
      load: w.time.map((t) => p.kw[Number(t.slice(11, 13))] * k),
      crit: w.time.map(() => critKw),
      pv: w.pv_kw_per_kwp.map((x) => x * site.kwp),
    }
  }, [pd, site, w])

  const start = data.rules.start_soc
  const run = useMemo(() => dispatch(pv, load, crit, cap, w.rain_mm, start, outage ? outageAt : null), [pv, load, crit, cap, w, start, outage, outageAt])
  const calm = useMemo(() => dispatch(pv, load, crit, cap, w.rain_mm.map(() => 0), start, outage ? outageAt : null), [pv, load, crit, cap, w, start, outage, outageAt])
  const prep = stormFlags(w.rain_mm)
  const stormFrom = prep.indexOf(true)
  const stormTo = prep.lastIndexOf(true)
  const rainFrom = Math.max(0, w.rain_mm.findIndex((r) => r > data.rules.storm_mm_h))
  const rainTo = Math.max(rainFrom, w.rain_mm.length - 1 - [...w.rain_mm].reverse().findIndex((r) => r > data.rules.storm_mm_h))

  const loadSum = run.served.reduce((a, b) => a + b, 0)
  const imp = run.imp.reduce((a, b) => a + b, 0)
  const exp = run.exp.reduce((a, b) => a + b, 0)
  const own = loadSum ? Math.max(0, 1 - imp / loadSum) : 0
  const failNow = hoursUntilDark(pv, crit, cap, start, w.rain_mm, 0)
  const firstDark = run.dark.indexOf(true)
  const calmDark = calm.dark.indexOf(true)

  return (
    <>
      <PageHeader eyebrow="SDP-owned batteries" title="Battery controller"
        subtitle="The battery brain for community buildings: runs the next 72 hours of weather through each site’s solar and battery, tops up before storms, and shows how long a building stays on if the grid fails." />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented label="Site" value={siteId} onChange={(v) => { setSiteId(v); setOutage(false) }} options={data.sites.map((s) => ({ id: s.id, label: s.name.replace(' Elmina', '') }))} />
        <Segmented label="Battery" value={pack} onChange={setPack} options={[{ id: 'new', label: 'New battery' }, { id: 'second', label: `Second-life EV pack (${Math.round(SECOND_LIFE_SOH * 100)}% health)` }]} />
        <Segmented label="Weather" value={scenario} onChange={(v) => { setScenario(v); setOutage(false) }} options={[{ id: 'live', label: 'Live forecast' }, { id: 'drill', label: 'Storm drill' }]} />
      </div>

      {stormFrom >= 0 ? (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-card border border-warn/40 bg-[#F6E1D8] px-5 py-3" role="status">
          <span className="rounded-full bg-warn px-3 py-1 text-sm font-semibold text-white">Storm prep</span>
          <span className="text-[15px]">Storm forecast {hourLabel(w.time[rainFrom])} – {hourLabel(w.time[rainTo])}: topping up to 100% from {hourLabel(w.time[stormFrom])}. Heavy rain (&gt; {data.rules.storm_mm_h} mm/h) within 24 hours raises the reserve from {Math.round(data.rules.reserve * 100)}% to 100%.</span>
        </div>
      ) : (
        <p className="mb-5 rounded-card border border-line bg-card px-5 py-3 text-[15px]">No storm in the next 72 hours: the battery keeps a {Math.round(data.rules.reserve * 100)}% reserve and exports spare solar. Try the <button type="button" className="text-primary underline underline-offset-2" onClick={() => setScenario('drill')}>storm drill</button>.</p>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Supplied by own solar + battery" value={`${Math.round(own * 100)}%`} hint={`of the building’s use over 72 hours${imp > 0 && stormFrom >= 0 ? '; grid top-ups before the storm count as grid power' : ''}`} />
        <Tile label="Grid import" value={`${fmt(imp)} kWh`} hint={stormFrom >= 0 ? 'includes topping up before the storm' : 'when the battery is at its reserve'} />
        <Tile label="Exported" value={`${fmt(exp)} kWh`} hint="spare solar, credited on the bill" />
        <Tile label={`If the grid fails at ${hourLabel(w.time[0])}`} value={failNow === null ? '72 h +' : `${fmt(failNow)} h`} hint={`stays on at ${fmt(crit[0], 1)} kW critical load${site.type === 'hall' ? ' (emergency mode)' : ''}`} strong />
      </div>

      <section className="card p-6" aria-labelledby="chart-h">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="chart-h" className="text-lg font-semibold">{site.name} · next 72 hours</h2>
            <p className="text-sm text-muted">{site.kwp} kWp solar · {fmt(cap)} kWh usable battery{pack === 'second' ? ` (${site.battery_kwh} kWh nominal × ${SECOND_LIFE_SOH})` : ''} · {site.note}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="out-at" className="text-sm text-muted">Grid fails at</label>
            <select id="out-at" className="input !w-auto" value={outageAt} onChange={(e) => setOutageAt(Number(e.target.value))}>
              {w.time.map((t, i) => i % 3 === 0 && <option key={t} value={i}>{hourLabel(t)} (+{i} h)</option>)}
            </select>
            <button type="button" className={outage ? 'btn-ghost' : 'btn-primary'} onClick={() => setOutage((o) => !o)}>{outage ? 'Clear outage' : 'Simulate grid outage'}</button>
          </div>
        </div>
        {outage && (
          <div className={`mt-4 rounded-lg px-4 py-3 text-[15px] ${firstDark >= 0 ? 'bg-[#F6E1D8]' : 'bg-primary/10'}`} role="status">
            {firstDark >= 0
              ? <>Grid down from {hourLabel(w.time[outageAt])}: <span className="font-semibold text-warn">goes dark at {hourLabel(w.time[firstDark])}</span>, after {firstDark - outageAt} hours.</>
              : <>Grid down from {hourLabel(w.time[outageAt])}: <span className="font-semibold text-primary">stays on to the end of the forecast</span> ({72 - outageAt} hours and counting).</>}
            {stormFrom >= 0 && (calmDark >= 0) && (firstDark < 0 || calmDark < firstDark) && (
              <> Without storm prep it would have gone dark after {calmDark - outageAt} hours.</>
            )}
          </div>
        )}
        <Chart w={w} pv={pv} load={outage ? load.map((v, i) => (i >= outageAt ? crit[i] : v)) : load} run={run} outageAt={outage ? outageAt : null} storm={stormFrom >= 0 ? [stormFrom, stormTo] : null} />
        <p className="mt-3 rounded-lg bg-page px-4 py-2 text-sm">Behind the meter on SDP property: SDP owns the panels and battery. No TNB wires needed for the building’s own supply; the grid still backs it up.</p>
      </section>

      <details className="card mt-6 p-6">
        <summary className="min-h-touch cursor-pointer text-lg font-semibold">How the controller decides</summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-[15px]">
          <li>Solar serves the building first. Spare solar charges the battery; anything left is exported.</li>
          <li>When solar falls short, the battery discharges down to its reserve ({Math.round(data.rules.reserve * 100)}% normally), then the grid takes over.</li>
          <li>If more than {data.rules.storm_mm_h} mm/h of rain (or a storm warning) is forecast in the next {data.rules.lookahead_h} hours, the reserve goes to 100% and the battery tops up, from the grid if needed.</li>
          <li>In an outage, grid-tied solar keeps running only through the battery’s inverter; the building drops to its critical load and the battery can use its whole charge.</li>
          <li>A second-life EV pack holds about {Math.round(SECOND_LIFE_SOH * 100)}% of its original capacity: cheaper, and the same rules apply.</li>
        </ol>
        <p className="mt-3 text-sm text-muted">Weather: {data.source} ({data.status}, {data.generated_at.slice(0, 16).replace('T', ' ')} UTC). The storm drill adds heavy rain in hours 30–50 so storm prep can be shown on any day.</p>
      </details>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <SampleNote>Sites, loads and batteries are sample values; there is no live battery telemetry yet.</SampleNote>
        <Link to="/planner" className="text-sm text-primary underline underline-offset-2">Size a battery in the planner</Link>
      </div>
    </>
  )
}

function Tile({ label, value, hint, strong = false }: { label: string; value: string; hint: string; strong?: boolean }) {
  return (
    <div className={`card px-6 py-5 ${strong ? 'ring-2 ring-primary' : ''}`}>
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-2 text-[28px] font-medium leading-none num">{value}</div>
      <div className="mt-2 text-xs text-muted">{hint}</div>
    </div>
  )
}

function Chart({ w, pv, load, run, outageAt, storm }: { w: BatteryData['live']; pv: number[]; load: number[]; run: ReturnType<typeof dispatch>; outageAt: number | null; storm: [number, number] | null }) {
  const W = 960, H = 340, M = { t: 24, r: 48, b: 62, l: 48 }
  const iw = W - M.l - M.r, ih = H - M.t - M.b - 40
  const n = pv.length
  const x = (i: number) => M.l + (i / n) * iw
  const kwMax = Math.max(...pv, ...load, 1) * 1.1
  const yk = (v: number) => M.t + ih - (v / kwMax) * ih
  const ys = (p: number) => M.t + ih - p * ih
  const rainMax = Math.max(20, ...w.rain_mm)
  const rainTop = M.t + ih + 14
  const step = (arr: number[], f: (v: number) => number) => arr.map((v, i) => `${x(i)},${f(v)} ${x(i + 1)},${f(v)}`).join(' ')
  return (
    <figure className="mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Solar, load, battery charge and rain over the next 72 hours">
        {storm && <rect x={x(storm[0])} y={M.t - 14} width={x(storm[1] + 1) - x(storm[0])} height={ih + 14} fill="#A33A12" opacity={0.07} />}
        {storm && <text x={x(storm[0]) + 6} y={M.t - 3} fontSize={12} fill="#A33A12" fontWeight={600}>Storm forecast: topping up to 100%</text>}
        {outageAt !== null && <rect x={x(outageAt)} y={M.t} width={x(n) - x(outageAt)} height={ih} fill="#15201B" opacity={0.06} />}
        {outageAt !== null && <text x={x(outageAt) + 6} y={M.t + 14} fontSize={12} fill="#15201B" fontWeight={600}>Grid down</text>}
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={M.l} x2={W - M.r} y1={ys(f)} y2={ys(f)} stroke="#E2E0D8" />
            <text x={M.l - 6} y={ys(f) + 4} fontSize={11} textAnchor="end" fill="#5B655F">{fmt(kwMax * f, 0)}</text>
            <text x={W - M.r + 6} y={ys(f) + 4} fontSize={11} fill="#5B655F">{Math.round(f * 100)}%</text>
          </g>
        ))}
        <text x={M.l - 6} y={M.t - 8} fontSize={11} textAnchor="end" fill="#5B655F">kW</text>
        <text x={W - M.r + 6} y={M.t - 8} fontSize={11} fill="#5B655F">charge</text>
        <polygon points={`${x(0)},${yk(0)} ${step(pv, yk)} ${x(n)},${yk(0)}`} fill="#FBEBD3" stroke="#E39B2E" strokeWidth={1.2} />
        <polyline points={step(load, yk)} fill="none" stroke="#5B655F" strokeWidth={1.6} />
        <polyline points={step(run.reserve, ys)} fill="none" stroke="#A33A12" strokeWidth={1.4} strokeDasharray="5 4" />
        <polyline points={run.soc.map((s, i) => `${x(i + 1)},${ys(s)}`).join(' ')} fill="none" stroke="#1F6F57" strokeWidth={2.8} />
        {run.dark.map((d, i) => d && <rect key={i} x={x(i)} y={M.t + ih - 6} width={iw / n} height={6} fill="#A33A12" />)}
        {w.rain_mm.map((r, i) => r > 0 && <rect key={i} x={x(i) + 0.5} y={rainTop} width={iw / n - 1} height={(r / rainMax) * 34} fill={r > 10 ? '#2F6A91' : '#9CC5E0'} />)}
        <text x={M.l - 6} y={rainTop + 10} fontSize={11} textAnchor="end" fill="#5B655F">rain</text>
        {w.time.map((t, i) => i % 12 === 0 && (
          <text key={t} x={x(i)} y={H - 6} fontSize={11} textAnchor="middle" fill="#5B655F">{hourLabel(t)}</text>
        ))}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-amber bg-amber-soft" />Solar</span>
        <span className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-muted" />Use</span>
        <span className="flex items-center gap-1.5"><span className="w-5 border-t-[3px] border-primary" />Battery charge</span>
        <span className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-warn" />Reserve</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 bg-[#2F6A91]" />Rain (dark: &gt; 10 mm/h)</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 bg-warn" />Dark (load not met)</span>
      </figcaption>
    </figure>
  )
}
