import { useState } from 'react'
import { PageHeader, Segmented } from '../components/ui'
import { fmt, niceTicks, useJson } from '../lib/data'
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

type Mode = 'p90' | 'p50'

const weekday = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })
const dayNum = (iso: string) => new Date(`${iso}T00:00:00`).getDate()
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

function weatherPhrase(d: LiveDay) {
  if (d.rain_mm >= 20) return `Heavy rain expected (${fmt(d.rain_mm)} mm).`
  if (d.rain_mm >= 5) return `Showers expected (${fmt(d.rain_mm)} mm).`
  if (d.cloud_pct >= 80) return 'Mostly cloudy.'
  return 'Mostly sunny.'
}

function dailyAction(gap: number, demand: number) {
  if (gap >= 0) return `Surplus of ${fmt(gap, 1)} MWh: offer it to other buyers.`
  if (-gap <= demand * 0.15) return `Gap of ${fmt(-gap, 1)} MWh: top up from the grid.`
  return `Gap of ${fmt(-gap, 1)} MWh: book a firming reserve (battery or grid contract).`
}

export default function Firming() {
  const { data: live, error } = useJson<Live>('forecast_live.json')
  const { data: bt } = useJson<Backtest>('forecast_backtest.json')
  const [mode, setMode] = useState<Mode>('p90')

  return (
    <>
      <PageHeader
        title="Firming forecast"
        subtitle="How much SDP can safely promise Innovation Park · roadmap feature, live weather forecast, sample buyer"
        right={
          <Segmented
            label="Promise level"
            value={mode}
            onChange={setMode}
            options={[
              { id: 'p90', label: 'Promise P90 (safe)' },
              { id: 'p50', label: 'Promise P50 (average)' },
            ]}
          />
        }
      />
      {error && <p className="text-warn">Could not load the live forecast: {error}</p>}
      {live?.stale && <p className="mb-4 rounded-lg border border-warn/40 bg-[#F6E1D8] px-4 py-2 text-sm text-warn">{live.stale_reason}</p>}
      {live && (
        <>
          <div className="grid gap-6 xl:grid-cols-[440px_minmax(0,1fr)]">
            <Tomorrow live={live} mode={mode} />
            <section className="card p-6" aria-labelledby="fc14-h">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="fc14-h" className="text-lg font-semibold">Next 14 days (MWh per day)</h2>
                <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted" aria-label="Chart legend">
                  <li className="flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-sm border border-primary-light bg-[#DCEFE6]" />Expected (P50)</li>
                  <li className="flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-sm bg-primary" />Safe to promise (P90)</li>
                  <li className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-[#B5520F]" />Demand {fmt(live.demand_mwh_day, 1)}</li>
                </ul>
              </div>
              <Bars live={live} />
              <p className="mt-3 text-sm text-muted">
                Weather: Open-Meteo 16-day forecast for Elmina · Model: LightGBM trained on 2017–2022 archived forecasts against NASA POWER
                history · Roadmap: same-day updates from Himawari satellite cloud images. {live.note}
              </p>
            </section>
          </div>
          <PlanTable live={live} mode={mode} />
        </>
      )}
      {bt && <BacktestCards bt={bt} />}
    </>
  )
}

function Tomorrow({ live, mode }: { live: Live; mode: Mode }) {
  const d = live.days[0]
  const commit = d[mode]
  return (
    <section className="flex flex-col rounded-card bg-ink p-7 text-white" aria-labelledby="tmr-h">
      <h2 id="tmr-h" className="text-[15px] text-white/80">Tomorrow’s commitment · {weekday(d.date)} {shortDate(d.date)}</h2>
      <p className="mt-3 text-6xl font-medium num leading-none">
        {fmt(commit, 1)}
        <span className="ml-2 font-sans text-lg font-normal text-white/80">MWh</span>
      </p>
      <p className="mt-5 text-lg leading-snug">
        {mode === 'p90' ? 'We are 90% sure the portfolio will deliver at least this.' : 'Even odds: on about half of days the portfolio delivers less than this.'}{' '}
        {weatherPhrase(d)}
      </p>
      <dl className="mt-5 space-y-2 border-t border-white/15 pt-5 text-[15px]">
        {[
          ['Expected (P50)', d.p50],
          ['Safe (P90)', d.p90],
          ['Buyer demand', live.demand_mwh_day],
        ].map(([k, v]) => (
          <div key={k as string} className="flex justify-between">
            <dt className="text-white/85">{k}</dt>
            <dd className="num font-medium">{fmt(v as number, 1)} MWh</dd>
          </div>
        ))}
      </dl>
      <p className="mt-auto rounded-lg bg-white/10 px-5 py-4 text-[15px] leading-relaxed">{dailyAction(commit - live.demand_mwh_day, live.demand_mwh_day)}</p>
    </section>
  )
}

function Bars({ live }: { live: Live }) {
  const W = 760, H = 330
  const M = { top: 58, right: 8, bottom: 30, left: 8 }
  const days = live.days
  const ticks = niceTicks(Math.max(live.demand_mwh_day, ...days.map((d) => d.p50)) * 1.12)
  const max = ticks[ticks.length - 1]
  const iw = W - M.left - M.right
  const ih = H - M.top - M.bottom
  const slot = iw / days.length
  const x = (i: number) => M.left + slot * i
  const y = (v: number) => M.top + ih - (v / max) * ih
  const split = Math.max(1, days.findIndex((d) => d.confidence === 'medium'))
  const [hover, setHover] = useState<number | null>(null)

  return (
    <figure className="mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Next 14 days: expected and safe-to-promise energy per day">
        <rect x={x(0)} y={4} width={slot * split - 2} height={H - M.bottom - 4} fill="#EAF4EF" />
        <rect x={x(split) + 2} y={4} width={slot * (days.length - split) - 2} height={H - M.bottom - 4} fill="#FDF5E8" />
        <rect x={x(0)} y={4} width={slot * split - 2} height={44} fill="#DCEFE6" />
        <rect x={x(split) + 2} y={4} width={slot * (days.length - split) - 2} height={44} fill="#FBEBD3" />
        <text x={x(0) + 10} y={22} fontSize={12.5} fontWeight={600} fill="#17543F">Days 1–{split} · this week</text>
        <text x={x(0) + 10} y={39} fontSize={12} fill="#17543F">High confidence: commit daily</text>
        <text x={x(split) + 12} y={22} fontSize={12.5} fontWeight={600} fill="#7A4A06">Days {split + 1}–{days.length} · next week</text>
        <text x={x(split) + 12} y={39} fontSize={12} fill="#7A4A06">Medium confidence: plan ahead</text>

        {days.map((d, i) => {
          const wk1 = i < split
          const bw = slot * 0.78
          const inner = bw * 0.55
          const cx = x(i) + slot / 2
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={x(i)} y={M.top} width={slot} height={ih + M.bottom} fill="transparent" />
              <rect x={cx - bw / 2} y={y(d.p50)} width={bw} height={y(0) - y(d.p50)} rx={3}
                fill={wk1 ? '#DCEFE6' : '#FDF0DC'} stroke={wk1 ? '#8CC7B0' : '#E8B96A'} strokeWidth={1.5} />
              <rect x={cx - inner / 2} y={y(d.p90)} width={inner} height={y(0) - y(d.p90)} rx={2} fill={wk1 ? '#1F6F57' : '#3E8670'} />
              <text x={cx} y={H - 8} textAnchor="middle" fontSize={12} fill="#5B655F">{dayNum(d.date)}</text>
            </g>
          )
        })}
        <line x1={M.left} x2={W - M.right} y1={y(0)} y2={y(0)} stroke="#9AA39E" />
        <line x1={M.left} x2={W - M.right} y1={y(live.demand_mwh_day)} y2={y(live.demand_mwh_day)} stroke="#B5520F" strokeWidth={2} strokeDasharray="5 4" pointerEvents="none" />

        {hover !== null && (() => {
          const d = days[hover]
          const tx = Math.min(Math.max(x(hover) - 70, M.left), W - M.right - 170)
          return (
            <g pointerEvents="none">
              <rect x={tx} y={M.top + 6} width={170} height={64} rx={8} fill="#15201B" />
              <text x={tx + 10} y={M.top + 25} fontSize={12} fill="#fff" fontWeight={600}>{weekday(d.date)} {shortDate(d.date)} · {d.rain_mm} mm rain</text>
              <text x={tx + 10} y={M.top + 43} fontSize={12} fill="#fff">Expected {fmt(d.p50, 1)} MWh</text>
              <text x={tx + 10} y={M.top + 60} fontSize={12} fill="#8CC7B0">Safe {fmt(d.p90, 1)} MWh</text>
            </g>
          )
        })()}
      </svg>
    </figure>
  )
}

function PlanTable({ live, mode }: { live: Live; mode: Mode }) {
  const demand = live.demand_mwh_day
  const split = Math.max(1, live.days.findIndex((d) => d.confidence === 'medium'))
  const wk1 = live.days.slice(0, split)
  const wk2 = live.days.slice(split)
  const t = live.days_15_30_typical
  const nLater = Math.round((new Date(`${t.to}T00:00:00`).getTime() - new Date(`${t.from}T00:00:00`).getTime()) / 864e5) + 1
  const monsoon = [11, 12, 1, 2, 3].includes(new Date(`${t.from}T00:00:00`).getMonth() + 1)
  const promiseLabel = mode === 'p90' ? 'Safe to promise' : 'Promise (P50)'

  const rows = [
    {
      period: 'This week', range: `${shortDate(wk1[0].date)} – ${shortDate(wk1[wk1.length - 1].date)}`, conf: 'High' as const,
      exp: sum(wk1.map((d) => d.p50)), safe: sum(wk1.map((d) => d[mode])), need: demand * wk1.length,
      action: (gap: number) => (gap >= 0 ? `Commit daily; offer ${fmt(gap, 1)} MWh surplus to other buyers` : `Commit daily; top up ${fmt(-gap, 1)} MWh from the grid on short days`),
    },
    {
      period: 'Next week', range: `${shortDate(wk2[0].date)} – ${shortDate(wk2[wk2.length - 1].date)}`, conf: 'Medium' as const,
      exp: sum(wk2.map((d) => d.p50)), safe: sum(wk2.map((d) => d[mode])), need: demand * wk2.length,
      action: (gap: number) => (gap >= 0 ? 'Hold surplus until the forecast firms up' : `Pre-book ${fmt(-gap, 1)} MWh of grid top-up; confirm daily`),
    },
    {
      period: 'Days 15–30 (typical)', range: `${shortDate(t.from)} – ${shortDate(t.to)}`, conf: 'History' as const,
      exp: t.p50 * nLater, safe: (mode === 'p90' ? t.p90 : t.p50) * nLater, need: demand * nLater,
      action: (gap: number) => (gap >= 0 ? 'Typical month covers demand' : `${monsoon ? 'Monsoon month: book' : 'Book'} a green grid top-up in advance`),
    },
  ]
  const safe14 = rows[0].safe + rows[1].safe
  const need14 = rows[0].need + rows[1].need
  const pill = { High: 'bg-[#DCEFE6] text-primary-dark', Medium: 'bg-amber-soft text-[#7A4A06]', History: 'border border-dashed border-muted text-ink' }

  return (
    <section className="card mt-6 p-6" aria-labelledby="plan-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="plan-h" className="text-lg font-semibold">Two-week plan</h2>
        <p className="text-[15px] text-muted">
          {mode === 'p90' ? 'Safe to promise' : 'P50 promise'} over 14 days: <span className="num font-semibold text-ink">{fmt(safe14)} MWh</span> of{' '}
          <span className="num font-semibold text-ink">{fmt(need14)} MWh</span> needed
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="mt-4 w-full text-[15px]">
          <thead className="border-b border-line text-left text-sm text-muted">
            <tr>
              <th scope="col" className="px-2 py-3 font-medium">Period</th>
              <th scope="col" className="px-2 py-3 font-medium">Confidence</th>
              <th scope="col" className="px-2 py-3 font-medium">Expected</th>
              <th scope="col" className="px-2 py-3 font-medium">{promiseLabel}</th>
              <th scope="col" className="px-2 py-3 font-medium">Buyer needs</th>
              <th scope="col" className="px-2 py-3 font-medium">Gap</th>
              <th scope="col" className="px-2 py-3 font-medium">Suggested action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const gap = r.safe - r.need
              return (
                <tr key={r.period} className="border-b border-line last:border-0">
                  <td className="px-2 py-4"><span className="font-semibold">{r.period}</span><div className="text-sm text-muted">{r.range}</div></td>
                  <td className="px-2 py-4"><span className={`rounded-full px-2.5 py-1 text-sm font-medium ${pill[r.conf]}`}>{r.conf}</span></td>
                  <td className="px-2 py-4 num">{fmt(r.exp, 1)}</td>
                  <td className="px-2 py-4 num">{fmt(r.safe, 1)}</td>
                  <td className="px-2 py-4 num">{fmt(r.need, 1)}</td>
                  <td className={`px-2 py-4 num ${gap >= 0 ? 'text-primary' : 'text-warn'}`}>{gap >= 0 ? '+' : ''}{fmt(gap, 1)}</td>
                  <td className="px-2 py-4">{r.action(gap)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-muted">
        MWh per period. Re-run every morning. The last row is not a forecast: it shows what normally happens on those dates, from 11 years of
        history · {t.basis}.
      </p>
      <details className="mt-3 text-sm">
        <summary className="min-h-touch cursor-pointer py-2 text-primary">Show day-by-day detail</summary>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr><th className="py-1 pr-3 font-medium">Day</th><th className="pr-3 font-medium">Rain</th><th className="pr-3 font-medium">Expected</th><th className="pr-3 font-medium">Safe</th><th className="pr-3 font-medium">Gap vs demand</th><th className="font-medium">Action</th></tr>
            </thead>
            <tbody className="num">
              {live.days.map((d) => {
                const gap = d[mode] - demand
                return (
                  <tr key={d.date} className="border-t border-line">
                    <td className="py-1.5 pr-3 font-sans">{weekday(d.date)} {shortDate(d.date)}</td>
                    <td className="pr-3">{d.rain_mm} mm</td>
                    <td className="pr-3">{fmt(d.p50, 1)}</td>
                    <td className="pr-3">{fmt(d.p90, 1)}</td>
                    <td className={`pr-3 ${gap >= 0 ? 'text-primary' : 'text-warn'}`}>{gap >= 0 ? '+' : ''}{fmt(gap, 1)}</td>
                    <td className="font-sans">{dailyAction(gap, demand)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">Generated {new Date(live.generated_at).toLocaleString('en-MY')} · lags: {live.lag_source} · portfolio {fmt(live.portfolio_kwp)} kWp.</p>
      </details>
    </section>
  )
}

function BacktestCards({ bt }: { bt: Backtest }) {
  const w = bt.wettest_week
  return (
    <section className="card mt-6 p-6" aria-labelledby="bt-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="bt-h" className="text-lg font-semibold">Backtest: would our promises have held?</h2>
        <p className="text-[15px] text-muted">Test period 2023–2025, unseen by the model · wettest week {shortDate(w.start)} – {shortDate(w.end)} {w.end.slice(0, 4)}, {fmt(w.rain_mm)} mm rain</p>
      </div>
      <dl className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="rounded-card bg-page px-6 py-5">
          <dt className="text-[15px] text-muted">Days the P90 promise was met</dt>
          <dd className="mt-2 text-4xl font-medium num">{pct(bt.test.p90_hit_rate, 1)}</dd>
          <dd className="mt-2 text-[15px] text-muted">Target: about 90% · {pct('error' in bt.day_ahead_check ? 0 : bt.day_ahead_check.p90_hit_rate, 1)} on true day-ahead forecasts</dd>
        </div>
        <div className="rounded-card bg-page px-6 py-5">
          <dt className="text-[15px] text-muted">Wettest week · naive promise (P50)</dt>
          <dd className="mt-2 text-4xl font-medium num text-warn">{fmt(w.shortfall_if_p50_mwh, 1)} MWh short</dd>
          <dd className="mt-2 text-[15px] text-muted">≈ RM [X] in penalties</dd>
        </div>
        <div className="rounded-card bg-page px-6 py-5">
          <dt className="text-[15px] text-muted">Wettest week · P90 promise</dt>
          <dd className="mt-2 text-4xl font-medium num text-primary">{fmt(w.shortfall_if_p90_mwh, 1)} MWh short</dd>
          <dd className="mt-2 text-[15px] text-muted">≈ RM [X] in penalties</dd>
        </div>
      </dl>
    </section>
  )
}
