import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Kpi, PageHeader, Segmented } from '../components/ui'
import { newPortfolio, portfolioStore } from '../lib/portfolio'
import SiteMap, { MapLegend, ZoneCrop } from '../components/SiteMap'
import SatMap, { SAT_COLORS, type ScanSweep } from '../components/SatMap'
import TownshipsMap from '../components/TownshipsMap'
import { fmt, scoreBand, SITE_LABEL, TYPE_PLURAL, useJson } from '../lib/data'
import type { Roof, RoofsData, ScorePart, Site, SiteKey, Zone } from '../lib/data'
import { groupName, leaseItem, leaseItemSat, leasingStore, shortlistStore, useStore } from '../lib/store'
import {
  CLASS_SHORT,
  groupScanned,
  isHome,
  loadRoofs,
  markScanned,
  scannedStore,
  townshipGroups,
  type RoofClass,
  type SatRoof,
  type TownshipGroup,
  type TownshipIndex,
  type TownshipMeta,
} from '../lib/townships'

type View = 'sat' | 'plan'

/**
 * Roof map, three levels:
 *   /map                      Level 0: every SDP township on one map
 *   /map?t=<id>&scan=1        scan replay for one township
 *   /map?t=<id>[&site=][&view=][&zone=]   Level 1: one township (and Level 2: one master-plan zone)
 */
export default function RoofMap() {
  const { data: index, error } = useJson<TownshipIndex>('townships/index.json')
  const { data: plan } = useJson<RoofsData>('roofs.json')
  const [params, setParams] = useSearchParams()
  const scanned = useStore(scannedStore)
  const groups = useMemo(() => (index ? townshipGroups(index) : []), [index])

  if (error) return <p className="text-warn">Could not load townships: {error}</p>
  if (!index) return <p className="text-muted">Loading townships…</p>

  const group = groups.find((g) => g.id === params.get('t'))
  if (!group) return <AllTownships index={index} groups={groups} scanned={scanned} selected={params.get('sel')} onPick={(id) => setParams({ sel: id }, { replace: true })} />
  if (params.get('scan')) return <ScanView group={group} onDone={() => setParams({ t: group.id })} onCancel={() => setParams({ sel: group.id })} />

  // Business park first in the toggle, then homes
  const sites = [...group.sites].sort((a, b) => Number(!!b.master_plan) - Number(!!a.master_plan))
  const site = sites.find((m) => m.id === params.get('site')) ?? sites[0]
  const view: View = site.master_plan && params.get('view') !== 'sat' ? 'plan' : 'sat'
  const zoneId = params.get('zone')
  const go = (next: { site?: string; view?: View; zone?: string | null }) => {
    const p = new URLSearchParams({ t: group.id })
    const sid = next.site ?? site.id
    if (sid !== sites[0].id) p.set('site', sid)
    const target = sites.find((m) => m.id === sid)!
    const v = next.view ?? (next.site ? 'plan' : view)
    if (target.master_plan && v === 'sat') p.set('view', 'sat')
    const z = next.zone === undefined ? zoneId : next.zone
    if (z && target.master_plan && v === 'plan') p.set('zone', z)
    setParams(p)
  }

  if (view === 'plan' && plan && zoneId) {
    const zone = plan.sites.business_park.zones.find((z) => z.id === zoneId)
    if (zone) return <ZoneView data={plan} site={plan.sites.business_park} siteKey="business_park" zone={zone} onBack={() => go({ zone: null })} />
  }

  return (
    <TownshipView
      group={group}
      sites={sites}
      site={site}
      view={view}
      scanned={groupScanned(group, scanned)}
      index={index}
      plan={plan}
      go={go}
      onAll={() => setParams({ sel: group.id })}
      onScan={() => setParams({ t: group.id, scan: '1' })}
      initialRoof={params.get('roof')}
    />
  )
}

function useBuildPortfolio() {
  const navigate = useNavigate()
  return () => {
    const p = newPortfolio()
    portfolioStore.set((l) => [p, ...l])
    navigate(`/portfolio/${p.id}/details`)
  }
}

/* ---------------- Level 0: all townships ---------------- */

function AllTownships({ index, groups, scanned, selected, onPick }: { index: TownshipIndex; groups: TownshipGroup[]; scanned: string[]; selected: string | null; onPick: (id: string) => void }) {
  const [, setParams] = useSearchParams()
  const build = useBuildPortfolio()
  const isScanned = useMemo(() => (g: TownshipGroup) => groupScanned(g, scanned), [scanned])
  const sel = groups.find((g) => g.id === selected) ?? groups[0]
  const done = groups.filter(isScanned)
  const num = (g: TownshipGroup) => groups.indexOf(g) + 1

  return (
    <>
      <PageHeader
        eyebrow="All SDP townships"
        title="Roof map"
        subtitle="Every SDP township on one map · pick one to scan or open its results · roof scores are sample data"
        right={<button type="button" className="btn-primary !text-base" onClick={build}>Build portfolio</button>}
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Townships" value={groups.length} />
        <Kpi label="Scanned" value={done.length} unit={`of ${groups.length}`} />
        <Kpi label="Roofs scored" value={fmt(done.reduce((a, g) => a + g.solarReady, 0))} />
        <Kpi label="Potential so far" value={fmt(done.reduce((a, g) => a + g.mwh, 0) / 1000, 1)} unit="GWh/yr" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="card p-5" aria-label="Township map">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">SDP townships · Klang Valley, Negeri Sembilan and Johor</h2>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Map legend">
              <li className="flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-full bg-primary" />Scanned</li>
              <li className="flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-full border-2 border-dashed border-ink bg-card" />Not scanned yet</li>
            </ul>
          </div>
          <TownshipsMap groups={groups} scanned={isScanned} selectedId={sel.id} onSelect={(g) => onPick(g.id)} />
          <p className="mt-3 text-sm text-muted">{index.list_note} Building counts: {index.source}.</p>
        </section>

        <aside className="space-y-6">
          <SelectedTownship
            g={sel}
            n={num(sel)}
            scanned={isScanned(sel)}
            onOpen={() => setParams({ t: sel.id })}
            onScan={() => setParams({ t: sel.id, scan: '1' })}
          />

          <section className="card p-6" aria-labelledby="all-h">
            <h2 id="all-h" className="text-lg font-semibold">All townships</h2>
            <ol className="mt-3 divide-y divide-line">
              {groups.map((g) => (
                <li key={g.id}>
                  <button type="button" onClick={() => onPick(g.id)} aria-current={g.id === sel.id}
                    className={`flex min-h-touch w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-page ${g.id === sel.id ? 'bg-page' : ''}`}>
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold num ${isScanned(g) ? 'bg-primary text-white' : 'border-2 border-dashed border-ink'}`}>{num(g)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{g.name}</span>
                      <span className="block text-xs text-muted">{g.state}</span>
                    </span>
                    <span className="text-xs text-muted">{isScanned(g) ? `${fmt(g.good)} good roofs` : 'Not scanned'}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>

          <OtherArea />
        </aside>
      </div>
    </>
  )
}

function SelectedTownship({ g, n, scanned, onOpen, onScan }: { g: TownshipGroup; n: number; scanned: boolean; onOpen: () => void; onScan: () => void }) {
  return (
    <section className="card p-6" aria-labelledby="sel-h" aria-live="polite">
      <p className="text-sm text-muted">Township {n} · {g.state}</p>
      <h2 id="sel-h" className="text-xl font-semibold">{g.name}</h2>
      {g.sites.length > 1 && <p className="text-sm text-muted">{g.sites.map((m) => m.site).join(' + ')}</p>}
      {scanned ? (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            <Stat label="Roofs scored" value={fmt(g.solarReady)} />
            <Stat label="Good roofs (75+)" value={fmt(g.good)} />
            <Stat label="Potential" value={`${fmt(g.mwh / 1000, 1)} GWh/yr`} />
            <Stat label="Yield" value={`${fmt(g.sites[0].summary.yield_kwh_kwp)} kWh/kWp`} />
          </dl>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button type="button" className="btn-primary" onClick={onOpen}>Open results</button>
            <button type="button" className="btn-ghost" onClick={onScan}>Re-scan</button>
          </div>
        </>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            <Stat label="Expected buildings" value={`≈ ${fmt(g.buildings)}`} />
            <Stat label="Scan time" value="≈ 6 s replay" />
          </dl>
          <p className="mt-2 text-xs text-muted">Building count from open footprint data. The prototype replays a precomputed scan.</p>
          <button type="button" className="btn-primary mt-5 w-full !text-base" onClick={onScan}>Scan {g.name}</button>
        </>
      )}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num text-lg font-medium">{value}</dd>
    </div>
  )
}

function OtherArea() {
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const v = q.trim()
    if (!v) return setMsg({ ok: false, text: 'Enter a place name or coordinates, e.g. 3.15, 101.6.' })
    const m = v.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
    if (m && (Math.abs(+m[1]) > 90 || Math.abs(+m[2]) > 180)) return setMsg({ ok: false, text: 'Coordinates look out of range. Use latitude, longitude.' })
    setMsg({
      ok: true,
      text: `Scanning “${v}” needs the production scanner (roadmap). This prototype only bundles footprints for the listed townships.`,
    })
  }
  return (
    <section className="card p-6" aria-labelledby="other-h">
      <h2 id="other-h" className="text-lg font-semibold">Scan any other area</h2>
      <form className="mt-3" onSubmit={submit} noValidate>
        <label htmlFor="area-q" className="text-sm">Place name or coordinates</label>
        <input id="area-q" className="input mt-1" placeholder="e.g. Bandar Bukit Raja or 3.10, 101.44" value={q}
          onChange={(e) => { setQ(e.target.value); setMsg(null) }}
          aria-invalid={msg ? !msg.ok : undefined} aria-describedby="area-msg" />
        <p id="area-msg" role={msg && !msg.ok ? 'alert' : 'status'} className={`mt-1 min-h-[1.25rem] text-sm ${msg?.ok ? 'text-muted' : 'text-warn'}`}>{msg?.text}</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="submit" className="btn-primary">Scan area</button>
          <button type="button" className="btn-ghost" onClick={() => setMsg({ ok: true, text: 'Drawing a custom area is on the roadmap.' })}>Draw area</button>
        </div>
      </form>
    </section>
  )
}

/* ---------------- Scan replay ---------------- */

const SCAN_MS = 6000
const TILES = 48 // 8 × 6 imagery tiles over the map
const STEPS = [
  { from: 0, to: 0.15, title: 'Fetch imagery', source: 'Sentinel-2 + high-res tiles, or an SDP drone survey · prototype: Esri World Imagery' },
  { from: 0.15, to: 0.5, title: 'Detect buildings', source: 'GeoAI segmentation, checked against Microsoft and Google open building footprints · prototype: Overture buildings (OpenStreetMap + Google + Microsoft), clipped to the township outline' },
  { from: 0.5, to: 0.62, title: 'Estimate heights and shading', source: 'Google Open Buildings 2.5D + sun path · prototype: sample shading' },
  { from: 0.62, to: 0.76, title: 'Simulate yield', source: 'pvlib + NASA POWER weather for this township (real)' },
  { from: 0.76, to: 1, title: 'Score every roof', source: '40% yield · 20% shading · 20% roof condition · 20% likelihood to sign' },
]
const frac = (k: number, i: number) => Math.min(1, Math.max(0, (k - STEPS[i].from) / (STEPS[i].to - STEPS[i].from)))

// deterministic reveal order for the imagery tiles
const TILE_ORDER = Array.from({ length: TILES }, (_, i) => i).sort((a, b) => ((a * 37) % TILES) - ((b * 37) % TILES))
const TILE_RANK = TILE_ORDER.reduce<number[]>((acc, t, r) => ((acc[t] = r), acc), [])

function ScanView({ group, onDone, onCancel }: { group: TownshipGroup; onDone: () => void; onCancel: () => void }) {
  const [roofs, setRoofs] = useState<SatRoof[] | null>(null)
  const [k, setK] = useState(0)
  const raf = useRef(0)

  // one frame for the whole township, covering all its sites
  const meta: TownshipMeta = useMemo(() => {
    const b = group.sites.map((m) => m.bbox)
    const bbox: TownshipMeta['bbox'] = [Math.min(...b.map((x) => x[0])), Math.max(...b.map((x) => x[1])), Math.min(...b.map((x) => x[2])), Math.max(...b.map((x) => x[3]))]
    return { ...group.sites[0], bbox, outline: group.sites.flatMap((m) => m.outline) }
  }, [group])

  useEffect(() => {
    let live = true
    Promise.all(group.sites.map((m) => loadRoofs(m.id))).then((all) => {
      if (!live) return
      setRoofs(all.flat())
      const ms = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1500 : SCAN_MS
      const t0 = performance.now()
      const tick = (t: number) => {
        const v = Math.min(1, (t - t0) / ms)
        setK(v)
        if (v < 1) raf.current = requestAnimationFrame(tick)
        else markScanned(...group.sites.map((m) => m.id))
      }
      raf.current = requestAnimationFrame(tick)
    })
    return () => {
      live = false
      cancelAnimationFrame(raf.current)
    }
  }, [group])

  const done = k >= 1
  const sweep: ScanSweep | null = done ? null : { detect: frac(k, 1), score: frac(k, 4) }
  const counters = [
    `${Math.round(frac(k, 0) * TILES)} / ${TILES} tiles loaded`,
    `${fmt(Math.round(frac(k, 1) * group.buildings))} buildings found`,
    `${fmt(Math.round(frac(k, 2) * group.solarReady))} roofs checked (≥ 3 kWp)`,
    `${fmt((frac(k, 3) * group.mwh) / 1000, 1)} GWh/yr simulated · ${fmt(group.sites[0].summary.yield_kwh_kwp)} kWh/kWp`,
    `${fmt(Math.round(frac(k, 4) * group.good))} good roofs (score 75+)`,
  ]
  const tilesShown = Math.round(frac(k, 0) * TILES)

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-sm">
        <button type="button" onClick={onCancel} className="btn-ghost"><span aria-hidden="true">←</span> All townships</button>
        <span className="text-muted">/ {group.name} / scan</span>
      </nav>
      <PageHeader
        eyebrow={`${group.name}, ${group.state}`}
        title={done ? 'Scan complete' : `Scanning ${group.name}…`}
        subtitle="Prototype: this replays a precomputed scan in about 6 seconds. Footprints and yield are real; shading, roof condition and owner data are sample data."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="card p-5" aria-label="Aerial scan">
          <div className="relative">
            <SatMap meta={meta} roofs={roofs ?? []} scan={sweep} selectedId={null} onSelect={() => {}} focusKey={0} height="h-[560px]" />
            <div className="pointer-events-none absolute inset-0 z-[450] grid grid-cols-8 grid-rows-6 overflow-hidden rounded-lg" aria-hidden="true">
              {Array.from({ length: TILES }, (_, i) => (
                <span key={i} className="border border-white/5 bg-[#1b221e] transition-opacity duration-300" style={{ opacity: TILE_RANK[i] < tilesShown ? 0 : 1 }} />
              ))}
            </div>
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Map legend">
            <li className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm border border-ink/40 bg-white" />Detected outline</li>
            <li className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm" style={{ background: SAT_COLORS.good }} />Score 75+</li>
            <li className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm" style={{ background: SAT_COLORS.fair }} />55–74</li>
            <li className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm" style={{ background: SAT_COLORS.poor }} />Below 55</li>
          </ul>
        </section>

        <aside className="space-y-6">
          {done && (
            <section className="card border-primary/40 p-6" aria-labelledby="sum-h" role="status">
              <h2 id="sum-h" className="text-lg font-semibold">{group.name}: scan summary</h2>
              <dl className="mt-3 grid grid-cols-2 gap-3">
                <Stat label="Buildings found" value={fmt(group.buildings)} />
                <Stat label="Roofs scored" value={fmt(group.solarReady)} />
                <Stat label="Good roofs (75+)" value={fmt(group.good)} />
                <Stat label="Potential" value={`${fmt(group.mwh / 1000, 1)} GWh/yr`} />
              </dl>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button type="button" className="btn-primary" onClick={onDone}>View results</button>
                <button type="button" className="btn-ghost" onClick={onCancel}>All townships</button>
              </div>
            </section>
          )}
          <section className="card p-6" aria-labelledby="prog-h">
            <div className="flex items-baseline justify-between">
              <h2 id="prog-h" className="text-lg font-semibold">{done ? 'All five steps done' : 'Scan progress'}</h2>
              <span className="num text-sm">{Math.round(k * 100)}%</span>
            </div>
            <div className="mt-2 h-2.5 rounded-full bg-page" role="progressbar" aria-label="Scan progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(k * 100)}>
              <div className="h-2.5 rounded-full bg-primary" style={{ width: `${k * 100}%` }} />
            </div>
            <ol className="mt-5 space-y-4">
              {STEPS.map((s, i) => {
                const f = frac(k, i)
                const state = f >= 1 ? 'done' : f > 0 ? 'active' : 'waiting'
                return (
                  <li key={s.title} className="flex gap-3">
                    <span aria-hidden="true" className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${state === 'done' ? 'bg-primary text-white' : state === 'active' ? 'border-2 border-primary text-primary' : 'border border-line text-muted'}`}>
                      {state === 'done' ? '✓' : i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className={`font-medium ${state === 'waiting' ? 'text-muted' : ''}`}>{s.title}<span className="sr-only"> ({state})</span></p>
                      <p className="num text-sm">{state === 'waiting' ? '—' : counters[i]}</p>
                      <p className="text-xs text-muted">{s.source}</p>
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>

        </aside>
      </div>
    </>
  )
}

/* ---------------- Level 1: one township ---------------- */

function TownshipView({ group, sites, site, view, scanned, index, plan, go, onAll, onScan, initialRoof }: {
  group: TownshipGroup; sites: TownshipMeta[]; site: TownshipMeta; view: View; scanned: boolean; index: TownshipIndex; plan: RoofsData | null
  go: (next: { site?: string; view?: View; zone?: string | null }) => void; onAll: () => void; onScan: () => void; initialRoof: string | null
}) {
  const build = useBuildPortfolio()
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-sm">
        <button type="button" onClick={onAll} className="btn-ghost"><span aria-hidden="true">←</span> All townships</button>
        <span className="text-muted">/ {group.name}{sites.length > 1 ? ` / ${site.site}` : ''}</span>
      </nav>
      <PageHeader
        eyebrow={`${group.name}, ${group.state}`}
        title="Roof map"
        subtitle={view === 'sat' ? 'Every rooftop found in the satellite scan, coloured by score · click a roof · scores are sample data' : 'SDP master plan with planned zones · click a zone to zoom in · sample data'}
        right={
          <>
            {sites.length > 1 && (
              <Segmented label="Site" value={site.id} onChange={(id) => go({ site: id, zone: null })} options={sites.map((m) => ({ id: m.id, label: m.site ?? m.name }))} />
            )}
            {site.master_plan && (
              <Segmented label="View" value={view} onChange={(v) => go({ view: v, zone: null })} options={[{ id: 'plan', label: 'Master plan' }, { id: 'sat', label: 'Satellite scan' }]} />
            )}
            <button type="button" className="btn-primary !text-base" onClick={build}>Build portfolio</button>
          </>
        }
      />
      {view === 'plan' ? (
        plan ? <MasterPlan site={plan.sites.business_park} onZone={(z) => go({ zone: z.id })} /> : <p className="text-muted">Loading master plan…</p>
      ) : (
        <SatelliteView key={site.id} meta={site} scanned={scanned} onScan={onScan} source={index.source} minKwp={index.min_kwp} initialRoof={initialRoof} />
      )}
    </>
  )
}

/* ---------------- Satellite results ---------------- */

type Filter = 'all' | 'homes' | 'medium' | 'large'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All roofs' },
  { id: 'homes', label: 'Homes' },
  { id: 'medium', label: 'Mid-size' },
  { id: 'large', label: 'Factories' },
]
const matches = (f: Filter, c: RoofClass) => f === 'all' || (f === 'homes' ? isHome(c) : c === f)

function SatelliteView({ meta, scanned, onScan, source, minKwp, initialRoof }: { meta: TownshipMeta; scanned: boolean; onScan: () => void; source: string; minKwp: number; initialRoof: string | null }) {
  const [roofs, setRoofs] = useState<SatRoof[] | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [goodOnly, setGoodOnly] = useState(false)
  const [selected, setSelected] = useState<SatRoof | null>(null)
  const [focusKey, setFocusKey] = useState(0)

  useEffect(() => {
    if (!scanned) return
    let live = true
    loadRoofs(meta.id).then((rs) => {
      if (!live) return
      setRoofs(rs)
      const r = initialRoof ? rs.find((x) => x.id === initialRoof) : undefined
      if (r) {
        setSelected(r)
        // wait a frame so the polygons exist before flying
        requestAnimationFrame(() => setFocusKey((k) => k + 1))
      }
    })
    return () => {
      live = false
    }
  }, [scanned, meta.id, initialRoof])

  const shown = useMemo(() => (roofs ?? []).filter((r) => matches(filter, r.cls) && (!goodOnly || r.score >= 75)), [roofs, filter, goodOnly])
  const top = useMemo(() => [...shown].sort((a, b) => b.score - a.score || b.kwp - a.kwp).slice(0, 7), [shown])
  const s = meta.summary
  const done = scanned && !!roofs
  const select = (r: SatRoof, fly = false) => {
    setSelected(r)
    if (fly) setFocusKey((k) => k + 1)
  }

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Buildings detected" value={done ? fmt(s.buildings_detected) : '—'} />
        <Kpi label={`Solar-ready roofs (≥ ${minKwp} kWp)`} value={done ? fmt(s.solar_ready) : '—'} />
        <Kpi label="Good roofs (score 75+)" value={done ? fmt(s.good_roofs) : '—'} />
        <Kpi label="Solar potential" value={done ? fmt(s.mwh_yr / 1000, 1) : '—'} unit="GWh/yr" />
        <Kpi label="Owners to sign for 1 GWh" value={done ? (s.owners_for_1gwh ?? '—') : '—'} unit={done && s.owners_for_1gwh ? 'best roofs first' : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="card p-5" aria-label="Satellite map">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div role="group" aria-label="Roof type" className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" aria-pressed={filter === f.id} disabled={!done} onClick={() => setFilter(f.id)}
                  className={`min-h-touch rounded-full border px-4 text-sm ${filter === f.id ? 'border-ink bg-ink text-white' : 'border-line bg-card hover:bg-page'} disabled:opacity-50`}>
                  {f.label}
                </button>
              ))}
              <label className="flex min-h-touch cursor-pointer items-center gap-2 rounded-full border border-line px-4 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={goodOnly} disabled={!done} onChange={(e) => setGoodOnly(e.target.checked)} />
                Good roofs only
              </label>
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Map legend">
              <li className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm" style={{ background: SAT_COLORS.good }} />Score 75+</li>
              <li className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm" style={{ background: SAT_COLORS.fair }} />55–74</li>
              <li className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm" style={{ background: SAT_COLORS.poor }} />Below 55</li>
              <li className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-muted" />Township outline{meta.extent === 'approx' ? ' (approx. box)' : ''}</li>
            </ul>
          </div>
          <div className="relative">
            <SatMap meta={meta} roofs={shown} scan={null} selectedId={selected?.id ?? null} onSelect={(r) => select(r)} focusKey={focusKey} />
            {!scanned && (
              <div className="absolute inset-0 z-[500] grid place-items-center bg-ink/35 p-4">
                <div className="max-w-sm rounded-card bg-card p-6 text-center shadow-xl">
                  <p className="text-lg font-semibold">{meta.name} hasn’t been scanned yet</p>
                  <p className="mt-2 text-sm text-muted">
                    The scan finds every building in the satellite view, measures its roof, simulates yield on this township’s own weather, and scores it.
                  </p>
                  <button type="button" className="btn-primary mt-4 w-full !text-base" onClick={onScan}>Scan {meta.name}</button>
                </div>
              </div>
            )}
          </div>
          <p className="mt-3 text-sm text-muted">
            Imagery: Esri World Imagery. Roof outlines: {source}; only buildings inside the township outline count, and outlines reflect each
            source’s imagery date, so the newest construction may be missing. Township outline:{' '}
            {meta.extent === 'osm' ? 'OpenStreetMap boundary' : 'approximate box around the township centre (no mapped boundary)'}. Yield is real
            (pvlib on NASA POWER, {fmt(s.yield_kwh_kwp)} kWh/kWp/yr here); shading, roof condition and owner data are sample data.
          </p>
        </section>

        <aside className="space-y-6">
          {selected ? (
            <SatRoofPanel roof={selected} townshipName={meta.name} onClose={() => setSelected(null)} />
          ) : (
            <section className="card p-6" aria-labelledby="top-roofs">
              <h2 id="top-roofs" className="text-lg font-semibold">Best roofs to start with</h2>
              <p className="mt-2 text-[15px] text-muted">{done ? 'Click a roof on the map or below' : 'Scan the township to rank its roofs'}</p>
              {done && (
                <ol className="mt-4 space-y-3">
                  {top.map((r) => (
                    <li key={r.id}>
                      <button type="button" onClick={() => select(r, true)}
                        className="flex w-full items-center gap-4 rounded-card border border-line px-4 py-3 text-left hover:border-primary/50 hover:bg-page">
                        <ScoreBadge score={r.score} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{r.label}</span>
                          <span className="block text-sm text-muted">{fmt(r.area_m2)} m² roof{r.cls === 'terrace' ? ` · ≈${r.units} homes` : ''}</span>
                        </span>
                        <span className="num text-sm">{fmt(r.kwp, 0)} kWp</span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
          {done && (
            <section className="card p-6" aria-labelledby="mix-h">
              <h2 id="mix-h" className="text-lg font-semibold">What the scan found</h2>
              <ul className="mt-3 space-y-2 text-[15px]">
                {(Object.keys(CLASS_SHORT) as RoofClass[]).map((c) => (
                  <li key={c} className="flex justify-between"><span>{c === 'large' ? 'Factories / large flat roofs' : c === 'medium' ? 'Shophouses / mid-size' : c === 'terrace' ? 'Terrace rows' : 'Houses'}</span><span className="num">{fmt(s.by_class[c])}</span></li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">
                Roof type is estimated from footprint size and shape. Outlines from{' '}
                {Object.entries(s.by_source).map(([k, v]) => `${k} (${fmt(v)})`).join(', ')}.
              </p>
            </section>
          )}
          <p className="rounded-card bg-amber-soft px-5 py-4 text-[15px] leading-relaxed">
            Big flat roofs carry most of the potential: one factory roof can replace a whole street of homes. Homes spread the risk: losing one
            owner barely moves the total. Use the filters to compare.
          </p>
        </aside>
      </div>
    </>
  )
}

function SatRoofPanel({ roof, townshipName, onClose }: { roof: SatRoof; townshipName: string; onClose: () => void }) {
  const leasing = useStore(leasingStore)
  const shortlist = useStore(shortlistStore)
  const inLeasing = leasing.some((l) => l.roofId === roof.id)
  const inShortlist = shortlist.includes(roof.id)
  return (
    <section className="card p-6" aria-labelledby="sat-roof" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div>
          <button type="button" onClick={onClose} className="mb-2 min-h-[36px] text-sm text-primary underline underline-offset-2">← Best roofs</button>
          <h2 id="sat-roof" className="text-xl font-semibold">{roof.label}</h2>
          <p className="text-sm text-muted">{townshipName} · {roof.cls === 'terrace' ? `≈${roof.units} homes · ` : ''}{roof.owner}</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-semibold num">{roof.score}</div>
          <div className="text-xs text-muted">score / 100</div>
        </div>
      </div>
      <ul className="mt-4 space-y-2.5">
        {(Object.keys(PART_LABEL) as ScorePart[]).map((k) => (
          <li key={k}>
            <div className="flex justify-between text-xs"><span>{PART_LABEL[k]}{k === 'yield' ? '' : ' · sample'}</span><span className="num">{roof.parts[k]}</span></div>
            <div className="mt-1 h-2 rounded-full bg-page">
              <div className={`h-2 rounded-full ${roof.parts[k] >= 75 ? 'bg-primary' : roof.parts[k] >= 55 ? 'bg-amber' : 'bg-warn'}`} style={{ width: `${roof.parts[k]}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div><dt className="label">Roof area</dt><dd className="num">{fmt(roof.area_m2)} m²</dd></div>
        <div><dt className="label">System size</dt><dd className="num">{fmt(roof.kwp, 1)} kWp</dd></div>
        <div><dt className="label">Yield</dt><dd className="num">{fmt(roof.yield_kwh_kwp)} kWh/kWp</dd></div>
        <div><dt className="label">Energy</dt><dd className="num">{fmt(roof.mwh_yr, 1)} MWh/yr</dd></div>
      </dl>
      <p className="mt-3 text-sm">{roof.headline}</p>
      <p className="mt-1 text-xs text-muted">Roof outline: {roof.source}</p>
      <div className="mt-4 grid gap-2">
        <button type="button" className="btn-primary" disabled={inShortlist} onClick={() => shortlistStore.set((s) => [...s, roof.id])}>
          {inShortlist ? '✓ In portfolio shortlist' : 'Add to portfolio'}
        </button>
        <button type="button" className="btn-ghost" disabled={inLeasing} onClick={() => leasingStore.set((l) => [...l, leaseItemSat(roof, townshipName)])}>
          {inLeasing ? '✓ On leasing list' : 'Add to leasing list'}
        </button>
      </div>
    </section>
  )
}

/* ---------------- Master plan (Elmina Business Park) ---------------- */

function MasterPlan({ site, onZone }: { site: Site; onZone: (z: Zone) => void }) {
  const [hover, setHover] = useState<string | null>(null)
  const best = [...site.zones].sort((a, b) => b.summary.avg_score - a.summary.avg_score).slice(0, 7)
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <section className="card p-5" aria-label="Master plan">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Master plan · average roof score per planned zone</h2>
          <MapLegend />
        </div>
        <SiteMap site={site} onSelect={onZone} highlight={hover} />
        <p className="mt-3 text-sm text-muted">
          Base map: SDP master plan. Planned zones include buildings not yet visible in satellite imagery; zone roofs are sample data.
        </p>
      </section>
      <aside>
        <section className="card p-6" aria-labelledby="best-zones">
          <h2 id="best-zones" className="text-lg font-semibold">Best zones to start with</h2>
          <p className="mt-2 text-[15px] text-muted">Click a zone on the map or below to zoom in</p>
          <ol className="mt-4 space-y-3">
            {best.map((z) => (
              <li key={z.id}>
                <button type="button" onClick={() => onZone(z)} onMouseEnter={() => setHover(z.id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(z.id)} onBlur={() => setHover(null)}
                  className="flex w-full items-center gap-4 rounded-card border border-line px-4 py-3 text-left hover:border-primary/50 hover:bg-page">
                  <ScoreBadge score={z.summary.avg_score} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">Zone {z.id}</span>
                    <span className="block text-sm text-muted">{TYPE_PLURAL[z.type]} · {z.summary.n_roofs} roofs</span>
                  </span>
                  <span className="num text-sm">{fmt(z.summary.mwh_yr / 1000, 1)} GWh</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  )
}

function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 80 ? 'bg-primary text-white' : score >= 70 ? 'bg-amber text-ink' : 'border border-ink/40 bg-card text-ink'
  return <span className={`grid h-11 w-14 shrink-0 place-items-center rounded-lg text-lg font-semibold num ${cls}`}>{Math.round(score)}</span>
}

const TILE: Record<string, string> = {
  good: 'bg-primary text-white border-primary',
  fair: 'bg-amber text-ink border-amber',
  poor: 'bg-[#F6E1D8] text-warn border-warn/40',
}

const PART_LABEL: Record<ScorePart, string> = {
  yield: 'Solar yield',
  shading: 'Shade-free',
  condition: 'Roof condition',
  likelihood: 'Likelihood to sign',
}

function ZoneView({ data, site, siteKey, zone, onBack }: { data: RoofsData; site: Site; siteKey: SiteKey; zone: Zone; onBack: () => void }) {
  const [roofId, setRoofId] = useState<string>(() => [...zone.roofs].sort((a, b) => b.score - a.score)[0].id)
  const roof = zone.roofs.find((r) => r.id === roofId) ?? zone.roofs[0]
  const s = zone.summary

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-sm">
        <button type="button" onClick={onBack} className="btn-ghost">
          <span aria-hidden="true">←</span> Master plan
        </button>
        <span className="text-muted">/ Elmina Business Park · master plan /</span>
        <span className="font-medium">{zone.id}</span>
      </nav>
      <PageHeader eyebrow={SITE_LABEL[siteKey]} title={groupName(zone)} subtitle={`${TYPE_PLURAL[zone.type]} · ${zone.rows} × ${zone.cols} roofs · sample data`} />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Roofs" value={s.n_roofs} />
        <Kpi label="Average score" value={fmt(s.avg_score)} unit="/100" />
        <Kpi label="Good roofs (75+)" value={s.good_roofs} />
        <Kpi label="Capacity" value={fmt(s.total_kwp)} unit="kWp" />
        <Kpi label="Potential" value={fmt(s.mwh_yr)} unit="MWh/yr" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6 min-w-0">
          <section className="card p-4" aria-labelledby="roof-grid">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="roof-grid" className="font-semibold">Roofs in this zone</h2>
              <ul className="flex gap-4 text-xs text-muted">
                <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-primary" />75+</li>
                <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-amber" />55–74</li>
                <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-warn/40 bg-[#F6E1D8]" />Below 55</li>
              </ul>
            </div>
            <div className="overflow-x-auto pb-1">
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${zone.cols}, minmax(44px, 1fr))` }}>
                {zone.roofs.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRoofId(r.id)}
                    aria-pressed={r.id === roof.id}
                    aria-label={`Roof ${r.label}, score ${r.score}`}
                    className={`min-h-touch rounded-md border text-xs font-semibold num ${TILE[scoreBand(r.score)]} ${
                      r.id === roof.id ? 'ring-2 ring-ink ring-offset-2' : 'hover:brightness-95'
                    }`}
                  >
                    {r.score}
                  </button>
                ))}
              </div>
            </div>
          </section>
          <section className="card p-4" aria-labelledby="sat">
            <h2 id="sat" className="mb-3 font-semibold">Satellite view</h2>
            <ZoneCrop site={site} zone={zone} />
            <p className="mt-2 text-xs text-muted">
              {site.image ? 'Cropped from the master plan (Base map: Sime Darby Property). Satellite imagery in production.' : 'Illustrative layout.'}
            </p>
          </section>
        </div>
        <RoofPanel data={data} roof={roof} zone={zone} siteKey={siteKey} />
      </div>
    </>
  )
}

function RoofPanel({ data, roof, zone, siteKey }: { data: RoofsData; roof: Roof; zone: Zone; siteKey: SiteKey }) {
  const leasing = useStore(leasingStore)
  const shortlist = useStore(shortlistStore)
  const inLeasing = leasing.some((l) => l.roofId === roof.id)
  const inShortlist = shortlist.includes(roof.id)

  const addLeasing = () => leasingStore.set((l) => [...l, leaseItem(roof, zone, siteKey)])

  return (
    <aside className="card p-5 self-start xl:sticky xl:top-6" aria-labelledby="roof-title" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="label">Selected roof</div>
          <h2 id="roof-title" className="mt-1 text-xl font-semibold num">{roof.label}</h2>
          <p className="text-sm text-muted">{groupName(zone)} · {roof.owner} · roof {roof.roof_age_yrs} yrs old</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-semibold num">{roof.score}</div>
          <div className="text-xs text-muted">score / 100</div>
        </div>
      </div>

      <h3 className="mt-5 text-sm font-semibold">Score breakdown</h3>
      <ul className="mt-2 space-y-2.5">
        {(Object.keys(data.weights) as ScorePart[]).map((k) => (
          <li key={k}>
            <div className="flex justify-between text-xs">
              <span>{PART_LABEL[k]} <span className="text-muted">· {data.weights[k] * 100}%</span></span>
              <span className="num">{roof.parts[k]}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-page" role="presentation">
              <div className={`h-2 rounded-full ${roof.parts[k] >= 75 ? 'bg-primary' : roof.parts[k] >= 55 ? 'bg-amber' : 'bg-warn'}`} style={{ width: `${roof.parts[k]}%` }} />
            </div>
          </li>
        ))}
      </ul>

      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div><dt className="label">Roof area</dt><dd className="num">{fmt(roof.area_m2)} m²</dd></div>
        <div><dt className="label">System size</dt><dd className="num">{fmt(roof.kwp, 1)} kWp</dd></div>
        <div><dt className="label">Yield</dt><dd className="num">{fmt(roof.yield_kwh_kwp)} kWh/kWp</dd></div>
        <div><dt className="label">Energy</dt><dd className="num">{fmt(roof.mwh_yr, 1)} MWh/yr</dd></div>
      </dl>
      <p className="mt-3 text-sm">{roof.headline}</p>
      <p className="mt-1 text-xs text-muted">Owner notes: {roof.why.join(' · ')}</p>

      <div className="mt-5 grid gap-2">
        <button type="button" className="btn-primary" disabled={inShortlist} onClick={() => shortlistStore.set((s) => [...s, roof.id])}>
          {inShortlist ? '✓ In portfolio shortlist' : 'Add to portfolio'}
        </button>
        <button type="button" className="btn-ghost" disabled={inLeasing} onClick={addLeasing}>
          {inLeasing ? '✓ On leasing list' : 'Add to leasing list'}
        </button>
      </div>
    </aside>
  )
}
