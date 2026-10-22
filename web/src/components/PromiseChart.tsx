import { useState } from 'react'
import { fmt, niceTicks } from '../lib/data'
import { shortDate, WEATHER_LABEL, type SampleDay } from '../lib/forecast'

const W = 820
const H = 340
const M = { top: 16, right: 92, bottom: 56, left: 48 }

/** "Did the forecast keep its promises?" — range band (P90→P10), promise line (P90), actual dots, demand line. */
export default function PromiseChart({ days, demand, selected, onSelect }: { days: SampleDay[]; demand: number; selected: number | null; onSelect: (i: number) => void }) {
  const [hover, setHover] = useState<number | null>(null)
  const ticks = niceTicks(Math.max(demand, ...days.flatMap((d) => [d.p10, d.actual])) * 1.08)
  const max = ticks[ticks.length - 1]
  const iw = W - M.left - M.right
  const ih = H - M.top - M.bottom
  const slot = iw / days.length
  const x = (i: number) => M.left + slot * (i + 0.5)
  const y = (v: number) => M.top + ih - (v / max) * ih
  const promise = days.map((d, i) => `${x(i)},${y(d.p90)}`).join(' ')
  const active = hover ?? selected

  return (
    <figure>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted" aria-label="Chart legend">
        <li className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm bg-primary-light/60" />Forecast range (P90 → P10)</li>
        <li className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-primary" />Promise to buyer (P90)</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-ink" />Delivered</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-warn bg-card" />Delivered below promise</li>
        <li className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-amber" />Buyer demand</li>
      </ul>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Fourteen days of forecast range, promise and delivered energy">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="#E2E0D8" strokeWidth={1} />
            <text x={M.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#5B655F" className="num">{t}</text>
          </g>
        ))}
        <text x={14} y={M.top + ih / 2} transform={`rotate(-90 14 ${M.top + ih / 2})`} textAnchor="middle" fontSize={11} fill="#5B655F">MWh per day</text>

        {active !== null && <rect x={x(active) - slot / 2} y={M.top} width={slot} height={ih} fill="#15201B" opacity={0.05} />}

        {days.map((d, i) => (
          <rect key={`b${i}`} x={x(i) - slot * 0.3} width={slot * 0.6} y={y(d.p10)} height={Math.max(2, y(d.p90) - y(d.p10))} rx={4} fill="#8CC7B0" opacity={0.55} />
        ))}
        {days.map((d, i) => (
          <line key={`m${i}`} x1={x(i) - slot * 0.18} x2={x(i) + slot * 0.18} y1={y(d.p50)} y2={y(d.p50)} stroke="#1F6F57" strokeOpacity={0.5} strokeWidth={1.5} />
        ))}

        <line x1={M.left} x2={W - M.right} y1={y(demand)} y2={y(demand)} stroke="#E39B2E" strokeWidth={2} strokeDasharray="6 5" />
        <text x={W - M.right + 6} y={y(demand) + 4} fontSize={11} fill="#15201B">Demand {fmt(demand, 1)}</text>

        <polyline points={promise} fill="none" stroke="#1F6F57" strokeWidth={2} strokeLinejoin="round" />
        <text x={W - M.right + 6} y={y(days[days.length - 1].p90) + 4} fontSize={11} fill="#1F6F57" fontWeight={600}>Promise</text>

        {days.map((d, i) => {
          const miss = d.actual < d.p90
          return (
            <circle key={`a${i}`} cx={x(i)} cy={y(d.actual)} r={5.5} fill={miss ? '#FFFFFF' : '#15201B'} stroke={miss ? '#A33A12' : '#FFFFFF'} strokeWidth={miss ? 2.5 : 2} />
          )
        })}

        {days.map((d, i) => (
          <g key={`x${i}`}>
            <text x={x(i)} y={H - M.bottom + 18} textAnchor="middle" fontSize={11} fill="#15201B">{shortDate(d.date)}</text>
            <text x={x(i)} y={H - M.bottom + 34} textAnchor="middle" fontSize={10} fill={d.weather === 'storm' ? '#A33A12' : '#5B655F'}>{WEATHER_LABEL[d.weather]}</text>
          </g>
        ))}

        {/* hit targets: larger than the marks, keyboard reachable */}
        {days.map((d, i) => (
          <rect
            key={`h${i}`}
            x={x(i) - slot / 2}
            y={M.top}
            width={slot}
            height={ih + 40}
            fill="transparent"
            role="button"
            tabIndex={0}
            aria-label={`${shortDate(d.date)}: promised ${d.p90}, delivered ${d.actual} MWh`}
            aria-pressed={selected === i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            onClick={() => onSelect(i)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(i))}
            className="cursor-pointer outline-none focus-visible:stroke-ink focus-visible:stroke-2"
          />
        ))}

        {hover !== null && (() => {
          const d = days[hover]
          const tx = Math.min(Math.max(x(hover) - 80, M.left), W - M.right - 160)
          return (
            <g pointerEvents="none">
              <rect x={tx} y={M.top + 2} width={160} height={70} rx={8} fill="#15201B" />
              <text x={tx + 10} y={M.top + 20} fontSize={11} fill="#FFFFFF" fontWeight={600}>{shortDate(d.date)} · {WEATHER_LABEL[d.weather]}</text>
              <text x={tx + 10} y={M.top + 38} fontSize={11} fill="#FFFFFF">Promised {d.p90} MWh</text>
              <text x={tx + 10} y={M.top + 54} fontSize={11} fill="#FFFFFF">Delivered {d.actual} MWh</text>
              <text x={tx + 10} y={M.top + 68} fontSize={10} fill="#8CC7B0">Click for details</text>
            </g>
          )
        })()}
      </svg>
      <details className="mt-2 text-sm">
        <summary className="min-h-touch cursor-pointer py-2 text-primary">Show as table</summary>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted">
              <tr><th className="py-1 pr-3">Day</th><th className="pr-3">Weather</th><th className="pr-3 text-right">Rain mm</th><th className="pr-3 text-right">P90</th><th className="pr-3 text-right">P50</th><th className="pr-3 text-right">P10</th><th className="text-right">Delivered</th></tr>
            </thead>
            <tbody className="num">
              {days.map((d) => (
                <tr key={d.date} className="border-t border-line">
                  <td className="py-1 pr-3">{shortDate(d.date)}</td><td className="pr-3">{WEATHER_LABEL[d.weather]}</td><td className="pr-3 text-right">{d.rain_mm}</td>
                  <td className="pr-3 text-right">{d.p90}</td><td className="pr-3 text-right">{d.p50}</td><td className="pr-3 text-right">{d.p10}</td>
                  <td className={`text-right ${d.actual < d.p90 ? 'text-warn font-semibold' : ''}`}>{d.actual}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}
