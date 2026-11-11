import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Kpi, PageHeader, SampleNote } from '../components/ui'
import { fmt, useJson } from '../lib/data'
import { shortDate } from '../lib/forecast'
import { HORIZON, project, reason, riskOf, type Fleet, type Lamp, type Risk } from '../lib/streetlights'

interface Live {
  generated_at: string
  stale: boolean
  days: { date: string; rain_mm: number; kwh_kwp?: { p50: number; p90: number } }[]
}

const RISK: Record<Risk, { label: string; color: string; cls: string }> = {
  soon: { label: 'At risk within 3 days', color: '#E8643F', cls: 'bg-warn text-white' },
  later: { label: 'At risk in 4–7 days', color: '#F2B33D', cls: 'bg-amber text-ink' },
  ok: { label: 'OK all week', color: '#2BD18A', cls: 'bg-primary/10 text-primary' },
}
const weekday = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })

interface Row {
  l: Lamp
  days: number | null
  morning: number[]
  risk: Risk
  dark: number
  why: string
}

export default function StreetLights() {
  const { data: fleet, error } = useJson<Fleet>('streetlights.json')
  const { data: live } = useJson<Live>('forecast_live.json')
  const [selected, setSelected] = useState<string | null>(null)
  const [route, setRoute] = useState(false)

  const rows: Row[] = useMemo(() => {
    if (!fleet || !live) return []
    const k = live.days.map((d) => d.kwh_kwp?.p90 ?? 0)
    const rainy = live.days.slice(0, HORIZON).filter((d) => d.rain_mm >= 5).length
    return fleet.lamps
      .map((l) => {
        const r = project(l, k)
        return { l, days: r.days_to_dark, morning: r.morning, risk: riskOf(r.days_to_dark), dark: r.morning.filter((m) => m <= 1e-9).length, why: reason(l, rainy) }
      })
      .sort((a, b) => (a.days ?? 99) - (b.days ?? 99) || a.morning[HORIZON - 1] - b.morning[HORIZON - 1])
  }, [fleet, live])

  if (error) return <p className="text-warn">Could not load the street lamps: {error}</p>
  if (!fleet || !live) return <p className="text-muted">Loading…</p>

  const atRisk = rows.filter((r) => r.risk !== 'ok')
  const soon = rows.filter((r) => r.risk === 'soon').length
  const nightsSaved = atRisk.reduce((a, r) => a + Math.max(1, r.dark), 0)
  const days = live.days.slice(0, HORIZON)
  // the crew's day: the coming Thursday within the forecast
  const thu = days.find((d) => new Date(`${d.date}T00:00:00`).getDay() === 4)?.date ?? days[0].date
  const byRoad = [...new Set(atRisk.map((r) => r.l.road))].map((road) => ({ road, lamps: atRisk.filter((r) => r.l.road === road) }))
    .sort((a, b) => Math.min(...a.lamps.map((r) => r.days ?? 9)) - Math.min(...b.lamps.map((r) => r.days ?? 9)))

  return (
    <>
      <PageHeader eyebrow="Standalone solar street lamps" title="Street-light watch"
        subtitle={`Every lamp has its own panel and battery. LEGA runs the next ${HORIZON} days of forecast sunshine through each one and flags the lamps that will go dark, before they do. ${fleet.precinct}.`} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Lamps watched" value={fmt(rows.length)} hint={`on ${new Set(rows.map((r) => r.l.road)).size} real roads`} />
        <Kpi label="At risk this week" value={fmt(atRisk.length)} hint={`${soon} within 3 days`} />
        <Kpi label="Lamp-nights saved this week" value={fmt(nightsSaved)} hint="if the crew follows the maintenance plan" />
        <Kpi label="Forecast" value={`${fmt(days.reduce((a, d) => a + (d.kwh_kwp?.p90 ?? 0), 0) / days.length, 1)}`} unit="kWh/kWp a day" hint={`safe (P90) sunshine, ${shortDate(days[0].date)} – ${shortDate(days[days.length - 1].date)}${live.stale ? ' · stale' : ''}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="card p-4" aria-label="Map of street lamps">
          <LampMap rows={rows} selected={selected} onSelect={setSelected} />
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 px-2 text-sm text-muted" aria-label="Map legend">
            {(['soon', 'later', 'ok'] as Risk[]).map((k) => (
              <li key={k} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border border-ink" style={{ background: RISK[k].color }} />{RISK[k].label}</li>
            ))}
          </ul>
        </section>

        <section className="card flex max-h-[640px] flex-col p-5" aria-labelledby="risk-h">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="risk-h" className="text-lg font-semibold">Lamps to act on</h2>
            <button type="button" className="btn-primary !min-h-[40px]" onClick={() => setRoute(true)} disabled={!atRisk.length}>Maintenance plan</button>
          </div>
          <p className="text-sm text-muted">Sorted by days until dark.</p>
          <ul className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
            {atRisk.length === 0 && <li className="rounded-lg bg-page p-4 text-sm">Every lamp stays lit all week.</li>}
            {atRisk.map((r) => (
              <li key={r.l.id}>
                <button type="button" onClick={() => setSelected(r.l.id)}
                  className={`w-full rounded-lg border p-3 text-left ${selected === r.l.id ? 'border-primary bg-primary/5' : 'border-line hover:bg-page'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{r.l.id} · {r.l.road}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${RISK[r.risk].cls}`}>{r.days === 1 ? 'tonight' : `in ${r.days} days`}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{r.why}</p>
                  <Spark morning={r.morning} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {route && (
        <section className="card mt-6 p-6" aria-labelledby="route-h">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="route-h" className="text-lg font-semibold">Maintenance plan · {weekday(thu)} {shortDate(thu)}</h2>
            <button type="button" className="btn-ghost" onClick={() => setRoute(false)}>Close</button>
          </div>
          <p className="mt-1 text-sm text-muted">One crew, one route, roads in order of urgency. Lamps at risk before Thursday get a battery swap first; shaded lamps get their trees trimmed or panel moved.</p>
          <ol className="mt-4 space-y-3">
            {byRoad.map((g, i) => (
              <li key={g.road} className="rounded-lg border border-line p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">Stop {i + 1}: {g.road}</span>
                  <span className="text-sm text-muted">{g.lamps.length} lamp{g.lamps.length > 1 ? 's' : ''}</span>
                </div>
                <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                  {g.lamps.map((r) => (
                    <li key={r.l.id}>
                      <span className="font-medium">{r.l.id}</span>: {r.l.soh < 0.8 ? 'swap battery' : r.l.shade < 1 ? 'trim trees / move panel' : 'clean panel, check charge'}
                      {r.days !== null && r.days <= 3 && <span className="text-warn"> · before {weekday(days[r.days - 1].date)}</span>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="card mt-6 grid gap-4 p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div>
          <h2 className="text-lg font-semibold">New lamps in the community plan never go dark</h2>
          <p className="mt-1 text-[15px] text-muted">
            The lamps above are a sample of an existing fleet: ageing batteries and tree shade. Lamps in SDP’s community plan are sized against 11 years of real weather
            (2015–2025) so that no night would have gone dark, and kept above a 20% reserve.
          </p>
        </div>
        <Link to="/planner/map" className="btn-ghost">See the township lamp plan</Link>
      </section>

      <div className="mt-4"><SampleNote>Roads are real (OpenStreetMap). Lamp specs, battery health, shade and charge are sample values until there is a lamp register and telemetry.</SampleNote></div>
    </>
  )
}

function Spark({ morning }: { morning: number[] }) {
  const W = 140, H = 26
  const x = (i: number) => (i / (morning.length - 1)) * (W - 4) + 2
  const y = (v: number) => H - 2 - v * (H - 4)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-6 w-36" aria-label="Battery charge each morning this week">
      <line x1={0} x2={W} y1={y(0.1)} y2={y(0.1)} stroke="#A33A12" strokeDasharray="3 2" />
      <polyline points={morning.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke="#1F6F57" strokeWidth={1.8} />
      {morning.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={2} fill={v < 0.1 ? '#A33A12' : '#1F6F57'} />)}
    </svg>
  )
}

const IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

function LampMap({ rows, selected, onSelect }: { rows: Row[]; selected: string | null; onSelect: (id: string) => void }) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const marks = useRef(new Map<string, L.CircleMarker>())
  const onSel = useRef(onSelect)
  onSel.current = onSelect

  useEffect(() => {
    if (!el.current || map.current || !rows.length) return
    const m = L.map(el.current, { preferCanvas: true, maxZoom: 19, scrollWheelZoom: false })
    L.tileLayer(IMAGERY, { maxZoom: 19, attribution: 'Imagery © Esri, Maxar · Roads © OpenStreetMap contributors (ODbL)' }).addTo(m)
    for (const r of rows) {
      const c = L.circleMarker([r.l.lat, r.l.lon], { radius: r.risk === 'ok' ? 5 : 7, color: '#15201B', weight: 1.2, fillColor: RISK[r.risk].color, fillOpacity: 0.95 })
      c.bindTooltip(`${r.l.id} · ${r.l.road} · ${RISK[r.risk].label}`, { direction: 'top' })
      c.on('click', () => onSel.current(r.l.id))
      c.addTo(m)
      marks.current.set(r.l.id, c)
    }
    m.fitBounds(L.latLngBounds(rows.map((r) => [r.l.lat, r.l.lon])), { padding: [30, 30] })
    map.current = m
    return () => {
      m.remove()
      map.current = null
      marks.current.clear()
    }
  }, [rows])

  useEffect(() => {
    marks.current.forEach((c, id) => c.setStyle({ weight: id === selected ? 3.5 : 1.2, color: id === selected ? '#FFFFFF' : '#15201B' }))
    const c = selected ? marks.current.get(selected) : null
    if (c && map.current) map.current.panTo(c.getLatLng())
  }, [selected])

  return <div ref={el} className="h-[560px] w-full overflow-hidden rounded-lg bg-[#2b332e]" role="application" aria-label="Satellite map of street lamps coloured by risk" />
}
