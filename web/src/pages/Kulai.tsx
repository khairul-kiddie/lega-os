import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Kpi, PageHeader, SampleNote, Segmented } from '../components/ui'
import { fmt, useJson } from '../lib/data'
import {
  DEFAULT_SETTINGS,
  needle,
  plotResult,
  totals,
  type HouseType,
  type Layout,
  type Lookup,
  type RoofForm,
  type Settings,
} from '../lib/kulai'
import { assetStore, evaluate, newAsset, type Asset, type PlannerData } from '../lib/planner'

const FORM_LABEL: Record<RoofForm, string> = { gable: 'Gable', hip: 'Hip', flat: 'Flat / low', mono: 'Mono-pitch (one face)' }
const EFF_LO = 0.85

/** 85% or less = rust, ~93% = amber, 100% = green. */
function effColor(e: number) {
  const f = Math.max(0, Math.min(1, (e - EFF_LO) / (1 - EFF_LO)))
  const [a, b, t] = f < 0.55 ? [[194, 80, 42], [242, 179, 61], f / 0.55] : [[242, 179, 61], [31, 111, 87], (f - 0.55) / 0.45]
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`
}
const COMMUNITY_ICON: Record<string, string> = { school: 'S', hall: 'P', surau: 'M', battery: 'B' }

export default function Kulai() {
  const { data: l, error } = useJson<Layout>('kulai_layout.json')
  const { data: lk } = useJson<Lookup>('orientation_lookup.json')
  const { data: pd } = useJson<PlannerData>('load_profiles.json')
  if (error) return <p className="text-warn">Could not load the Kulai layout: {error}</p>
  if (!l || !lk || !pd) return <p className="text-muted">Loading…</p>
  return <Planner l={l} lk={lk} pd={pd} />
}

function Planner({ l, lk, pd }: { l: Layout; lk: Lookup; pd: PlannerData }) {
  const [s, setS] = useState<Settings>(() => DEFAULT_SETTINGS(l))
  const [flood, setFlood] = useState(true)
  const [colorBy, setColorBy] = useState<'eff' | 'kwh'>('eff')
  const [sent, setSent] = useState<number | null>(null)
  const set = (patch: Partial<Settings>) => setS((x) => ({ ...x, ...patch }))

  const results = useMemo(() => new Map(l.plots.map((p) => [p.id, plotResult(p, l, lk, s)])), [l, lk, s])
  const levers = useMemo(() => needle(l, lk, s), [l, lk, s])
  const all = useMemo(() => totals(l.plots, l, lk, s), [l, lk, s])
  const atZero = useMemo(() => totals(l.plots, l, lk, { ...s, rotation: 0 }).kwh, [l, lk, s])
  const rotDelta = ((all.kwh - atZero) / atZero) * 100
  const effs = [...results.values()].map((r) => r.efficiency)
  const maxKwh = Math.max(...[...results.values()].map((r) => r.kwh))
  const minKwh = Math.min(...[...results.values()].map((r) => r.kwh))

  // shared PPS battery: Feature A formula on the PPS plot
  const pps = l.community.find((c) => c.type === 'hall')
  const ppsAsset: Asset | null = pps ? { ...newAsset('hall', pd.profiles.hall, 'kulai'), name: pps.name, goal: 'both', backupHours: 48, ownRoofKwp: pps.footprint_m2 * 0.45 * 0.2 } : null
  const ppsPlan = ppsAsset ? evaluate(ppsAsset, pd, 40) : null

  const sendPhase = (phase: number) => {
    const existing = new Set((assetStore.get() ?? []).map((a) => a.id))
    const add: Asset[] = l.community
      .filter((c) => c.phase === phase && c.type !== 'battery' && !existing.has(`kulai-${c.id}`))
      .map((c) => {
        const type = c.type as Asset['type']
        const base = newAsset(type, pd.profiles[type], 'kulai')
        return { ...base, id: `kulai-${c.id}`, name: c.name, ownership: 'sdp', floodZone: c.flood_zone, goal: c.type === 'hall' ? 'both' : base.goal,
          ownRoofKwp: Math.round(c.footprint_m2 * 0.45 * 0.2) }
      })
    assetStore.set((list) => [...add, ...(list ?? [])])
    setSent(add.length)
  }

  const W = l.site.w, H = l.site.h
  const color = (kwh: number) => {
    const f = maxKwh > minKwh ? (kwh - minKwh) / (maxKwh - minKwh) : 1
    const c = (a: number, b: number) => Math.round(a + (b - a) * f)
    return `rgb(${c(251, 31)},${c(235, 111)},${c(211, 87)})`
  }
  const types = Object.keys(l.house_types) as HouseType[]

  return (
    <>
      <PageHeader eyebrow="Design stage · Kulai, Johor" title="Plan a new township"
        subtitle={`Solar-ready planning for SDP’s Kulai township (about ${l.site.acres} acres, first phase ${l.site.first_phase}) before anything is built. No imagery yet, so the input is a layout plan.`} />
      <p className="mb-5 rounded-lg border border-amber/60 bg-amber-soft px-4 py-3 text-sm">{l.note} Yields are real: NASA POWER hourly weather for Kulai with pvlib.</p>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Homes" value={fmt(all.homes)} hint={`${l.phases.length} phases`} />
        <Kpi label="Rooftop solar" value={fmt(all.kwh / 1e6, 2)} unit="GWh / yr" hint={`${fmt(all.kwp)} kWp · ${fmt(all.panels)} panels`} />
        <Kpi label="Homes bill-neutral" value={`${Math.round((all.neutral / all.homes) * 100)}%`} hint={`${fmt(all.neutral)} of ${fmt(all.homes)} make what they use`} />
        <Kpi label="CO₂ avoided" value={fmt((all.kwh / 1000) * l.grid_t_co2_per_mwh)} unit="t / yr" hint={`at ${l.grid_t_co2_per_mwh} t/MWh (Energy Commission 2024)`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="card p-4" aria-labelledby="map-h">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
            <h2 id="map-h" className="text-lg font-semibold">Layout · coloured by {colorBy === 'eff' ? 'roof efficiency' : 'solar per home'}</h2>
            <div className="flex flex-wrap items-center gap-3">
            <Segmented label="Colour by" value={colorBy} onChange={setColorBy} options={[{ id: 'eff', label: 'Roof efficiency' }, { id: 'kwh', label: 'Solar per home' }]} />
            <label className="flex min-h-touch items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-primary" checked={flood} onChange={(e) => setFlood(e.target.checked)} />Flood zone
            </label>
            </div>
          </div>
          <svg viewBox={`-6 -24 ${W + 12} ${H + 30}`} className="w-full rounded-lg bg-[#EEF1EA]" role="img" aria-label="Kulai sample layout with plots coloured by yearly solar">
            {flood && (
              <g>
                <rect x={0} y={H - l.site.flood_y} width={W} height={l.site.flood_y} fill="#9CC5E0" opacity={0.45} />
                <path d={`M0 ${H - 25} C ${W * 0.3} ${H - 55}, ${W * 0.6} ${H + 5}, ${W} ${H - 35}`} stroke="#4C8DB8" strokeWidth={9} fill="none" opacity={0.7} />
                <text x={12} y={H - l.site.flood_y + 14} fontSize={10} fill="#2F6A91" stroke="#DCEBF4" strokeWidth={3} paintOrder="stroke">Flood-risk strip (sample)</text>
              </g>
            )}
            {l.phases.map((p) => (
              <g key={p.id}>
                <rect x={p.x[0] - 4} y={6} width={p.x[1] - p.x[0] + 8} height={H - 12} fill="none" stroke="#5B655F" strokeDasharray="6 5" strokeWidth={1.2} />
                <text x={p.x[0] - 2} y={-6} fontSize={13} fontWeight={600} fill="#15201B">{p.name}</text>
              </g>
            ))}
            {l.plots.map((p) => {
              const r = results.get(p.id)!
              return (
                <rect key={p.id} x={p.x - p.w / 2} y={H - p.y - p.d / 2} width={p.w} height={p.d} fill={colorBy === 'eff' ? effColor(r.efficiency) : color(r.kwh)}
                  stroke={r.loss > 0 ? '#A33A12' : '#FFFFFF'} strokeWidth={r.loss > 0 ? 1.6 : 0.6} transform={`rotate(${-s.rotation} ${p.x} ${H - p.y})`}>
                  <title>{`${l.house_types[p.type].label} · ${s.forms[p.type]} roof · ${Math.round(r.efficiency * 1000) / 10}% of the best roof · ${fmt(r.kwp, 1)} kWp · ${fmt(r.kwh)} kWh/yr${r.loss ? ` · ${Math.round(r.loss * 100)}% shaded` : ''} · ${r.neutral ? 'bill-neutral' : 'not bill-neutral'}`}</title>
                </rect>
              )
            })}
            {l.community.map((c) => (
              <g key={c.id}>
                <rect x={c.x - c.w / 2} y={H - c.y - c.d / 2} width={c.w} height={c.d} fill={c.flood_zone && flood ? '#A33A12' : '#15201B'} rx={4} />
                <text x={c.x} y={H - c.y + 5} fontSize={12} textAnchor="middle" fill="#FFFFFF" fontWeight={700}>{COMMUNITY_ICON[c.type]}</text>
                <text x={c.x} y={c.type === 'battery' ? H - c.y - c.d / 2 - 4 : H - c.y + c.d / 2 + 11} fontSize={9} textAnchor="middle"
                  fill="#15201B" stroke="#EEF1EA" strokeWidth={3} paintOrder="stroke">{c.type === 'battery' ? 'Shared battery' : c.name.replace(' Sample', '')}</text>
              </g>
            ))}
          </svg>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 px-1 text-sm text-muted">
            {colorBy === 'eff' ? (
              <span className="flex items-center gap-1.5"><span className="h-3 w-16 rounded-sm" style={{ background: `linear-gradient(90deg,${effColor(0.85)},${effColor(0.93)},${effColor(1)})` }} />≤ 85% → 100% of the best roof in Kulai (now {fmt(Math.min(...effs) * 100, 1)}–{fmt(Math.max(...effs) * 100, 1)}%)</span>
            ) : (
              <span className="flex items-center gap-1.5"><span className="h-3 w-10 rounded-sm" style={{ background: 'linear-gradient(90deg,#FBEBD3,#1F6F57)' }} />{fmt(minKwh)} → {fmt(maxKwh)} kWh/yr per home (mostly house size)</span>
            )}
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 border-2 border-warn" />Shaded by a taller neighbour</span>
            <span>S school · P evacuation centre (PPS) · M surau · B shared battery</span>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="card p-5" aria-labelledby="ctl-h">
            <h2 id="ctl-h" className="font-semibold">Design levers</h2>
            <label htmlFor="rot" className="mt-4 flex justify-between text-sm font-medium">Street grid rotation <span className="num">{s.rotation}°</span></label>
            <input id="rot" type="range" min={0} max={90} step={5} value={s.rotation} onChange={(e) => set({ rotation: Number(e.target.value) })} className="mt-1 w-full accent-primary" />
            <p className="mt-1 text-xs text-muted" aria-live="polite">
              Township solar <span className="num text-ink">{fmt(all.kwh / 1e6, 3)} GWh</span>, <span className="num text-ink">{rotDelta >= 0 ? '+' : ''}{fmt(rotDelta, 2)}%</span> vs 0°.
              {' '}Gable and hip roofs face both ways, so turning them barely matters; set a house type to <span className="font-medium text-ink">Mono-pitch</span> to see direction matter.
            </p>
            <label htmlFor="pitch" className="mt-4 flex justify-between text-sm font-medium">Roof pitch (pitched roofs) <span className="num">{s.pitch === null ? 'type default' : `${s.pitch}°`}</span></label>
            <input id="pitch" type="range" min={10} max={35} step={5} value={s.pitch ?? 20} onChange={(e) => set({ pitch: Number(e.target.value) })} className="mt-1 w-full accent-primary" />
            <div className="mt-4 space-y-2">
              {types.map((t) => (
                <div key={t} className="flex items-center justify-between gap-2 text-sm">
                  <span>{l.house_types[t].label}</span>
                  <select aria-label={`Roof form for ${l.house_types[t].label}`} className="input !min-h-[36px] !w-auto !py-1" value={s.forms[t]}
                    onChange={(e) => set({ forms: { ...s.forms, [t]: e.target.value as RoofForm } })}>
                    {(Object.keys(FORM_LABEL) as RoofForm[]).map((f) => <option key={f} value={f}>{FORM_LABEL[f]}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <label className="mt-4 flex min-h-touch items-center gap-3 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-primary" checked={s.solarReady} onChange={(e) => set({ solarReady: e.target.checked })} />Solar-ready construction
            </label>
            <label className="flex min-h-touch items-center gap-3 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-primary" checked={s.avoidWestShops} onChange={(e) => set({ avoidWestShops: e.target.checked })} />Avoid tall shophouses west of terraces
            </label>
            <button type="button" className="btn-ghost mt-2 w-full justify-center" onClick={() => setS(DEFAULT_SETTINGS(l))}>Reset</button>
          </section>

          <section className="card p-5" aria-labelledby="needle-h">
            <h2 id="needle-h" className="font-semibold">What actually moves the needle</h2>
            <ul className="mt-3 space-y-3">
              {levers.map((v) => (
                <li key={v.id}>
                  <div className="flex justify-between text-sm"><span>{v.label}</span><span className="num font-semibold">{v.pct >= 0 ? '+' : ''}{fmt(v.pct, Math.abs(v.pct) < 1 ? 2 : 1)}%</span></div>
                  <div className="mt-1 h-3 rounded-full bg-page">
                    <div className={`h-3 rounded-full ${v.id === 'rotation' ? 'bg-muted' : 'bg-primary'}`} style={{ width: `${Math.min(100, (Math.abs(v.pct) / Math.max(...levers.map((x) => Math.abs(x.pct)))) * 100)}%`, minWidth: 3 }} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm">
              Near the equator, direction barely matters: turning the whole street grid changes the township’s solar by about {fmt(levers[0].pct, 2)}%,
              because a pitched roof always has a face toward the sun. Roof shape and pitch matter far more.
            </p>
            <Link to="/insights?tab=orientation" className="mt-1 inline-flex min-h-touch items-center text-sm text-primary underline underline-offset-2">See the orientation study</Link>
          </section>
        </aside>
      </div>

      <section className="card mt-6 overflow-x-auto p-6" aria-labelledby="ph-h">
        <h2 id="ph-h" className="text-lg font-semibold">Township totals by phase</h2>
        <table className="mt-3 w-full text-[15px]">
          <thead className="border-b border-line text-left text-sm text-muted">
            <tr>
              <th scope="col" className="py-2 pr-3 font-medium">Phase</th><th scope="col" className="pr-3 font-medium">Homes</th>
              <th scope="col" className="pr-3 font-medium">Solar</th><th scope="col" className="pr-3 font-medium">Bill-neutral</th>
              <th scope="col" className="pr-3 font-medium">Panels</th><th scope="col" className="pr-3 font-medium">CO₂</th>
              <th scope="col" className="pr-3 font-medium">Retrofit cost avoided</th><th scope="col" className="pr-3 font-medium">Community out of flood zone</th>
              <th scope="col"><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            {l.phases.map((ph) => {
              const t = totals(l.plots.filter((p) => p.phase === ph.id), l, lk, s)
              const com = l.community.filter((c) => c.phase === ph.id && c.type !== 'battery')
              return (
                <tr key={ph.id} className="border-b border-line last:border-0">
                  <td className="py-3 pr-3 font-semibold">{ph.name}</td>
                  <td className="pr-3 num">{fmt(t.homes)}</td>
                  <td className="pr-3 num">{fmt(t.kwh / 1000)} MWh/yr</td>
                  <td className="pr-3 num">{Math.round((t.neutral / t.homes) * 100)}%</td>
                  <td className="pr-3 num">{fmt(t.panels)}</td>
                  <td className="pr-3 num">{fmt((t.kwh / 1000) * l.grid_t_co2_per_mwh)} t/yr</td>
                  <td className="pr-3 num">{s.solarReady ? `RM ${fmt((t.homes * l.retrofit_rm_per_home) / 1e6, 2)}m` : <span className="text-muted">turn on solar-ready</span>}</td>
                  <td className="pr-3">
                    {com.map((c) => <div key={c.id} className={`text-sm ${c.flood_zone ? 'text-warn' : ''}`}>{c.flood_zone ? '✗' : '✓'} {c.name.replace(' Sample', '')}</div>)}
                  </td>
                  <td className="py-2">{com.length > 0 && <button type="button" className="btn-ghost !min-h-[36px] whitespace-nowrap" onClick={() => sendPhase(ph.id)}>Send to planner</button>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {sent !== null && (
          <p className="mt-3 text-sm" role="status">{sent ? `Added ${sent} community building${sent > 1 ? 's' : ''} to the planner.` : 'Already in the planner.'} <Link to="/planner" className="text-primary underline underline-offset-2">Open the Community energy planner</Link></p>
        )}
        {ppsPlan && pps && (
          <p className="mt-4 rounded-lg bg-page px-4 py-3 text-sm">
            Suggested shared battery for <span className="font-semibold">{pps.name}</span>: <span className="num font-semibold">{fmt(ppsPlan.battery_kwh)} kWh</span> with {fmt(ppsPlan.kwp, 1)} kWp,
            for 48 hours of evacuation-centre backup (same formula as the planner). {ppsPlan.wettest_week_ok ? 'Lasts the wettest week.' : `In a P90 wettest week it lasts about ${fmt(ppsPlan.wettest_week_hours)} hours.`}
          </p>
        )}
        <p className="mt-3 text-xs text-muted">
          kWp = footprint × usable roof share (gable 45%, hip 30%, flat 60%) × 0.2 kWp/m². Shading (sample rule): a neighbour ≥ 3 m taller within 8 m to the east or west costs 10–20%.
          Home use: terrace {fmt(l.house_types.terrace.use_kwh)}, semi-D {fmt(l.house_types.semid.use_kwh)}, shophouse {fmt(l.house_types.shophouse.use_kwh)} kWh/yr (sample). Retrofit cost avoided: sample RM {fmt(l.retrofit_rm_per_home)} per home.
        </p>
      </section>
      <div className="mt-4"><SampleNote>Sample layout, house loads and costs. Replace with SDP’s Kulai masterplan (CAD/GIS export).</SampleNote></div>
    </>
  )
}
