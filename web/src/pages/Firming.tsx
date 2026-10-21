import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, SampleNote } from '../components/ui'
import { fmt, useJson } from '../lib/data'
import { pct, shortDate, type Backtest } from '../lib/forecast'

interface LiveDay {
  date: string
  horizon: number
  confidence: 'high' | 'medium'
  p50: number
  p90: number
  p10: number
  rain_mm: number
  cloud_pct: number
}

interface Live {
  generated_at: string
  issued_for: string
  stale: boolean
  stale_reason?: string
  source: string
  lag_source: string
  note: string
  portfolio_kwp: number
  demand_mwh_day: number
  days: LiveDay[]
  days_15_30_typical: { from: string; to: string; p50: number; p90: number; basis: string }
}

const weekday = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })

function action(gap: number, demand: number) {
  if (gap >= 0) return { text: `Offer ${fmt(gap, 1)} MWh surplus to other buyers`, tone: 'good' as const }
  if (-gap <= demand * 0.15) return { text: `Top up ${fmt(-gap, 1)} MWh from the grid`, tone: 'warn' as const }
  return { text: `Book ${fmt(-gap, 1)} MWh firming reserve (battery or grid contract)`, tone: 'bad' as const }
}

export default function Firming() {
  const { data: live, error } = useJson<Live>('forecast_live.json')
  const { data: bt } = useJson<Backtest>('forecast_backtest.json')
  const [mode, setMode] = useState<'p90' | 'p50'>('p90')

  return (
    <>
      <PageHeader
        title="Firming forecast"
        subtitle="How much power SDP can safely promise each buyer over the next two weeks, and what to do about any gap."
        right={<span className="rounded-full bg-amber px-3 py-1 text-xs font-semibold text-ink">Roadmap · live numbers</span>}
      />
      {error && <p className="text-warn">Could not load the live forecast: {error}</p>}
      {live && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <SampleNote>Buyer demand is a sample (Innovation Park, {fmt(live.demand_mwh_day, 1)} MWh/day solar share); portfolio = {fmt(live.portfolio_kwp / 1000)} MWp.</SampleNote>
            {live.stale && <p className="rounded-full border border-warn/40 bg-[#F6E1D8] px-3 py-1 text-xs text-warn">{live.stale_reason}</p>}
          </div>
          <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
            <Tomorrow live={live} mode={mode} setMode={setMode} />
            <section className="card p-5" aria-labelledby="fc14-h">
              <h2 id="fc14-h" className="font-semibold">Next 14 days</h2>
              <p className="text-xs text-muted">Issued {shortDate(live.issued_for)} · {live.source}</p>
              <Bars live={live} />
            </section>
          </div>
          <PlanTable live={live} />
        </>
      )}
      {bt && (
        <section className="card mt-6 p-5" aria-labelledby="bt-h">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="bt-h" className="font-semibold">Is the safe amount really safe? Backtest 2023–2025</h2>
            <Link to="/insights" className="min-h-touch inline-flex items-center text-sm text-primary underline underline-offset-2">See full backtest</Link>
          </div>
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-line p-4">
              <dt className="label">P90 promise met</dt>
              <dd className="mt-1 text-2xl font-semibold num">{pct(bt.test.p90_hit_rate, 1)}</dd>
              <dd className="text-xs text-muted">of {fmt(bt.test.days)} test days (target 90%)</dd>
            </div>
            <div className="rounded-lg border border-warn/40 bg-[#F6E1D8] p-4">
              <dt className="label !text-warn">Wettest week, promising P50</dt>
              <dd className="mt-1 text-2xl font-semibold num text-warn">{fmt(bt.wettest_week.shortfall_if_p50_mwh, 1)} MWh short</dd>
              <dd className="text-xs">{shortDate(bt.wettest_week.start)} – {shortDate(bt.wettest_week.end)} {bt.wettest_week.end.slice(0, 4)}, {fmt(bt.wettest_week.rain_mm)} mm rain</dd>
            </div>
            <div className="rounded-lg border border-primary/40 bg-primary/10 p-4">
              <dt className="label !text-primary">Same week, promising P90</dt>
              <dd className="mt-1 text-2xl font-semibold num text-primary">{fmt(bt.wettest_week.shortfall_if_p90_mwh, 1)} MWh short</dd>
              <dd className="text-xs">promise kept almost every day</dd>
            </div>
          </dl>
        </section>
      )}
    </>
  )
}

function Tomorrow({ live, mode, setMode }: { live: Live; mode: 'p90' | 'p50'; setMode: (m: 'p90' | 'p50') => void }) {
  const d = live.days[0]
  const commit = d[mode]
  const gap = commit - live.demand_mwh_day
  const a = action(gap, live.demand_mwh_day)
  return (
    <section className="card p-5" aria-labelledby="tmr-h">
      <h2 id="tmr-h" className="font-semibold">Tomorrow’s commitment</h2>
      <p className="text-xs text-muted">{weekday(d.date)} {shortDate(d.date)} · {d.rain_mm} mm rain, {d.cloud_pct}% cloud forecast</p>
      <div role="group" aria-label="Commit at" className="mt-4 inline-flex rounded-lg border border-line p-1">
        {(['p90', 'p50'] as const).map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
            className={`min-h-touch rounded-md px-3 text-sm ${mode === m ? 'bg-primary text-white' : 'text-muted'}`}>
            {m === 'p90' ? 'Safe (P90)' : 'Expected (P50)'}
          </button>
        ))}
      </div>
      <div className="mt-4 text-4xl font-semibold num">{fmt(commit, 1)} <span className="text-base font-normal text-muted">MWh</span></div>
      <p className="mt-1 text-sm text-muted">Buyer needs {fmt(live.demand_mwh_day, 1)} MWh from solar</p>
      <p className={`mt-4 rounded-lg p-3 text-sm ${a.tone === 'good' ? 'bg-primary/10' : a.tone === 'warn' ? 'bg-amber-soft' : 'bg-[#F6E1D8]'}`}>
        <span className="font-semibold">Suggested: </span>{a.text}.
      </p>
      <p className="mt-3 text-xs text-muted">
        {mode === 'p90'
          ? '90% chance of delivering at least this much. This is what SDP signs for.'
          : '50/50 chance. Committing this means a shortfall on about half of days.'}
      </p>
    </section>
  )
}

function Bars({ live }: { live: Live }) {
  const W = 760, H = 300
  const M = { top: 28, right: 84, bottom: 52, left: 44 }
  const days = live.days
  const max = Math.ceil((Math.max(live.demand_mwh_day, ...days.map((d) => d.p50)) * 1.15) / 10) * 10
  const iw = W - M.left - M.right
  const ih = H - M.top - M.bottom
  const slot = iw / days.length
  const x = (i: number) => M.left + slot * i
  const y = (v: number) => M.top + ih - (v / max) * ih
  const split = days.findIndex((d) => d.confidence === 'medium')
  const ticks = Array.from({ length: max / 10 + 1 }, (_, i) => i * 10)
  const [hover, setHover] = useState<number | null>(null)

  return (
    <figure className="mt-3">
      <ul className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted" aria-label="Chart legend">
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-primary-light" />Expected (P50)</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-primary" />Safe to promise (P90)</li>
        <li className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-amber" />Buyer demand</li>
      </ul>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="14-day forecast bars">
        {split > 0 && (
          <>
            <rect x={x(split)} y={M.top - 20} width={iw - slot * split} height={ih + 20} fill="#F5F4EF" />
            <text x={x(0) + 4} y={M.top - 8} fontSize={11} fill="#1F6F57" fontWeight={600}>Days 1–7 · high confidence</text>
            <text x={x(split) + 4} y={M.top - 8} fontSize={11} fill="#5B655F" fontWeight={600}>Days 8–14 · medium confidence</text>
          </>
        )}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="#E2E0D8" />
            <text x={M.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#5B655F">{Math.round(t)}</text>
          </g>
        ))}
        <text x={12} y={M.top + ih / 2} transform={`rotate(-90 12 ${M.top + ih / 2})`} textAnchor="middle" fontSize={11} fill="#5B655F">MWh per day</text>
        {days.map((d, i) => {
          const bw = slot * 0.66
          const inner = bw * 0.5
          const cx = x(i) + slot / 2
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={x(i)} y={M.top} width={slot} height={ih + 40} fill="transparent" />
              <rect x={cx - bw / 2} y={y(d.p50)} width={bw} height={y(0) - y(d.p50)} rx={4} fill="#8CC7B0" />
              <rect x={cx - inner / 2} y={y(d.p90)} width={inner} height={y(0) - y(d.p90)} rx={3} fill="#1F6F57" stroke="#8CC7B0" strokeWidth={2} />
              <text x={cx} y={H - M.bottom + 16} textAnchor="middle" fontSize={10} fill="#15201B">{shortDate(d.date)}</text>
              <text x={cx} y={H - M.bottom + 30} textAnchor="middle" fontSize={10} fill="#5B655F">{weekday(d.date)}</text>
            </g>
          )
        })}
        <line x1={M.left} x2={W - M.right} y1={y(live.demand_mwh_day)} y2={y(live.demand_mwh_day)} stroke="#E39B2E" strokeWidth={2} strokeDasharray="6 5" pointerEvents="none" />
        <text x={W - M.right + 6} y={y(live.demand_mwh_day) + 4} fontSize={11} fill="#15201B">Demand {fmt(live.demand_mwh_day, 1)}</text>
        {hover !== null && (() => {
          const d = days[hover]
          const tx = Math.min(Math.max(x(hover) - 60, M.left), W - M.right - 150)
          return (
            <g pointerEvents="none">
              <rect x={tx} y={M.top} width={150} height={58} rx={8} fill="#15201B" />
              <text x={tx + 10} y={M.top + 18} fontSize={11} fill="#fff" fontWeight={600}>{weekday(d.date)} {shortDate(d.date)} · {d.rain_mm} mm</text>
              <text x={tx + 10} y={M.top + 34} fontSize={11} fill="#fff">Expected {d.p50} MWh</text>
              <text x={tx + 10} y={M.top + 50} fontSize={11} fill="#8CC7B0">Safe {d.p90} MWh</text>
            </g>
          )
        })()}
      </svg>
      <figcaption className="text-xs text-muted">{live.note}</figcaption>
    </figure>
  )
}

function PlanTable({ live }: { live: Live }) {
  const t = live.days_15_30_typical
  const tGap = t.p90 - live.demand_mwh_day
  return (
    <section className="card mt-6 overflow-x-auto p-5" aria-labelledby="plan-h">
      <h2 id="plan-h" className="font-semibold">Two-week plan</h2>
      <table className="mt-3 w-full text-sm">
        <thead className="text-left label">
          <tr>
            <th scope="col" className="py-2 font-medium">Day</th>
            <th scope="col" className="font-medium text-right">Expected</th>
            <th scope="col" className="font-medium text-right">Safe to promise</th>
            <th scope="col" className="font-medium text-right">Buyer needs</th>
            <th scope="col" className="font-medium text-right">Gap</th>
            <th scope="col" className="pl-6 font-medium">Suggested action</th>
          </tr>
        </thead>
        <tbody className="num">
          {live.days.map((d) => {
            const gap = d.p90 - live.demand_mwh_day
            const a = action(gap, live.demand_mwh_day)
            return (
              <tr key={d.date} className="border-t border-line">
                <td className="py-2.5 font-sans">{weekday(d.date)} {shortDate(d.date)} {d.confidence === 'medium' && <span className="ml-1 text-xs text-muted">· medium</span>}</td>
                <td className="text-right">{fmt(d.p50, 1)}</td>
                <td className="text-right font-semibold">{fmt(d.p90, 1)}</td>
                <td className="text-right">{fmt(live.demand_mwh_day, 1)}</td>
                <td className={`text-right ${gap >= 0 ? 'text-primary' : 'text-warn'}`}>{gap >= 0 ? '+' : ''}{fmt(gap, 1)}</td>
                <td className="pl-6 font-sans">
                  <span className={`mr-2 inline-block h-2 w-2 rounded-full ${a.tone === 'good' ? 'bg-primary' : a.tone === 'warn' ? 'bg-amber' : 'bg-warn'}`} aria-hidden="true" />
                  {a.text}
                </td>
              </tr>
            )
          })}
          <tr className="border-t-2 border-line bg-page">
            <td className="py-2.5 font-sans">Days 15–30 (typical)<div className="text-xs text-muted">{t.basis}</div></td>
            <td className="text-right">{fmt(t.p50, 1)}</td>
            <td className="text-right font-semibold">{fmt(t.p90, 1)}</td>
            <td className="text-right">{fmt(live.demand_mwh_day, 1)}</td>
            <td className={`text-right ${tGap >= 0 ? 'text-primary' : 'text-warn'}`}>{tGap >= 0 ? '+' : ''}{fmt(tGap, 1)}</td>
            <td className="pl-6 font-sans">Per day. Plan reserve contracts monthly, not daily</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted">All values MWh per day. Generated {new Date(live.generated_at).toLocaleString('en-MY')} · lags: {live.lag_source}.</p>
    </section>
  )
}
