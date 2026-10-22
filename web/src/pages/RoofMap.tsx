import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Kpi, PageHeader, Segmented } from '../components/ui'
import { newPortfolio, portfolioStore } from '../lib/portfolio'
import SiteMap, { MapLegend, ZoneCrop } from '../components/SiteMap'
import SatMap, { SAT_COLORS } from '../components/SatMap'
import { fmt, scoreBand, SITE_LABEL, TYPE_PLURAL, useJson } from '../lib/data'
import type { Roof, RoofsData, ScorePart, Site, SiteKey, Zone } from '../lib/data'
import { groupName, leaseItem, leaseItemSat, leasingStore, shortlistStore, useStore } from '../lib/store'
import { CLASS_SHORT, isHome, loadRoofs, markScanned, scannedStore, type RoofClass, type SatRoof, type TownshipIndex, type TownshipMeta } from '../lib/townships'

type View = 'sat' | 'plan'

export default function RoofMap() {
  const { data: index, error } = useJson<TownshipIndex>('townships/index.json')
  const { data: plan } = useJson<RoofsData>('roofs.json')
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()

  if (error) return <p className="text-warn">Could not load townships: {error}</p>
  if (!index) return <p className="text-muted">Loading townships…</p>

  const meta = index.townships.find((t) => t.id === params.get('t')) ?? index.townships[0]
  const view: View = params.get('view') === 'plan' && meta.master_plan ? 'plan' : 'sat'
  const zoneId = params.get('zone')
  const go = (next: { t?: string; view?: View; zone?: string | null }) => {
    const p = new URLSearchParams()
    const t = next.t ?? meta.id
    p.set('t', t)
    const v = next.view ?? (next.t ? 'sat' : view)
    if (v === 'plan') p.set('view', 'plan')
    const z = next.zone === undefined ? zoneId : next.zone
    if (z && v === 'plan') p.set('zone', z)
    setParams(p)
  }

  if (view === 'plan' && plan && zoneId) {
    const site = plan.sites.business_park
    const zone = site.zones.find((z) => z.id === zoneId)
    if (zone) return <ZoneView data={plan} site={site} siteKey="business_park" zone={zone} onBack={() => go({ zone: null })} />
  }

  const build = () => {
    const p = newPortfolio()
    portfolioStore.set((l) => [p, ...l])
    navigate(`/portfolio/${p.id}/details`)
  }

  return (
    <>
      <PageHeader
        eyebrow={`${meta.name}, ${meta.state}`}
        title="Roof map"
        subtitle={view === 'sat' ? 'Pick an SDP township, scan it, and see every rooftop that can carry solar · scores are sample data' : 'SDP master plan with planned zones · click a zone to zoom in · sample data'}
        right={
          <>
            <label className="flex items-center gap-2 text-sm text-muted">
              Township
              <select className="input !w-auto min-w-[220px] font-medium text-ink" value={meta.id} onChange={(e) => go({ t: e.target.value, zone: null })}>
                {index.townships.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.state})</option>
                ))}
              </select>
            </label>
            {meta.master_plan && (
              <Segmented label="View" value={view} onChange={(v) => go({ view: v, zone: null })} options={[{ id: 'sat', label: 'Satellite scan' }, { id: 'plan', label: 'Master plan' }]} />
            )}
            <button type="button" className="btn-primary !text-base" onClick={build}>Build portfolio</button>
          </>
        }
      />
      {view === 'plan' ? (
        plan ? <MasterPlan site={plan.sites.business_park} onZone={(z) => go({ zone: z.id })} /> : <p className="text-muted">Loading master plan…</p>
      ) : (
        <SatelliteView key={meta.id} meta={meta} source={index.source} minKwp={index.min_kwp} initialRoof={params.get('roof')} />
      )}
    </>
  )
}

/* ---------------- Satellite scan ---------------- */

const SCAN_STEPS = [
  { until: 0.2, text: 'Loading satellite imagery' },
  { until: 0.6, text: 'Detecting roof outlines (Microsoft building footprints)' },
  { until: 0.85, text: 'Simulating yield on NASA POWER weather (pvlib)' },
  { until: 1.01, text: 'Scoring every roof' },
]
const SCAN_MS = 4200

type Filter = 'all' | 'homes' | 'medium' | 'large'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All roofs' },
  { id: 'homes', label: 'Homes' },
  { id: 'medium', label: 'Mid-size' },
  { id: 'large', label: 'Factories' },
]
const matches = (f: Filter, c: RoofClass) => f === 'all' || (f === 'homes' ? isHome(c) : c === f)

function SatelliteView({ meta, source, minKwp, initialRoof }: { meta: TownshipMeta; source: string; minKwp: number; initialRoof: string | null }) {
  const scanned = useStore(scannedStore).includes(meta.id)
  const [roofs, setRoofs] = useState<SatRoof[] | null>(null)
  const [sweep, setSweep] = useState<number | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [goodOnly, setGoodOnly] = useState(false)
  const [selected, setSelected] = useState<SatRoof | null>(null)
  const [focusKey, setFocusKey] = useState(0)
  const raf = useRef(0)

  useEffect(() => {
    if (!scanned) return
    loadRoofs(meta.id).then((rs) => {
      setRoofs(rs)
      const r = initialRoof ? rs.find((x) => x.id === initialRoof) : undefined
      if (r) {
        setSelected(r)
        // wait a frame so the polygons exist before flying
        requestAnimationFrame(() => setFocusKey((k) => k + 1))
      }
    })
  }, [scanned, meta.id, initialRoof])
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const startScan = async () => {
    setSweep(0)
    const rs = await loadRoofs(meta.id)
    setRoofs(rs)
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / SCAN_MS)
      setSweep(k)
      if (k < 1) raf.current = requestAnimationFrame(tick)
      else {
        setSweep(null)
        markScanned(meta.id)
      }
    }
    raf.current = requestAnimationFrame(tick)
  }

  const shown = useMemo(() => (roofs ?? []).filter((r) => matches(filter, r.cls) && (!goodOnly || r.score >= 75)), [roofs, filter, goodOnly])
  const top = useMemo(() => [...shown].sort((a, b) => b.score - a.score || b.kwp - a.kwp).slice(0, 7), [shown])
  const s = meta.summary
  const done = scanned && sweep === null
  const step = sweep === null ? null : SCAN_STEPS.find((x) => sweep < x.until)!
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
                  className={`min-h-[40px] rounded-full border px-4 text-sm ${filter === f.id ? 'border-ink bg-ink text-white' : 'border-line bg-card hover:bg-page'} disabled:opacity-50`}>
                  {f.label}
                </button>
              ))}
              <label className="flex min-h-[40px] cursor-pointer items-center gap-2 rounded-full border border-line px-4 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={goodOnly} disabled={!done} onChange={(e) => setGoodOnly(e.target.checked)} />
                Good roofs only
              </label>
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Map legend">
              <li className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm" style={{ background: SAT_COLORS.good }} />Score 75+</li>
              <li className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm" style={{ background: SAT_COLORS.fair }} />55–74</li>
              <li className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm" style={{ background: SAT_COLORS.poor }} />Below 55</li>
              <li className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-muted" />Township extent{meta.extent === 'approx' ? ' (approx.)' : ''}</li>
            </ul>
          </div>
          <div className="relative">
            <SatMap meta={meta} roofs={shown} sweep={sweep ?? (scanned ? null : 0)} selectedId={selected?.id ?? null} onSelect={(r) => select(r)} focusKey={focusKey} />
            {!scanned && sweep === null && (
              <div className="absolute inset-0 z-[500] grid place-items-center bg-ink/35 p-4">
                <div className="max-w-sm rounded-card bg-card p-6 text-center shadow-xl">
                  <p className="text-lg font-semibold">{meta.name} hasn’t been scanned yet</p>
                  <p className="mt-2 text-sm text-muted">
                    The scan finds every building in the satellite view, measures its roof, simulates yield on this township’s own weather, and scores it.
                  </p>
                  <button type="button" className="btn-primary mt-4 w-full !text-base" onClick={startScan}>Scan {meta.name}</button>
                </div>
              </div>
            )}
            {step && (
              <div className="absolute right-4 top-4 z-[500] max-w-xs rounded-card bg-ink/90 p-4 text-white shadow-xl" role="status" aria-live="polite">
                <p className="text-sm font-semibold">Scanning {meta.name}… {Math.round((sweep ?? 0) * 100)}%</p>
                <ol className="mt-2 space-y-1 text-xs">
                  {SCAN_STEPS.map((x) => (
                    <li key={x.text} className={(sweep ?? 0) >= x.until ? 'text-primary-light' : x === step ? 'text-white' : 'text-white/45'}>
                      {(sweep ?? 0) >= x.until ? '✓' : x === step ? '›' : '·'} {x.text}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
          <p className="mt-3 text-sm text-muted">
            Imagery: Esri World Imagery. Roof outlines: {source}; they reflect the imagery date, so recent construction may be missing. Township
            extent: {meta.extent === 'osm' ? 'OpenStreetMap boundary' : 'approximate box around the township centre (OpenStreetMap)'}. Yield is real
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
              <p className="mt-3 text-xs text-muted">Roof type is estimated from footprint size and shape.</p>
            </section>
          )}
          <p className="rounded-card bg-amber-soft px-5 py-4 text-[15px] leading-relaxed">
            Big flat roofs carry most of the potential: one factory roof can replace a whole street of homes. Use the filters to compare.
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
