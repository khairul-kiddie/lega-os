import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/ui'
import { fmt, loadJson } from '../lib/data'
import type { RoofsData, YieldData } from '../lib/data'
import { buildPlan, portfolioStore, SAMPLE_PORTFOLIO_ID } from '../lib/portfolio'
import { leaseItem, leasingStore, useStore, type LeaseItem, type LeaseStatus } from '../lib/store'

const STATUS: { id: LeaseStatus; label: string; cls: string }[] = [
  { id: 'to_approach', label: 'To approach', cls: 'bg-page text-ink' },
  { id: 'visited', label: 'Visited', cls: 'bg-amber-soft text-[#7A4A06]' },
  { id: 'interested', label: 'Interested', cls: 'bg-primary/10 text-primary' },
  { id: 'signed', label: 'Signed', cls: 'bg-primary text-white' },
  { id: 'declined', label: 'Declined', cls: 'bg-[#F6E1D8] text-warn' },
]
const LABEL = Object.fromEntries(STATUS.map((s) => [s.id, s])) as Record<LeaseStatus, (typeof STATUS)[number]>
const FILTERS: { id: LeaseStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'to_approach', label: 'To approach' },
  { id: 'visited', label: 'Visited' },
  { id: 'interested', label: 'Interested' },
  { id: 'signed', label: 'Signed' },
  { id: 'declined', label: 'Declined' },
]

function nextStep(r: LeaseItem): string {
  const home = r.label.startsWith('Lot')
  switch (r.status) {
    case 'to_approach': return home ? 'Door visit' : 'Book a site visit'
    case 'visited': return 'Follow up within a week'
    case 'interested': return 'Send lease offer'
    case 'signed': return 'Schedule install survey'
    case 'declined': return 'Re-try in 6 months'
  }
}

const SEEDED_KEY = 'lega.leasing.seeded.v2'

export default function Leasing() {
  const items = useStore(leasingStore)
  const portfolios = useStore(portfolioStore)
  const [filter, setFilter] = useState<LeaseStatus | 'all'>('all')
  const [target, setTarget] = useState<number | null>(null)

  // First visit: show the sample Innovation Park pipeline. "Clear list" is respected afterwards.
  useEffect(() => {
    let seeded = false
    try {
      seeded = localStorage.getItem(SEEDED_KEY) === '1'
      localStorage.setItem(SEEDED_KEY, '1')
    } catch {
      /* storage unavailable: seed every visit */
    }
    if (!seeded && leasingStore.get().length === 0) loadSample()
  }, [])

  // roofs needed = sum of the plans sent to leasing
  useEffect(() => {
    let live = true
    const sent = portfolios.filter((p) => p.status === 'Sent to leasing')
    Promise.all([loadJson<RoofsData>('roofs.json'), loadJson<YieldData>('yield.json')]).then(([d, y]) => {
      if (live) setTarget(sent.length ? sent.reduce((a, p) => a + (buildPlan(p, d, y)?.roofsNeeded ?? 0), 0) : null)
    })
    return () => {
      live = false
    }
  }, [portfolios])

  const counts = Object.fromEntries(STATUS.map((s) => [s.id, items.filter((i) => i.status === s.id).length])) as Record<LeaseStatus, number>
  const needed = target ?? items.length
  const ranked = [...items].sort((a, b) => b.score - a.score)
  const rows = ranked.map((r, i) => ({ r, rank: i + 1 })).filter(({ r }) => filter === 'all' || r.status === filter)
  const setStatus = (id: string, status: LeaseStatus) => leasingStore.set((l) => l.map((x) => (x.roofId === id ? { ...x, status } : x)))
  const sentNames = portfolios.filter((p) => p.status === 'Sent to leasing').map((p) => p.buyer)
  const allHomes = items.length > 0 && items.every((i) => i.label.startsWith('Lot'))
  const subtitle = `${allHomes ? 'Homes' : 'Roofs'} to approach${sentNames.length === 1 ? ` for the ${sentNames[0]} portfolio` : ''}, best first · sample data`
  const pct = (n: number) => `${Math.min(100, (n / Math.max(needed, 1)) * 100)}%`

  return (
    <>
      <PageHeader
        title="Leasing list"
        subtitle={subtitle}
        right={items.length > 0 && <button type="button" className="btn-ghost !text-base" onClick={() => exportCsv(ranked)}>Export for field team</button>}
      />

      {items.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-medium">No roofs on the leasing list yet.</p>
          <p className="mt-1 text-sm text-muted">Add roofs from the Roof map, or send a plan from the Portfolio builder.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link to="/map" className="btn-ghost">Open roof map</Link>
            <Link to="/portfolio" className="btn-ghost">Open portfolio builder</Link>
            <button type="button" className="btn-primary" onClick={loadSample}>Load sample pipeline</button>
          </div>
        </div>
      ) : (
        <>
          <ul className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {STATUS.map((s) => (
              <li key={s.id} className="card px-6 py-5">
                <div className="text-sm text-muted">{s.label}</div>
                <div className="mt-2 text-[28px] font-medium leading-none num">{counts[s.id]}</div>
              </li>
            ))}
          </ul>

          <div className="mb-6">
            <div className="flex h-3 overflow-hidden rounded-full bg-line/70" role="progressbar" aria-label="Roofs signed" aria-valuemin={0} aria-valuemax={needed} aria-valuenow={counts.signed}>
              <div className="bg-primary" style={{ width: pct(counts.signed) }} />
              <div className="bg-primary-light" style={{ width: pct(counts.interested) }} />
            </div>
            <p className="mt-2 text-[15px] text-muted">
              <span className="num">{counts.signed}</span> signed + <span className="num">{counts.interested}</span> interested of{' '}
              <span className="num">{fmt(needed)}</span> roofs needed{target ? '' : ' (roofs on the list)'}
            </p>
          </div>

          <section className="card p-6">
            <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
              {FILTERS.map((c) => (
                <button key={c.id} type="button" aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}
                  className={`min-h-touch rounded-full border px-5 text-[15px] ${filter === c.id ? 'border-ink bg-ink text-white' : 'border-line bg-card hover:bg-page'}`}>
                  {c.label}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[15px]">
                <caption className="sr-only">Roofs on the leasing list, best first</caption>
                <thead className="border-b border-line text-left text-sm text-muted">
                  <tr>
                    <th scope="col" className="px-2 py-3 font-medium">Priority</th>
                    <th scope="col" className="px-2 py-3 font-medium">{allHomes ? 'Home' : 'Roof'}</th>
                    <th scope="col" className="px-2 py-3 font-medium">Score</th>
                    <th scope="col" className="px-2 py-3 font-medium">Why it ranks here</th>
                    <th scope="col" className="px-2 py-3 font-medium">Status</th>
                    <th scope="col" className="px-2 py-3 font-medium">Next step</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ r, rank }) => (
                    <tr key={r.roofId} className="border-b border-line last:border-0">
                      <td className="px-2 py-3 num">{rank}</td>
                      <td className="px-2 py-3">
                        <span className="font-semibold">{r.label}</span>
                        <div className="text-sm text-muted">{r.group}</div>
                      </td>
                      <td className="px-2 py-3 num">{r.score}</td>
                      <td className="px-2 py-3">{r.headline}</td>
                      <td className="px-2 py-3">
                        <label className="sr-only" htmlFor={`st-${r.roofId}`}>Status for {r.label}, {r.group}</label>
                        <select id={`st-${r.roofId}`} value={r.status} onChange={(e) => setStatus(r.roofId, e.target.value as LeaseStatus)}
                          className={`min-h-[36px] cursor-pointer appearance-none rounded-full border-0 px-3 text-sm font-semibold ${LABEL[r.status].cls}`}>
                          {STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-3">{nextStep(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div className="mt-3 flex justify-between text-xs text-muted">
            <span>Saved in this browser only. Status pills are editable.</span>
            <button type="button" className="min-h-touch underline underline-offset-2" onClick={() => leasingStore.set([])}>Clear list</button>
          </div>
        </>
      )}
    </>
  )
}

function exportCsv(rows: LeaseItem[]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const lines = [
    ['Priority', 'Roof', 'Area', 'Score', 'Why it ranks here', 'Status', 'Next step', 'MWh per year'],
    ...rows.map((r, i) => [i + 1, r.label, r.group, r.score, r.headline, LABEL[r.status].label, nextStep(r), r.mwh_yr]),
  ].map((l) => l.map(esc).join(','))
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `lega-leasing-list-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** Sample pipeline: the good home roofs for the Innovation Park sample portfolio, with mixed outreach status. */
async function loadSample() {
  const d = await loadJson<RoofsData>('roofs.json')
  const roofs = d.sites.homes.zones
    .flatMap((z) => z.roofs.map((r) => ({ r, z })))
    .filter(({ r }) => r.score >= 75)
    .sort((a, b) => b.r.score - a.r.score)
  // deterministic mix: best roofs were approached first, so more of them have progressed
  const status = (i: number): LeaseStatus => {
    const h = (i * 2654435761) % 100
    if (i < 70) return h < 40 ? 'signed' : h < 62 ? 'interested' : h < 80 ? 'visited' : h < 90 ? 'declined' : 'to_approach'
    return h < 10 ? 'visited' : 'to_approach'
  }
  leasingStore.set(roofs.map(({ r, z }, i) => leaseItem(r, z, 'homes', SAMPLE_PORTFOLIO_ID, status(i))))
}
