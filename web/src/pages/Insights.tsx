import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import PromiseChart from '../components/PromiseChart'
import { PageHeader, SampleNote, Segmented } from '../components/ui'
import { isHome, loadRoofs, type SatRoof, type TownshipIndex, type TownshipMeta } from '../lib/townships'
import { fmt, useJson } from '../lib/data'
import type { Roof, ScorePart, YieldData } from '../lib/data'
import { pct, shortDate, WEATHER_LABEL, type Backtest } from '../lib/forecast'

type Tab = 'roof' | 'forecast'

export default function Insights() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'forecast' ? 'forecast' : 'roof'
  return (
    <>
      <PageHeader
        title="Model insights"
        subtitle={tab === 'roof' ? 'What each model looked at, and why it gave this answer · sample data' : 'How much SDP can safely promise, and how often that promise held · real weather data'}
        right={
          <div role="tablist" aria-label="Model" className="flex gap-2">
            {(['roof', 'forecast'] as Tab[]).map((t) => (
              <button
                key={t}
                role="tab"
                id={`tab-${t}`}
                aria-selected={tab === t}
                aria-controls={`panel-${t}`}
                onClick={() => setParams({ tab: t })}
                className={`min-h-touch rounded-lg border px-5 text-[15px] ${tab === t ? 'border-ink bg-ink text-white' : 'border-line bg-card hover:bg-page'}`}
              >
                {t === 'roof' ? 'Roof scoring model' : 'Forecast model'}
              </button>
            ))}
          </div>
        }
      />
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
              14 test days around the wettest week of 2023–2025, for the {fmt(b.portfolio_kwp / 1000, 2)} MWp Innovation Park portfolio. Promise kept on {14 - misses} of 14 days. Click a day.
            </p>
          </div>
          <SampleNote>Buyer demand line is a sample (Innovation Park, 1,800 MWh/yr).</SampleNote>
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

type Example = { id: string; label: string; r: SatRoof; town: TownshipMeta; median: number }

function RoofTab() {
  const { data: index } = useJson<TownshipIndex>('townships/index.json')
  const { data: y } = useJson<YieldData>('yield.json')
  const [examples, setExamples] = useState<Example[]>([])
  useEffect(() => {
    if (!index) return
    const town = (id: string) => index.townships.find((t) => t.id === id)!
    Promise.all([loadRoofs('elmina'), loadRoofs('bukit-raja')]).then(([elmina, raja]) => {
      const byScore = (xs: SatRoof[]) => [...xs].sort((a, b) => b.score - a.score || b.kwp - a.kwp)
      const median = (xs: SatRoof[]) => [...xs.map((r) => r.shade_loss_pct)].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
      const eH = byScore(elmina.filter((r) => isHome(r.cls)))
      const rL = byScore(raja.filter((r) => r.cls === 'large'))
      const eAll = byScore(elmina)
      const mE = median(elmina)
      setExamples([
        { id: 'home', label: 'Best home', r: eH[0], town: town('elmina'), median: mE },
        { id: 'factory', label: 'Best factory', r: rL[0], town: town('bukit-raja'), median: median(raja) },
        { id: 'median', label: 'Median roof', r: eAll[Math.floor(eAll.length / 2)], town: town('elmina'), median: mE },
        { id: 'weak', label: 'Weakest roof', r: eAll[eAll.length - 1], town: town('elmina'), median: mE },
      ])
    })
  }, [index])
  const [pick, setPick] = useState('home')
  if (!y || !examples.length) return <p className="text-muted">Loading…</p>
  const ex = examples.find((e) => e.id === pick) ?? examples[0]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex flex-wrap items-center gap-2 text-[15px] text-muted">
          Pipeline for <span className="font-semibold text-ink">{ex.r.label}, {ex.town.name}</span> ·
          <span className="rounded-full bg-[#DCEFE6] px-3 py-1 font-medium text-primary-dark">Final score {ex.r.score}</span>
          <Link to={`/map?t=${ex.town.id}&roof=${ex.r.id}`} className="min-h-touch inline-flex items-center text-primary underline underline-offset-2">See it on the map</Link>
        </p>
        <Segmented label="Example roof" value={pick} onChange={setPick} options={examples.map((e) => ({ id: e.id, label: e.label }))} />
      </div>
      <RoofPipeline siteYield={ex.town.summary.yield_kwh_kwp} y={y} roof={ex.r} home={isHome(ex.r.cls)} townshipMedian={ex.median} />
    </div>
  )
}

const PART_LABEL: Record<ScorePart, string> = { yield: 'Solar yield', shading: 'Shading', condition: 'Roof condition', likelihood: 'Likelihood to sign' }

function StepCard({ n, step, title, real, children }: { n: number; step: string; title: string; real?: boolean; children: React.ReactNode }) {
  return (
    <li className="card flex flex-col p-6">
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm font-medium tracking-wide text-primary">{n} · {step}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${real ? 'bg-primary/10 text-primary' : 'bg-amber-soft text-ink'}`}>{real ? 'Real data' : 'Sample'}</span>
      </div>
      <h3 className="mt-3 text-lg font-semibold">{title}</h3>
      {children}
    </li>
  )
}

function Stats({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="mt-auto space-y-2 border-t border-line pt-4 text-[15px]">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3"><dt>{k}</dt><dd className="num font-medium">{v}</dd></div>
      ))}
    </dl>
  )
}

/** 12 hourly cells 7am–6pm; shade eats into the ends of the day first. */
function shadeStrip(lossPct: number): ('sun' | 'part' | 'shade')[] {
  const cells: ('sun' | 'part' | 'shade')[] = Array(12).fill('sun')
  const affected = Math.min(10, Math.round(lossPct / 1.5))
  for (let k = 0; k < affected; k++) {
    const idx = k % 2 === 0 ? k / 2 : 11 - (k - 1) / 2
    cells[idx] = k < affected - 2 ? 'shade' : 'part'
  }
  return cells
}

const WEIGHTS: Record<ScorePart, number> = { yield: 0.4, shading: 0.2, condition: 0.2, likelihood: 0.2 }

/** The roof's real detected footprint, scaled to fit the card. */
function Outline({ ring }: { ring: [number, number][] }) {
  const lat0 = ring[0][0]
  const pts = ring.map(([lat, lng]) => [lng * Math.cos((lat0 * Math.PI) / 180), -lat] as const)
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const k = Math.min(280 / (x1 - x0 || 1), 150 / (y1 - y0 || 1))
  const ox = (340 - (x1 - x0) * k) / 2, oy = (208 - (y1 - y0) * k) / 2
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(ox + (x - x0) * k).toFixed(1)},${(oy + (y - y0) * k).toFixed(1)}`).join(' ') + 'Z'
  return (
    <svg viewBox="0 0 340 208" className="mt-4 w-full rounded-lg" role="img" aria-label="Detected roof outline (real footprint shape)">
      <rect width="340" height="208" fill="#8E928A" />
      <path d={d} fill="#C7C1B0" stroke="#E39B2E" strokeWidth="4" strokeLinejoin="round" />
    </svg>
  )
}

function RoofPipeline({ siteYield, y, roof, home, townshipMedian }: { siteYield: number; y: YieldData; roof: Roof; home: boolean; townshipMedian: number }) {
  const w = WEIGHTS
  const pts = (k: ScorePart) => w[k] * roof.parts[k]
  const monthly = y.monthly.map((m, i) => ({ m: m.month, kwh: m.kwh_per_kwp * roof.kwp, monsoon: [0, 1, 2, 10, 11].includes(i) }))
  const maxM = Math.max(...monthly.map((m) => m.kwh))
  const strip = shadeStrip(roof.shade_loss_pct)
  const cellCls = { sun: 'bg-amber', part: 'bg-[#B9C0BB]', shade: 'bg-[#6E7772]' }

  const sentences = [
    `${roof.aspect.startsWith('Flat') ? 'Large flat roof' : roof.aspect === 'Pitched roof' ? 'Pitched roof' : `${roof.aspect}-facing roof plane`} with ${roof.shade_loss_pct < 1 ? 'almost no shading' : `${fmt(roof.shade_loss_pct, 1)}% of sun lost to shade`} (township median ${fmt(townshipMedian, 1)}%).`,
    roof.parts.condition >= 75 ? `Roof in good condition (${roof.roof_age_yrs} yrs old), so no repair is needed before install.` : `Roof condition ${roof.parts.condition}/100 (${roof.roof_age_yrs} yrs old): inspect before install.`,
    `${roof.owner}${roof.why.includes('attended SDP solar briefing') ? ' who attended an SDP solar briefing' : ''}, ${roof.lease_years_left} years left on lease or title.`,
  ]
  const rank = roof.score >= 75 ? 'high' : roof.score >= 55 ? 'in the middle' : 'low'

  return (
    <>
      <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StepCard n={1} step="DETECT" title="Find the roof" real>
          {'ring' in roof ? <Outline ring={(roof as SatRoof).ring} /> : (
          <svg viewBox="0 0 340 208" className="mt-4 w-full rounded-lg" role="img" aria-label="Illustration: detected roof outline on a satellite tile">
            <rect width="340" height="208" fill="#8E928A" />
            <rect y="188" width="340" height="20" fill="#6F746D" />
            {home ? (
              <>
                <rect x="27" y="25" width="122" height="152" fill="#A9ABA3" />
                <rect x="172" y="20" width="132" height="162" fill="#C7C1B0" />
                <rect x="172" y="20" width="132" height="81" fill="#D3CDBC" />
                <rect x="172" y="20" width="132" height="162" fill="none" stroke="#E39B2E" strokeWidth="4" />
              </>
            ) : (
              <>
                <rect x="20" y="22" width="300" height="160" fill="#B9B5A8" />
                {[0, 1, 2, 3, 4, 5].map((i) => <line key={i} x1={20 + i * 50} y1="22" x2={20 + i * 50} y2="182" stroke="#A7A396" strokeWidth="2" />)}
                <rect x="34" y="34" width="272" height="136" fill="none" stroke="#E39B2E" strokeWidth="4" />
              </>
            )}
          </svg>
          )}
          <p className="mt-4 text-sm text-muted">Input: satellite imagery. Roof outline from open building data via Overture Maps (real); usable area estimated by roof type.</p>
          <Stats rows={[['Roof area', `${fmt(roof.area_m2)} m²`], ['Usable for panels', `${fmt(roof.usable_m2)} m²`], [roof.aspect === 'Flat roof' || roof.aspect === 'Pitched roof' ? 'Roof type' : 'Best plane faces', roof.aspect.replace(' (low-pitch metal deck)', '')]]} />
        </StepCard>

        <StepCard n={2} step="SHADE" title="Check for shading">
          <div className="mt-4 grid grid-cols-12 gap-0.5" role="img" aria-label={`Hourly sun on panels, 7am to 6pm: ${strip.filter((c) => c === 'sun').length} of 12 hours in full sun`}>
            {strip.map((c, i) => <span key={i} className={`h-9 ${cellCls[c]}`} />)}
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted"><span>7am</span><span>12pm</span><span>6pm</span></div>
          <p className="mt-3 text-sm text-muted">Input: neighbouring building heights + sun path for this township. Orange = full sun on panels.</p>
          <Stats rows={[['Sun lost to shade', `${fmt(roof.shade_loss_pct, 1)}%`], ['Township median', `${fmt(townshipMedian, 1)}%`]]} />
        </StepCard>

        <StepCard n={3} step="SIMULATE" title="Simulate yield" real>
          <div className="mt-4 flex h-36 items-end gap-1" role="img" aria-label="Monthly energy for this roof, January to December">
            {monthly.map((m) => (
              <span key={m.m} title={`${m.m}: ${fmt(m.kwh)} kWh`} className={`flex-1 rounded-t-sm ${m.monsoon ? 'bg-primary-light' : 'bg-primary'}`} style={{ height: `${(m.kwh / maxM) * 100}%` }} />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted"><span>Jan</span><span>Jun</span><span>Dec</span></div>
          <p className="mt-3 text-sm text-muted">pvlib physics model on 11 years of NASA POWER sunlight data. Lighter bars = monsoon months.</p>
          <Stats rows={[['System size', `${fmt(roof.kwp, 1)} kWp`], ['Yield per year', `${fmt(roof.mwh_yr, 1)} MWh`]]} />
        </StepCard>

        <StepCard n={4} step="SCORE" title="Combine into a score">
          <ul className="mt-4 space-y-3">
            {(Object.keys(w) as ScorePart[]).map((k) => (
              <li key={k}>
                <div className="flex justify-between text-[15px]"><span>{PART_LABEL[k]} ({w[k] * 100})</span><span className="num font-medium">{Math.round(pts(k))} pts</span></div>
                <div className="mt-1 h-2 rounded-full bg-page"><div className="h-2 rounded-full bg-primary" style={{ width: `${roof.parts[k]}%` }} /></div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted">Bar = points earned out of each factor’s weight.</p>
          <div className="mt-auto flex items-baseline justify-between border-t border-line pt-4">
            <span className="font-semibold">Total</span>
            <span className="num text-3xl font-medium">{roof.score} / 100</span>
          </div>
        </StepCard>
      </ol>

      <section className="card grid gap-8 p-6 lg:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold">Why this roof ranks {rank}</h2>
          <p className="mt-2 text-[15px] leading-relaxed">{sentences.join(' ')}</p>
        </div>
        <div>
          <h2 className="text-lg font-semibold">Model confidence</h2>
          <p className="mt-2 text-[15px] leading-relaxed">
            Roof outlines are real (Overture Maps: OpenStreetMap, Google and Microsoft footprints); roof type is estimated from size and shape and will be checked against [X] hand-labelled Elmina roofs: [XX]% match. Yield is checked against the 1,100–1,500 kWh/kWp
            range typical for Peninsular Malaysia rooftops ({fmt(siteYield)} here passes). Shading and condition are sample
            data (the footprints have no building heights); likelihood to sign is rule-based until SDP shares lease data.
          </p>
        </div>
      </section>
    </>
  )
}
