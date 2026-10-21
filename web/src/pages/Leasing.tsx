import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, SampleNote } from '../components/ui'
import { fmt, loadJson } from '../lib/data'
import type { RoofsData, YieldData } from '../lib/data'
import { buildPlan, portfolioStore } from '../lib/portfolio'
import { leasingStore, useStore, type LeaseItem, type LeaseStatus } from '../lib/store'

const STATUS: { id: LeaseStatus; label: string; cls: string; next: string }[] = [
  { id: 'to_approach', label: 'To approach', cls: 'bg-page text-ink border border-line', next: 'Send intro letter + book a roof visit' },
  { id: 'visited', label: 'Visited', cls: 'bg-[#E4EEF4] text-[#1D4E6B]', next: 'Share savings estimate and lease terms' },
  { id: 'interested', label: 'Interested', cls: 'bg-amber-soft text-ink', next: 'Structural check, then draft lease' },
  { id: 'signed', label: 'Signed', cls: 'bg-primary text-white', next: 'Schedule installation' },
  { id: 'declined', label: 'Declined', cls: 'bg-[#F6E1D8] text-warn', next: 'Log reason; revisit in 12 months' },
]
const S = Object.fromEntries(STATUS.map((s) => [s.id, s])) as Record<LeaseStatus, (typeof STATUS)[number]>

const priority = (score: number) => (score >= 85 ? 'High' : score >= 75 ? 'Medium' : 'Low')

export default function Leasing() {
  const items = useStore(leasingStore)
  const portfolios = useStore(portfolioStore)
  const [filter, setFilter] = useState<LeaseStatus | 'all'>('all')
  const [target, setTarget] = useState<number | null>(null)

  // roofs needed = sum of plans sent to leasing (computed lazily from data files)
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
  const signed = counts.signed
  const needed = target ?? items.length
  const rows = [...items].filter((i) => filter === 'all' || i.status === filter).sort((a, b) => b.score - a.score)
  const setStatus = (id: string, status: LeaseStatus) => leasingStore.set((l) => l.map((x) => (x.roofId === id ? { ...x, status } : x)))

  return (
    <>
      <PageHeader title="Leasing list" subtitle="Every roof SDP plans to lease, ranked, with the next step for the outreach team." right={<SampleNote>Owner details are sample data.</SampleNote>} />

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
          <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {STATUS.map((s) => (
              <li key={s.id} className="card p-4">
                <div className="label">{s.label}</div>
                <div className="mt-1 text-2xl font-semibold num">{counts[s.id]}</div>
              </li>
            ))}
          </ul>

          <section className="card mb-6 p-4" aria-labelledby="prog-h">
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <h2 id="prog-h" className="font-semibold">Progress toward roofs needed</h2>
              <span className="num">{signed} signed of {fmt(needed)} {target ? 'needed by plans sent to leasing' : 'on the list'}</span>
            </div>
            <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-page" role="progressbar" aria-valuemin={0} aria-valuemax={needed} aria-valuenow={signed} aria-label="Roofs signed">
              <div className="bg-primary" style={{ width: `${Math.min(100, (signed / Math.max(needed, 1)) * 100)}%` }} />
              <div className="bg-amber" style={{ width: `${Math.min(100, (counts.interested / Math.max(needed, 1)) * 100)}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted"><span className="inline-block h-2 w-2 rounded-full bg-primary" /> signed · <span className="inline-block h-2 w-2 rounded-full bg-amber" /> interested</p>
          </section>

          <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
            {[{ id: 'all' as const, label: `All (${items.length})` }, ...STATUS.map((s) => ({ id: s.id, label: `${s.label} (${counts[s.id]})` }))].map((c) => (
              <button key={c.id} type="button" aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}
                className={`min-h-touch rounded-full border px-4 text-sm ${filter === c.id ? 'border-ink bg-ink text-white' : 'border-line bg-card hover:bg-page'}`}>
                {c.label}
              </button>
            ))}
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Roofs on the leasing list</caption>
              <thead className="border-b border-line text-left">
                <tr className="label">
                  <th scope="col" className="px-4 py-3 font-medium">Priority</th>
                  <th scope="col" className="px-4 py-3 font-medium">Roof</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">Score</th>
                  <th scope="col" className="px-4 py-3 font-medium">Why it ranks here</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Next step</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Row key={r.roofId} r={r} onStatus={setStatus} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-between text-xs text-muted">
            <span>Saved in this browser only.</span>
            <button type="button" className="min-h-touch underline underline-offset-2" onClick={() => leasingStore.set([])}>Clear list</button>
          </div>
        </>
      )}
    </>
  )
}

function Row({ r, onStatus }: { r: LeaseItem; onStatus: (id: string, s: LeaseStatus) => void }) {
  const p = priority(r.score)
  return (
    <tr className="border-b border-line last:border-0 align-top">
      <td className="px-4 py-3">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${p === 'High' ? 'bg-primary/10 text-primary' : p === 'Medium' ? 'bg-amber-soft text-ink' : 'bg-page text-muted'}`}>{p}</span>
      </td>
      <td className="px-4 py-3">
        <span className="font-medium num">{r.roofId}</span>
        <div className="text-xs text-muted">{r.site === 'business_park' ? `Zone ${r.zoneId}` : r.zoneId} · {fmt(r.mwh_yr, 1)} MWh/yr</div>
      </td>
      <td className="px-4 py-3 text-right num font-semibold">{r.score}</td>
      <td className="px-4 py-3 text-xs text-muted max-w-xs">{r.why.join(' · ')}</td>
      <td className="px-4 py-3">
        <label className="sr-only" htmlFor={`st-${r.roofId}`}>Status for {r.roofId}</label>
        <select id={`st-${r.roofId}`} value={r.status} onChange={(e) => onStatus(r.roofId, e.target.value as LeaseStatus)}
          className={`min-h-touch rounded-full px-3 text-xs font-semibold ${S[r.status].cls}`}>
          {STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </td>
      <td className="px-4 py-3 text-sm">{S[r.status].next}</td>
    </tr>
  )
}

async function loadSample() {
  const d = await loadJson<RoofsData>('roofs.json')
  const roofs = d.sites.business_park.zones.flatMap((z) => z.roofs.map((r) => ({ r, z }))).sort((a, b) => b.r.score - a.r.score).slice(0, 24)
  const cycle: LeaseStatus[] = ['signed', 'signed', 'interested', 'visited', 'to_approach', 'interested', 'to_approach', 'declined', 'to_approach', 'visited', 'to_approach', 'to_approach']
  leasingStore.set(roofs.map(({ r, z }, i) => ({
    roofId: r.id, zoneId: z.id, site: 'business_park', score: r.score, mwh_yr: r.mwh_yr, why: r.why,
    status: cycle[i % cycle.length], addedAt: new Date().toISOString(),
  })))
}
