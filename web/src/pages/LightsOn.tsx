import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Segmented } from '../components/ui'
import { fmt, useJson } from '../lib/data'
import { shortDate, type Backtest } from '../lib/forecast'
import { loadCommunity, projectBattery, RESERVE, type BatteryDay, type CommunityIndex, type CommunityPlan, type LampGroup } from '../lib/community'

interface LiveDay {
  date: string
  horizon: number
  confidence: 'high' | 'medium'
  rain_mm: number
  cloud_pct: number
  kwh_kwp?: { p50: number; p90: number; p10: number }
}
interface Live {
  generated_at: string
  stale: boolean
  stale_reason?: string
  note: string
  days: LiveDay[]
}

const weekday = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })
const longDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
// the live forecast is Elmina's weather, so the lamp check is for City of Elmina
const TOWNSHIP = 'elmina'

type Start = '100' | '60' | '30'

interface GroupRun {
  g: LampGroup
  days: BatteryDay[]
  min: number
  firstLow: string | null
  dark: string | null
}

function action(r: GroupRun): { text: string; tone: 'ok' | 'watch' | 'act' } {
  if (r.dark) return { text: `Pre-charge from the grid before ${weekday(r.dark)} ${shortDate(r.dark)}`, tone: 'act' }
  if (r.firstLow) return { text: `Dim to 70% after midnight from ${weekday(r.firstLow)} ${shortDate(r.firstLow)}`, tone: 'watch' }
  return { text: 'No action', tone: 'ok' }
}

export default function LightsOn() {
  const { data: live, error } = useJson<Live>('forecast_live.json')
  const { data: cidx } = useJson<CommunityIndex>('community/index.json')
  const { data: bt } = useJson<Backtest>('forecast_backtest.json')
  const [plan, setPlan] = useState<CommunityPlan | null>(null)
  const [start, setStart] = useState<Start>('100')
  useEffect(() => {
    loadCommunity(TOWNSHIP).then(setPlan)
  }, [])

  const runs: GroupRun[] = useMemo(() => {
    if (!live || !plan || !cidx) return []
    return plan.lamp_groups
      .filter((g) => g.ok && g.battery_usable_kwh)
      .map((g) => {
        const days = projectBattery(live.days, g.kwp, g.battery_usable_kwh!, g.night_kwh, cidx.battery_eff, Number(start) / 100)
        return {
          g, days, min: Math.min(...days.map((d) => d.p90)),
          firstLow: days.find((d) => d.p90 < RESERVE)?.date ?? null,
          dark: days.find((d) => d.short)?.date ?? null,
        }
      })
  }, [live, plan, cidx, start])

  if (error) return <p className="text-warn">Could not load the live forecast: {error}</p>
  if (!live || !plan || !cidx || !runs.length) return <p className="text-muted">Loading…</p>

  const cap = runs.reduce((a, r) => a + r.g.battery_usable_kwh!, 0)
  const agg = live.days.map((d, i) => ({
    date: d.date, d,
    p90: runs.reduce((a, r) => a + r.days[i].p90 * r.g.battery_usable_kwh!, 0) / cap,
    p50: runs.reduce((a, r) => a + r.days[i].p50 * r.g.battery_usable_kwh!, 0) / cap,
  }))
  const lamps = runs.reduce((a, r) => a + r.g.lamps, 0)
  const darkGroups = runs.filter((r) => r.dark)
  const lowGroups = runs.filter((r) => !r.dark && r.firstLow)
  const flagged = [...darkGroups, ...lowGroups].sort((a, b) => a.min - b.min)
  const tonight = agg[0]
  const s = plan.summary
  const c = plan.lowest_curve

  return (
    <>
      {live.stale && <p className="mb-4 rounded-lg border border-warn/40 bg-[#F6E1D8] px-4 py-2 text-sm text-warn">{live.stale_reason}</p>}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-card px-5 py-3 text-sm">
        <p>
          <span className="font-semibold">City of Elmina street lamps</span> · <span className="num">{fmt(lamps)}</span> lamps in {runs.length} groups ·{' '}
          <span className="num">{fmt(cap)}</span> kWh of usable battery · from the{' '}
          <Link to="/community?t=elmina" className="text-primary underline underline-offset-2">community plan</Link>
        </p>
        <label className="flex items-center gap-2 text-muted">
          Battery charge tonight
          <Segmented label="Starting charge" value={start} onChange={setStart} options={[{ id: '100', label: 'Full' }, { id: '60', label: '60%' }, { id: '30', label: '30%' }]} />
        </label>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="flex flex-col rounded-card bg-ink p-7 text-white" aria-labelledby="tn-h">
          <h2 id="tn-h" className="text-[15px] text-white/80">Next 14 nights · from {weekday(live.days[0].date)} {shortDate(live.days[0].date)}</h2>
          <p className="mt-3 text-5xl font-medium leading-tight">
            {darkGroups.length ? `${darkGroups.length} group${darkGroups.length > 1 ? 's' : ''} at risk` : 'All lamps stay lit'}
          </p>
          <p className="mt-4 text-lg leading-snug">
            Using the safe (P90) forecast, the batteries drop to <span className="num font-semibold">{Math.round(Math.min(...agg.map((a) => a.p90)) * 100)}%</span> at their lowest.{' '}
            {flagged.length === 0 ? 'Every group stays above its 20% reserve.' : `${flagged.length} group${flagged.length > 1 ? 's' : ''} dip below the 20% reserve.`}
          </p>
          <dl className="mt-5 space-y-2 border-t border-white/15 pt-5 text-[15px]">
            <div className="flex justify-between"><dt className="text-white/85">Charge tomorrow morning (P90)</dt><dd className="num font-medium">{Math.round(tonight.p90 * 100)}%</dd></div>
            <div className="flex justify-between"><dt className="text-white/85">Lamps need each night</dt><dd className="num font-medium">{fmt(runs.reduce((a, r) => a + r.g.night_kwh, 0))} kWh</dd></div>
            <div className="flex justify-between"><dt className="text-white/85">Groups to watch</dt><dd className="num font-medium">{lowGroups.length}</dd></div>
          </dl>
          <p className="mt-auto rounded-lg bg-white/10 px-5 py-4 text-[15px] leading-relaxed">
            {darkGroups.length
              ? `Pre-charge ${darkGroups.length} group${darkGroups.length > 1 ? 's' : ''} from the grid; see the list below.`
              : lowGroups.length
                ? 'Dim the listed groups after midnight to keep the reserve. Lamps stay on.'
                : 'No action needed. The forecast refreshes every morning.'}
          </p>
        </section>

        <section className="card p-6" aria-labelledby="ch-h">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="ch-h" className="text-lg font-semibold">Battery charge each morning, all lamp groups</h2>
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted" aria-label="Chart legend">
              <li className="flex items-center gap-1.5"><span className="w-5 border-t-[3px] border-primary" />Safe forecast (P90)</li>
              <li className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-primary-light" />Expected (P50)</li>
              <li className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-[#B5520F]" />20% reserve</li>
            </ul>
          </div>
          <Chart agg={agg} />
          <p className="mt-3 text-sm text-muted">
            Weather: Open-Meteo 16-day forecast for Elmina, through the same LightGBM model as the buyer forecast. Starting charge is a setting because there is
            no live battery data yet. {live.note}
          </p>
        </section>
      </div>

      <section className="card mt-6 p-6" aria-labelledby="fl-h">
        <h2 id="fl-h" className="text-lg font-semibold">Groups to act on</h2>
        {flagged.length === 0 ? (
          <p className="mt-2 text-[15px] text-muted">None. Every lamp group stays above its 20% reserve for the next 14 nights, even on the safe forecast.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mt-3 w-full text-[15px]">
              <thead className="border-b border-line text-left text-sm text-muted">
                <tr><th scope="col" className="px-2 py-3 font-medium">Group</th><th scope="col" className="px-2 py-3 font-medium">Lamps</th><th scope="col" className="px-2 py-3 font-medium">Lowest charge</th><th scope="col" className="px-2 py-3 font-medium">Action</th></tr>
              </thead>
              <tbody>
                {flagged.map((r) => {
                  const a = action(r)
                  return (
                    <tr key={r.g.id} className="border-b border-line last:border-0">
                      <td className="px-2 py-3 font-semibold">{r.g.id}</td>
                      <td className="px-2 py-3 num">{fmt(r.g.lamps)}</td>
                      <td className={`px-2 py-3 num ${a.tone === 'act' ? 'text-warn' : ''}`}>{Math.round(r.min * 100)}%</td>
                      <td className={`px-2 py-3 ${a.tone === 'act' ? 'font-medium text-warn' : ''}`}>{a.text}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card mt-6 p-6" aria-labelledby="pr-h">
        <h2 id="pr-h" className="text-lg font-semibold">Proof: 11 years of real weather</h2>
        <dl className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-card bg-page px-6 py-5">
            <dt className="text-[15px] text-muted">Dark nights, {s.record.start.slice(0, 4)}–{s.record.end.slice(0, 4)}</dt>
            <dd className="mt-2 text-4xl font-medium num text-primary">{fmt(s.dark_nights)}</dd>
            <dd className="mt-2 text-[15px] text-muted">{fmt(s.record.days)} nights replayed through every lamp group</dd>
          </div>
          <div className="rounded-card bg-page px-6 py-5">
            <dt className="text-[15px] text-muted">Hardest morning</dt>
            <dd className="mt-2 text-4xl font-medium num">{c ? `${c.lowest_pct}%` : '—'}</dd>
            <dd className="mt-2 text-[15px] text-muted">{c ? `charge left on ${longDate(c.lowest_date)}` : ''}{c?.lowest_date.startsWith('2021-12') ? ', during the December 2021 floods' : ''}</dd>
          </div>
          <div className="rounded-card bg-page px-6 py-5">
            <dt className="text-[15px] text-muted">Forecast we rely on</dt>
            <dd className="mt-2 text-4xl font-medium num">{bt ? `${(bt.test.p90_hit_rate * 100).toFixed(1)}%` : '—'}</dd>
            <dd className="mt-2 text-[15px] text-muted">of unseen days (2023–2025) made at least the P90 amount · <Link to="/insights" className="text-primary underline underline-offset-2">model</Link></dd>
          </div>
        </dl>
      </section>
    </>
  )
}

function Chart({ agg }: { agg: { date: string; d: LiveDay; p90: number; p50: number }[] }) {
  const W = 760, H = 300
  const M = { top: 16, right: 12, bottom: 30, left: 40 }
  const iw = W - M.left - M.right, ih = H - M.top - M.bottom
  const slot = iw / agg.length
  const x = (i: number) => M.left + slot * i + slot / 2
  const y = (p: number) => M.top + ih - p * ih
  const sun = agg.map((a) => a.d.kwh_kwp?.p50 ?? 0)
  const sunMax = Math.max(...sun, 1)
  const [hover, setHover] = useState<number | null>(null)
  return (
    <figure className="mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Battery charge each morning for the next 14 days">
        {[0, 0.2, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke={t === 0.2 ? '#B5520F' : '#E2E0D8'} strokeWidth={t === 0.2 ? 2 : 1} strokeDasharray={t === 0.2 ? '5 4' : undefined} />
            <text x={M.left - 6} y={y(t) + 4} fontSize={11} textAnchor="end" fill="#5B655F">{t * 100}%</text>
          </g>
        ))}
        {agg.map((a, i) => (
          <g key={a.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={x(i) - slot / 2} y={M.top} width={slot} height={ih + M.bottom} fill="transparent" />
            <rect x={x(i) - slot * 0.3} width={slot * 0.6} y={M.top + ih - (sun[i] / sunMax) * ih * 0.4} height={(sun[i] / sunMax) * ih * 0.4} fill={a.d.confidence === 'high' ? '#FBEBD3' : '#FDF5E8'} />
            <text x={x(i)} y={H - 10} fontSize={12} textAnchor="middle" fill="#5B655F">{new Date(`${a.date}T00:00:00`).getDate()}</text>
          </g>
        ))}
        <polyline fill="none" stroke="#8CC7B0" strokeWidth={2} points={agg.map((a, i) => `${x(i)},${y(a.p50)}`).join(' ')} pointerEvents="none" />
        <polyline fill="none" stroke="#1F6F57" strokeWidth={3} points={agg.map((a, i) => `${x(i)},${y(a.p90)}`).join(' ')} pointerEvents="none" />
        {agg.map((a, i) => <circle key={a.date} cx={x(i)} cy={y(a.p90)} r={3} fill={a.p90 < RESERVE ? '#B5520F' : '#1F6F57'} pointerEvents="none" />)}
        {hover !== null && (() => {
          const a = agg[hover]
          const tx = Math.min(Math.max(x(hover) - 85, M.left), W - M.right - 180)
          return (
            <g pointerEvents="none">
              <rect x={tx} y={M.top + 4} width={180} height={64} rx={8} fill="#15201B" />
              <text x={tx + 10} y={M.top + 23} fontSize={12} fill="#fff" fontWeight={600}>{weekday(a.date)} {shortDate(a.date)} · {a.d.rain_mm} mm rain</text>
              <text x={tx + 10} y={M.top + 41} fontSize={12} fill="#8CC7B0">Safe: {Math.round(a.p90 * 100)}% next morning</text>
              <text x={tx + 10} y={M.top + 58} fontSize={12} fill="#fff">Expected: {Math.round(a.p50 * 100)}%</text>
            </g>
          )
        })()}
      </svg>
      <figcaption className="text-sm text-muted">Bars: forecast sunshine that day. Days 1–7 high confidence, 8–14 medium.</figcaption>
    </figure>
  )
}
