import { PageHeader, SampleNote } from '../components/ui'
import { fmt, useJson } from '../lib/data'
import type { YieldData } from '../lib/data'

interface LiveLite {
  portfolio_kwp: number
  days: { date: string; p50: number }[]
}

const HOME_KWP = 5.3

export default function Resident() {
  const { data: y } = useJson<YieldData>('yield.json')
  const { data: live } = useJson<LiveLite>('forecast_live.json')
  const month = new Date().getMonth()
  const monthKwh = y ? y.monthly[month].kwh_per_kwp * HOME_KWP : null
  // scale the portfolio forecast (MWh) to one 5.3 kWp home (kWh)
  const week = live ? live.days.slice(0, 7).map((d) => ({ date: d.date, kwh: (d.p50 * 1000 * HOME_KWP) / live.portfolio_kwp })) : []
  const max = Math.max(1, ...week.map((d) => d.kwh))

  return (
    <>
      <PageHeader title="Resident app" subtitle="Mobile mock of what a City of Elmina homeowner sees after leasing their roof." right={<SampleNote>Mock — lease terms and panel status are placeholders.</SampleNote>} />
      <div className="mx-auto w-full max-w-[390px] rounded-[36px] border-[10px] border-ink bg-page p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted">Good morning</p>
            <p className="font-semibold">City of Elmina · House [X]</p>
          </div>
          <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white">LEGA</span>
        </div>

        <div className="card mt-4 p-4">
          <p className="label">Lease income this month</p>
          <p className="mt-1 text-3xl font-semibold num">RM [X]</p>
          <p className="text-xs text-muted">Fixed monthly roof rent — set in the lease</p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="card p-4">
            <p className="label">Typical this month</p>
            <p className="mt-1 text-xl font-semibold num">{monthKwh ? fmt(monthKwh) : '…'} <span className="text-xs font-normal text-muted">kWh</span></p>
            <p className="text-xs text-muted">{HOME_KWP} kWp roof, pvlib</p>
          </div>
          <div className="card p-4">
            <p className="label">Panel status</p>
            <p className="mt-1 flex items-center gap-1.5 text-xl font-semibold"><span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden="true" />OK</p>
            <p className="text-xs text-muted">12 of 12 panels online</p>
          </div>
        </div>

        <div className="card mt-3 p-4">
          <p className="label">Next 7 days (forecast)</p>
          <ul className="mt-3 flex h-28 items-end justify-between gap-1.5" aria-label="Expected kWh per day">
            {week.map((d) => (
              <li key={d.date} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] num">{d.kwh.toFixed(0)}</span>
                <span className="w-full rounded-t bg-primary" style={{ height: `${(d.kwh / max) * 70}px` }} />
                <span className="text-[10px] text-muted">{new Date(`${d.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'narrow' })}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">kWh per day from the live LEGA forecast</p>
        </div>

        <div className="card mt-3 border-l-4 border-l-amber p-4">
          <p className="font-semibold">Your street is going solar</p>
          <p className="mt-1 text-sm text-muted">[N] of [M] homes on your street have joined. Invite a neighbour to help light the street park.</p>
          <button type="button" className="btn-primary mt-3 w-full">Invite a neighbour</button>
        </div>
      </div>
    </>
  )
}
