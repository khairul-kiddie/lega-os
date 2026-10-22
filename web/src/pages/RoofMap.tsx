import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Kpi, PageHeader, Segmented } from '../components/ui'
import { newPortfolio, portfolioStore } from '../lib/portfolio'
import SiteMap, { MapLegend, ZoneCrop } from '../components/SiteMap'
import { fmt, ownersFor, scoreBand, SITE_LABEL, TYPE_PLURAL, useJson } from '../lib/data'
import type { Roof, RoofsData, ScorePart, Site, SiteKey, Zone } from '../lib/data'
import { groupName, leaseItem, leasingStore, shortlistStore, useStore } from '../lib/store'

export default function RoofMap() {
  const { data, error } = useJson<RoofsData>('roofs.json')
  const [params, setParams] = useSearchParams()
  const siteKey = (params.get('site') === 'homes' ? 'homes' : 'business_park') as SiteKey
  const zoneId = params.get('zone')

  if (error) return <p className="text-warn">Could not load roof data: {error}</p>
  if (!data) return <p className="text-muted">Loading roof data…</p>

  const site = data.sites[siteKey]
  const zone = zoneId ? site.zones.find((z) => z.id === zoneId) : undefined
  const go = (next: { site?: SiteKey; zone?: string | null }) => {
    const p = new URLSearchParams()
    const s = next.site ?? siteKey
    if (s === 'homes') p.set('site', 'homes')
    const z = next.zone === undefined ? zoneId : next.zone
    if (z) p.set('zone', z)
    setParams(p)
  }

  if (zone) return <ZoneView data={data} site={site} siteKey={siteKey} zone={zone} onBack={() => go({ zone: null })} />

  return <Overview site={site} siteKey={siteKey} onSite={(s) => go({ site: s, zone: null })} onZone={(z) => go({ zone: z.id })} />
}

const SITE_OPTIONS: { id: SiteKey; label: string }[] = [
  { id: 'business_park', label: 'Business park' },
  { id: 'homes', label: 'Homes' },
]

function Overview({ site, siteKey, onSite, onZone }: { site: Site; siteKey: SiteKey; onSite: (s: SiteKey) => void; onZone: (z: Zone) => void }) {
  const [hover, setHover] = useState<string | null>(null)
  const navigate = useNavigate()
  const roofs = useMemo(() => site.zones.flatMap((z) => z.roofs), [site])
  const gwh = roofs.reduce((a, r) => a + r.mwh_yr, 0) / 1000
  const strong = site.zones.filter((z) => z.summary.avg_score >= 75).length
  // factories only on the business park (commercial roofs are SDP-owned malls), homes on the homes site
  const ownerRoofs = siteKey === 'business_park' ? site.zones.filter((z) => z.type === 'f' || z.type === 'm').flatMap((z) => z.roofs) : roofs
  const owners = ownersFor(ownerRoofs, 1000)
  const best = [...site.zones].sort((a, b) => b.summary.avg_score - a.summary.avg_score).slice(0, 7)
  const name = siteKey === 'business_park' ? 'Elmina Business Park' : 'City of Elmina homes'

  const build = () => {
    const p = newPortfolio()
    portfolioStore.set((l) => [p, ...l])
    navigate(`/portfolio/${p.id}/details`)
  }

  return (
    <>
      <PageHeader
        eyebrow={name}
        title="Roof map"
        subtitle={`${name} · click a zone to zoom in · sample data`}
        right={
          <>
            <Segmented label="Site" options={SITE_OPTIONS} value={siteKey} onChange={onSite} />
            <button type="button" className="btn-primary !text-base" onClick={build}>Build portfolio</button>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Roofs scanned" value={fmt(roofs.length)} />
        <Kpi label="Zones scoring 75+" value={strong} unit={`of ${site.zones.length}`} />
        <Kpi label="Solar potential" value={fmt(gwh, 1)} unit="GWh/yr" />
        <Kpi label="Owners to sign for 1 GWh" value={owners ?? '—'} unit={owners ? (siteKey === 'business_park' ? 'factory owners' : 'home owners') : 'not enough roofs'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="card p-5" aria-label="Site map">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Site overview · average roof score per zone</h2>
            <MapLegend />
          </div>
          <SiteMap site={site} onSelect={onZone} highlight={hover} />
          <p className="mt-3 text-sm text-muted">
            {site.image
              ? 'Base map: SDP master plan for the prototype. Live version uses satellite imagery and detected roof outlines.'
              : 'Illustrative layout, not real precinct boundaries. Live version uses satellite imagery and detected roof outlines.'}
          </p>
        </section>

        <aside className="space-y-6">
          <section className="card p-6" aria-labelledby="best-zones">
            <h2 id="best-zones" className="text-lg font-semibold">Best zones to start with</h2>
            <p className="mt-2 text-[15px] text-muted">Click a zone on the map or below to zoom in</p>
            <ol className="mt-4 space-y-3">
              {best.map((z) => (
                <li key={z.id}>
                  <button
                    type="button"
                    onClick={() => onZone(z)}
                    onMouseEnter={() => setHover(z.id)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(z.id)}
                    onBlur={() => setHover(null)}
                    className="flex w-full items-center gap-4 rounded-card border border-line px-4 py-3 text-left hover:border-primary/50 hover:bg-page"
                  >
                    <ScoreBadge score={z.summary.avg_score} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{z.id.startsWith('Precinct') ? z.id : `Zone ${z.id}`}</span>
                      <span className="block text-sm text-muted">{TYPE_PLURAL[z.type]} · {z.summary.n_roofs} roofs</span>
                    </span>
                    <span className="num text-sm">{fmt(z.summary.mwh_yr / 1000, 1)} GWh</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
          <p className="rounded-card bg-amber-soft px-5 py-4 text-[15px] leading-relaxed">
            Factory roofs here are about 9–19× larger than a house roof (720–1,500 m² vs 80 m²), so one signed factory can replace a whole
            street of homes.
          </p>
        </aside>
      </div>
    </>
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
          <span aria-hidden="true">←</span> Roof map
        </button>
        <span className="text-muted">/ {SITE_LABEL[siteKey]} /</span>
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
