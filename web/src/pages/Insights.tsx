import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PromiseChart from '../components/PromiseChart'
import { PageHeader, SampleNote } from '../components/ui'
import { fmt, useJson } from '../lib/data'
import type { Roof, RoofsData, ScorePart, Zone } from '../lib/data'
import { pct, shortDate, WEATHER_LABEL, type Backtest } from '../lib/forecast'

type Tab = 'roof' | 'forecast'

export default function Insights() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'roof' ? 'roof' : 'forecast'
  const tabs: { id: Tab; label: string }[] = [
    { id: 'roof', label: 'Roof scoring model' },
    { id: 'forecast', label: 'Forecast model' },
  ]
  return (
    <>
      <PageHeader title="Model insights" subtitle="How LEGA OS ranks roofs and decides how much power SDP can safely promise." />
      <div role="tablist" aria-label="Model" className="mb-6 inline-flex rounded-lg border border-line bg-card p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setParams({ tab: t.id })}
            className={`min-h-touch rounded-md px-4 text-sm font-medium ${tab === t.id ? 'bg-primary text-white' : 'text-muted hover:text-ink'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'forecast' ? <ForecastTab /> : <RoofTab />}
      </div>
    </>
  )
}

/* ---------------- Forecast model ---------------- */

function ForecastTab() {
  const { data: b, error } = useJson<Backtest>('forecast_backtest.json')
  const [sel, setSel] = useState<number | null>(null)
  if (error) return <p className="text-warn">Could not load backtest: {error}</p>
  if (!b) return <p className="text-muted">Loading…</p>

  const da = 'error' in b.day_ahead_check ? null : b.day_ahead_check
  const misses = b.sample_window.filter((d) => d.actual < d.p90).length
  const maxShare = Math.max(...b.feature_importance.map((f) => f.share))
  const day = sel !== null ? b.sample_window[sel] : null

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="card p-5" aria-labelledby="card-h">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 id="card-h" className="font-semibold">Model card</h2>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">Real data · backtested on unseen years</span>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            <CardStat label="P90 hit rate" value={pct(b.test.p90_hit_rate, 1)} sub="target ≈ 90%" />
            <CardStat label="Average error (P50)" value={`${b.test.p50_mape_pct}%`} sub={`vs ${b.baseline_climatology_mape_pct}% using monthly averages`} />
            <CardStat label="Training period" value="2017–2022" sub={`${b.train_period}`} />
            <CardStat label="Test period" value="2023–2025" sub={`${fmt(b.test.days)} days, never seen in training`} />
          </dl>
          <ul className="mt-5 space-y-2 text-sm">
            <li><span className="font-medium">Model:</span> {b.model}.</li>
            <li><span className="font-medium">Inputs:</span> {b.approach_label}</li>
            <li><span className="font-medium">“Actual” output:</span> {b.actual_source}.</li>
            <li><span className="font-medium">Calibration:</span> {b.calibration.method}. Before it, the P90 was met on only {pct(b.test_uncalibrated.p90_hit_rate)} of test days.</li>
          </ul>
          {da && (
            <p className="mt-4 rounded-lg border border-amber/60 bg-amber-soft p-3 text-sm">
              <span className="font-semibold">Day-ahead check.</span> {b.caveat} With true day-ahead forecasts ({shortDate(da.from)} {da.from.slice(0, 4)} – {shortDate(da.to)} {da.to.slice(0, 4)}, {fmt(da.days)} days) the
              P90 was met on <span className="num font-semibold">{pct(da.p90_hit_rate, 1)}</span> of days with {da.p50_mape_pct}% average error — so in production we would widen the buffer slightly.
            </p>
          )}
        </section>

        <section className="card p-5" aria-labelledby="fi-h">
          <h2 id="fi-h" className="font-semibold">What drives the forecast</h2>
          <p className="text-xs text-muted">Share of model gain, P50 model</p>
          <ul className="mt-4 space-y-3">
            {b.feature_importance.map((f) => (
              <li key={f.feature}>
                <div className="flex justify-between text-sm"><span>{f.feature}</span><span className="num text-muted">{pct(f.share)}</span></div>
                <div className="mt-1 h-2 rounded-full bg-page"><div className="h-2 rounded-full bg-primary" style={{ width: `${(f.share / maxShare) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card p-5" aria-labelledby="promise-h">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="promise-h" className="font-semibold">Did the forecast keep its promises?</h2>
            <p className="text-sm text-muted">
              14 test days around the wettest week of 2023–2025, for a {fmt(b.portfolio_kwp / 1000)} MWp portfolio. Promise kept on {14 - misses} of 14 days. Click a day.
            </p>
          </div>
          <SampleNote>Buyer demand line is a sample (Innovation Park, 12,000 MWh/yr).</SampleNote>
        </div>
        <div className="mt-4">
          <PromiseChart days={b.sample_window} demand={b.demand_mwh_day} selected={sel} onSelect={setSel} />
        </div>
        <div className="mt-4 rounded-lg border border-line p-4" aria-live="polite">
          {day ? (
            <>
              <h3 className="font-semibold">{shortDate(day.date)} · {WEATHER_LABEL[day.weather]} · {day.rain_mm} mm rain</h3>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <CardStat label="Forecast range" value={`${day.p90}–${day.p10}`} sub="MWh (P90 to P10)" />
                <CardStat label="Promised (P90)" value={`${day.p90} MWh`} />
                <CardStat label="Delivered" value={`${day.actual} MWh`} />
                <CardStat label="Difference" value={`${day.actual - day.p90 >= 0 ? '+' : ''}${fmt(day.actual - day.p90, 1)} MWh`} />
              </dl>
              <p className="mt-3 text-sm">{explain(day, b.demand_mwh_day)}</p>
            </>
          ) : (
            <p className="text-sm text-muted">Select a day in the chart to see what was promised, what was delivered, and why.</p>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5" aria-labelledby="trust-h">
          <h2 id="trust-h" className="font-semibold">When to trust the forecast</h2>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left label"><tr><th className="py-2 font-medium">Weather</th><th className="font-medium text-right">Days</th><th className="font-medium text-right">Avg error</th><th className="font-medium text-right">P90 met</th><th className="font-medium text-right">Trust</th></tr></thead>
            <tbody>
              {b.by_weather.map((w) => (
                <tr key={w.class} className="border-t border-line">
                  <td className="py-2.5">{WEATHER_LABEL[w.class]}<div className="text-xs text-muted">{b.weather_class_rules[w.class]}</div></td>
                  <td className="text-right num">{w.days}</td>
                  <td className="text-right num">{w.p50_mape_pct}%</td>
                  <td className="text-right num">{pct(w.p90_hit_rate)}</td>
                  <td className="text-right"><TrustPill t={w.trust} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted">Clearness = satellite GHI ÷ clear-sky GHI (NASA POWER). Error = mean absolute % error of P50.</p>
        </section>

        <section className="card p-5" aria-labelledby="wet-h">
          <h2 id="wet-h" className="font-semibold">Why promise P90, not P50?</h2>
          <p className="mt-1 text-sm text-muted">
            Wettest week in the test period: {shortDate(b.wettest_week.start)} – {shortDate(b.wettest_week.end)} {b.wettest_week.end.slice(0, 4)}, {fmt(b.wettest_week.rain_mm)} mm of rain.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-warn/40 bg-[#F6E1D8] p-4">
              <div className="label !text-warn">Promise P50 every day</div>
              <div className="mt-1 text-2xl font-semibold num text-warn">{fmt(b.wettest_week.shortfall_if_p50_mwh, 1)} MWh</div>
              <div className="text-xs">short of what was promised</div>
            </div>
            <div className="rounded-lg border border-primary/40 bg-primary/10 p-4">
              <div className="label !text-primary">Promise P90 every day</div>
              <div className="mt-1 text-2xl font-semibold num text-primary">{fmt(b.wettest_week.shortfall_if_p90_mwh, 1)} MWh</div>
              <div className="text-xs">short of what was promised</div>
            </div>
          </div>
          <p className="mt-3 text-sm">
            P90 promises less on good days ({fmt(b.wettest_week.promised_p90_mwh)} vs {fmt(b.wettest_week.promised_p50_mwh)} MWh that week) but almost never breaks a commitment
            — that reliability is what lets SDP sign firm supply contracts.
          </p>
        </section>
      </div>
    </div>
  )
}

function explain(d: { p90: number; p50: number; actual: number; weather: string; rain_mm: number }, demand: number) {
  const diff = d.actual - d.p90
  if (diff >= 0) {
    const extra = d.actual > demand ? ` and more than the buyer's ${fmt(demand, 1)} MWh demand, so the surplus can be sold or stored` : ''
    return `Promise kept: the portfolio delivered ${fmt(diff, 1)} MWh more than the safe amount${extra}.${d.actual < d.p50 ? ` A P50 promise (${d.p50} MWh) would have missed by ${fmt(d.p50 - d.actual, 1)} MWh.` : ''}`
  }
  return `Promise missed by ${fmt(-diff, 1)} MWh: ${d.rain_mm} mm of rain cut output harder than the forecast expected. SDP would top up the gap from the grid or a firming reserve. Misses like this are why P90 targets 90%, not 100%.`
}

function CardStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-1 text-xl font-semibold num">{value}</dd>
      {sub && <dd className="text-xs text-muted">{sub}</dd>}
    </div>
  )
}

function TrustPill({ t }: { t: 'High' | 'Medium' | 'Low' }) {
  const cls = t === 'High' ? 'bg-primary text-white' : t === 'Medium' ? 'bg-amber text-ink' : 'bg-warn text-white'
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{t}</span>
}

/* ---------------- Roof scoring model ---------------- */

const PART_LABEL: Record<ScorePart, string> = { yield: 'solar yield', shading: 'little shading', condition: 'roof condition', likelihood: 'owner likely to sign' }

function RoofTab() {
  const { data } = useJson<RoofsData>('roofs.json')
  const examples = useMemo(() => {
    if (!data) return []
    const all = data.sites.business_park.zones.flatMap((z) => z.roofs.map((r) => ({ r, z })))
    const sorted = [...all].sort((a, b) => b.r.score - a.r.score)
    return [
      { label: 'Best roof', ...sorted[0] },
      { label: 'Median roof', ...sorted[Math.floor(sorted.length / 2)] },
      { label: 'Weakest roof', ...sorted[sorted.length - 1] },
    ]
  }, [data])
  const [i, setI] = useState(0)
  if (!data || !examples.length) return <p className="text-muted">Loading…</p>
  const { r, z } = examples[i]
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Example roof" className="inline-flex rounded-lg border border-line bg-card p-1">
          {examples.map((e, k) => (
            <button key={e.label} type="button" aria-pressed={i === k} onClick={() => setI(k)}
              className={`min-h-touch rounded-md px-3 text-sm ${i === k ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}>
              {e.label} <span className="num">({e.r.score})</span>
            </button>
          ))}
        </div>
        <SampleNote />
      </div>
      <RoofPipeline data={data} roof={r} zone={z} />
    </div>
  )
}

function RoofPipeline({ data, roof, zone }: { data: RoofsData; roof: Roof; zone: Zone }) {
  const w = data.weights
  const contrib = (Object.keys(w) as ScorePart[]).map((k) => ({ k, pts: w[k] * roof.parts[k] })).sort((a, b) => b.pts - a.pts)
  const steps = [
    {
      n: 1, title: 'Detect', real: false,
      what: 'Find the roof outline and usable area.',
      out: [`Roof ${roof.id} in zone ${zone.id}`, `${fmt(roof.area_m2)} m² roof`, `${fmt(roof.kwp, 1)} kWp fits after setbacks`],
      prod: 'Production: roof segmentation on satellite imagery.',
    },
    {
      n: 2, title: 'Shade', real: false,
      what: 'Estimate shading from trees and taller neighbours.',
      out: [`Shade-free score ${roof.parts.shading}/100`, `Roof condition ${roof.parts.condition}/100 (${roof.roof_age_yrs} yrs old)`],
      prod: 'Production: LiDAR / 3D city model + site survey.',
    },
    {
      n: 3, title: 'Simulate', real: true,
      what: 'Run pvlib on 11 years of NASA POWER weather for Elmina.',
      out: [`Site yield ${fmt(data.site_yield_kwh_kwp)} kWh/kWp/yr`, `This roof ${fmt(roof.yield_kwh_kwp)} kWh/kWp after shading`, `${fmt(roof.mwh_yr, 1)} MWh per year`],
      prod: 'Real: NASA POWER 2015–2025 + pvlib PVWatts.',
    },
    {
      n: 4, title: 'Score', real: false,
      what: '40% yield + 20% shading + 20% condition + 20% likelihood to sign.',
      out: [`Score ${roof.score}/100`, `Likelihood to sign ${roof.parts.likelihood}/100`, roof.why.join(' · ')],
      prod: 'Likelihood is rule-based on owner type, lease length and engagement.',
    },
  ]
  return (
    <>
      <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {steps.map((s) => (
          <li key={s.n} className="card relative p-5">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-sm font-semibold text-white">{s.n}</span>
              <h3 className="font-semibold">{s.title}</h3>
              <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${s.real ? 'bg-primary/10 text-primary' : 'bg-amber-soft text-ink'}`}>{s.real ? 'Real data' : 'Sample'}</span>
            </div>
            <p className="mt-2 text-sm text-muted">{s.what}</p>
            <ul className="mt-3 space-y-1 text-sm">
              {s.out.map((o) => <li key={o} className="num">→ {o}</li>)}
            </ul>
            <p className="mt-3 text-xs text-muted">{s.prod}</p>
          </li>
        ))}
      </ol>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-semibold">Why this roof ranks {roof.score >= 75 ? 'high' : roof.score >= 55 ? 'in the middle' : 'low'}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {contrib.map((c) => (
              <li key={c.k} className="flex items-center gap-3">
                <span className="w-40">{PART_LABEL[c.k]}</span>
                <span className="h-2 flex-1 rounded-full bg-page"><span className="block h-2 rounded-full bg-primary" style={{ width: `${(c.pts / 40) * 100}%` }} /></span>
                <span className="w-16 text-right num">+{c.pts.toFixed(1)} pts</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm">
            Biggest contributor: {PART_LABEL[contrib[0].k]}. Weakest: {PART_LABEL[contrib[contrib.length - 1].k]} — {roof.parts[contrib[contrib.length - 1].k] < 60 ? 'worth fixing before approaching the owner.' : 'still acceptable.'}
          </p>
        </section>
        <section className="card p-5">
          <h2 className="font-semibold">Model confidence</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li><span className="font-medium text-primary">High —</span> site yield. Simulated from 11 years of satellite weather; annual yield {fmt(data.site_yield_kwh_kwp)} kWh/kWp sits inside the 1,100–1,500 range typical for Peninsular Malaysia rooftops.</li>
            <li><span className="font-medium text-ink">Low (sample) —</span> roof area, shading and condition. Generated with a fixed seed until imagery and site surveys are in.</li>
            <li><span className="font-medium text-ink">Low (sample) —</span> likelihood to sign. Rules are a starting point; they should be re-fitted on real outreach outcomes from the leasing list.</li>
          </ul>
        </section>
      </div>
    </>
  )
}
