import { useEffect, useMemo, useState } from 'react'
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '../components/ui'
import { fmt, useJson } from '../lib/data'
import type { YieldData } from '../lib/data'
import { loadRoofs, markScanned, scannedStore, type TownshipIndex } from '../lib/townships'
import type { Pattern, Safety, Unit } from '../lib/formulas'
import {
  BUYER_LOCATIONS,
  buildPlan,
  GOOD_SCORE,
  newPortfolio,
  PATTERN_INFO,
  portfolioStore,
  requirement,
  SAFETY_INFO,
  STATUS_LABEL,
  townshipStats,
  type Plan,
  type Portfolio as P,
} from '../lib/portfolio'
import { leaseItemSat, leasingStore, shortlistStore, useStore, type LeaseItem } from '../lib/store'

export default function Portfolio() {
  return (
    <Routes>
      <Route index element={<List />} />
      <Route path=":id/details" element={<Details />} />
      <Route path=":id/requirement" element={<RequirementStep />} />
      <Route path=":id/plan" element={<PlanStep />} />
    </Routes>
  )
}

function usePortfolio(): [P | undefined, (patch: Partial<P>) => void] {
  const { id } = useParams()
  const all = useStore(portfolioStore)
  const p = all.find((x) => x.id === id)
  const update = (patch: Partial<P>) => portfolioStore.set((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  return [p, update]
}

const STEPS = ['Buyer details', 'Requirement', 'Roofs & plan']

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mb-6 flex flex-wrap gap-2" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li
          key={s}
          aria-current={i === step ? 'step' : undefined}
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
            i === step ? 'border-primary bg-primary text-white' : i < step ? 'border-primary/40 bg-card text-primary' : 'border-line bg-card text-muted'
          }`}
        >
          <span className="num text-xs">{i < step ? '✓' : i + 1}</span>
          {s}
        </li>
      ))}
    </ol>
  )
}

const STATUS_CLS: Record<P['status'], string> = {
  Draft: 'bg-page text-muted',
  'Plan ready': 'bg-amber-soft text-ink',
  'Sent to leasing': 'bg-primary/10 text-primary',
}

function List() {
  const all = useStore(portfolioStore)
  const { data } = useJson<TownshipIndex>('townships/index.json')
  const { data: y } = useJson<YieldData>('yield.json')
  const scanned = useStore(scannedStore)
  const navigate = useNavigate()

  const create = () => {
    const p = newPortfolio()
    portfolioStore.set((l) => [p, ...l])
    navigate(`/portfolio/${p.id}/details`)
  }

  return (
    <>
      <PageHeader
        title="Portfolios"
        subtitle="One portfolio = one buyer and the group of roofs that supplies them · sample data"
        right={<button type="button" className="btn-primary !text-base" onClick={create}>+ New portfolio</button>}
      />
      <div className="card overflow-x-auto">
        <table className="w-full text-[15px]">
          <caption className="sr-only">Saved portfolios</caption>
          <thead className="border-b border-line text-left text-sm text-muted">
            <tr>
              <th scope="col" className="px-6 py-4 font-medium">Buyer</th>
              <th scope="col" className="px-4 py-4 font-medium">Required</th>
              <th scope="col" className="px-4 py-4 font-medium">Uses power</th>
              <th scope="col" className="px-4 py-4 font-medium">Roofs needed</th>
              <th scope="col" className="px-4 py-4 font-medium">Status</th>
              <th scope="col" className="px-6 py-4"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {all.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-10 text-center text-muted">No portfolios yet. Start with “+ New portfolio”.</td></tr>
            )}
            {all.map((p) => {
              const plan = data && y && p.demand > 0 ? buildPlan(p, data, y, scanned) : null
              return (
                <tr key={p.id} className="border-b border-line last:border-0">
                  <td className="px-6 py-4">
                    <span className="font-semibold">{p.buyer || <span className="text-muted">Untitled buyer</span>}</span>
                    <div className="text-sm text-muted">{p.location}</div>
                  </td>
                  <td className="px-4 py-4 num">{p.demand > 0 ? `${fmt(requirement(p).needYr)} MWh/yr` : '—'}</td>
                  <td className="px-4 py-4">{PATTERN_INFO[p.pattern].label}</td>
                  <td className="px-4 py-4 num">{plan ? fmt(plan.roofsNeeded) : '—'}</td>
                  <td className="px-4 py-4"><span className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_CLS[p.status]}`}>{STATUS_LABEL[p.status]}</span></td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end gap-2">
                      <Link className="btn-ghost" to={`/portfolio/${p.id}/details`}>Edit details</Link>
                      <Link className="btn-dark" to={`/portfolio/${p.id}/${p.demand > 0 ? 'plan' : 'details'}`}>Open plan</Link>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">Saved in this browser only. Sample buyers, not real contracts.</p>
    </>
  )
}

function Details() {
  const [p, update] = usePortfolio()
  const navigate = useNavigate()
  const [buyer, setBuyer] = useState(p?.buyer ?? '')
  const [location, setLocation] = useState(p?.location ?? BUYER_LOCATIONS[0])
  const [demand, setDemand] = useState(p && p.demand > 0 ? String(p.demand) : '')
  const [unit, setUnit] = useState<Unit>(p?.unit ?? 'year')
  const [pattern, setPattern] = useState<Pattern>(p?.pattern ?? 'office')
  const [tried, setTried] = useState(false)
  const [csvNote, setCsvNote] = useState(false)

  if (!p) return <NotFound />
  const demandNum = Number(demand)
  const errors = {
    buyer: buyer.trim() ? null : 'Enter the buyer’s name.',
    demand: demand.trim() && Number.isFinite(demandNum) && demandNum > 0 ? null : 'Enter a demand greater than 0.',
  }
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (errors.buyer || errors.demand) return
    update({ buyer: buyer.trim(), location, demand: demandNum, unit, pattern })
    navigate(`/portfolio/${p.id}/requirement`)
  }

  return (
    <>
      <PageHeader title={p.buyer ? `Edit: ${p.buyer}` : 'New portfolio'} />
      <Stepper step={0} />
      <form onSubmit={submit} noValidate className="card max-w-3xl space-y-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="buyer" className="text-sm font-medium">Buyer name</label>
            <input id="buyer" className="input mt-1" value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder="e.g. Innovation Park"
              aria-invalid={tried && !!errors.buyer} aria-describedby="buyer-err" />
            {tried && errors.buyer && <p id="buyer-err" className="mt-1 text-sm text-warn">{errors.buyer}</p>}
          </div>
          <div>
            <label htmlFor="loc" className="text-sm font-medium">Buyer location</label>
            <select id="loc" className="input mt-1" value={location} onChange={(e) => setLocation(e.target.value)}>
              {BUYER_LOCATIONS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="demand" className="text-sm font-medium">Electricity demand</label>
          <div className="mt-1 flex gap-2">
            <input id="demand" inputMode="decimal" className="input max-w-xs num" value={demand} onChange={(e) => setDemand(e.target.value)}
              placeholder="e.g. 1800" aria-invalid={tried && !!errors.demand} aria-describedby="demand-err" />
            <div role="group" aria-label="Demand unit" className="inline-flex rounded-lg border border-line p-1">
              {(['year', 'month'] as Unit[]).map((u) => (
                <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)}
                  className={`min-h-[36px] rounded-md px-3 text-sm ${unit === u ? 'bg-primary text-white' : 'text-muted'}`}>
                  MWh per {u}
                </button>
              ))}
            </div>
          </div>
          {tried && errors.demand && <p id="demand-err" className="mt-1 text-sm text-warn">{errors.demand}</p>}
          <button type="button" className="mt-2 min-h-touch text-sm text-primary underline underline-offset-2" onClick={() => setCsvNote(true)}>
            Upload CSV of meter readings
          </button>
          {csvNote && <p className="text-xs text-muted">CSV upload is a stub in this prototype — enter the annual or monthly total instead.</p>}
        </div>

        <fieldset>
          <legend className="text-sm font-medium">Usage pattern</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {(Object.keys(PATTERN_INFO) as Pattern[]).map((k) => (
              <label key={k} className={`cursor-pointer rounded-card border p-4 ${pattern === k ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-line hover:bg-page'}`}>
                <input type="radio" name="pattern" value={k} checked={pattern === k} onChange={() => setPattern(k)} className="sr-only" />
                <span className="block font-medium">{PATTERN_INFO[k].label}</span>
                <span className="block text-xs text-muted">{PATTERN_INFO[k].hours}</span>
                <span className="mt-2 block text-xs">{PATTERN_INFO[k].note}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex justify-between gap-2">
          <Link
            to="/portfolio"
            className="btn-ghost"
            onClick={() => !p.buyer && portfolioStore.set((l) => l.filter((x) => x.id !== p.id))}
          >
            Cancel
          </Link>
          <button type="submit" className="btn-primary">Continue</button>
        </div>
      </form>
    </>
  )
}

function RequirementStep() {
  const [p] = usePortfolio()
  const { data } = useJson<TownshipIndex>('townships/index.json')
  const [shown, setShown] = useState(false)
  if (!p) return <NotFound />
  const req = requirement(p)
  const first = data?.townships.find((t) => t.id === (p.townships[0] ?? 'elmina'))
  const bp = first ? { avgMwh: first.summary.avg_mwh_good } : null
  const kwpPerRoof = 120
  const siteYield = first?.summary.yield_kwh_kwp ?? 1287

  return (
    <>
      <PageHeader title={p.buyer} subtitle={`${p.location} · ${PATTERN_INFO[p.pattern].label}`} />
      <Stepper step={1} />
      <div className="card max-w-3xl p-6">
        <p className="text-sm text-muted">
          {p.buyer} uses <span className="num text-ink">{fmt(p.demand)}</span> MWh per {p.unit}. Solar only runs in daylight, so we size for
          the share of demand that falls in solar hours.
        </p>
        {!shown ? (
          <button type="button" className="btn-primary mt-4" onClick={() => setShown(true)}>Calculate requirement</button>
        ) : (
          <>
            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              <Stat label="Total need" value={`${fmt(req.needYr)} MWh/yr`} sub={`${fmt(req.perDay, 1)} MWh per day`} />
              <Stat label="Solar-coverable share" value={`${Math.round(req.share * 100)}%`} sub={`${fmt(req.solarNeed)} MWh/yr from rooftop solar`} />
              <Stat label="Solar capacity needed" value={`${fmt((req.solarNeed * 1000) / siteYield)} kWp`} sub={`at ${fmt(siteYield)} kWh/kWp/yr`} />
              <Stat
                label="Roofs, before buffer"
                value={bp ? `≈ ${fmt(Math.ceil(req.solarNeed / bp.avgMwh))}` : '…'}
                sub={bp && first ? `good roofs in ${first.name} avg ${fmt(bp.avgMwh, 1)} MWh/yr` : `≈ ${kwpPerRoof} kWp each`}
              />
            </dl>
            {p.pattern !== 'office' && (
              <p className="mt-4 rounded-lg border border-amber/60 bg-amber-soft p-3 text-sm">
                {p.pattern === 'mall'
                  ? 'Mall hours run into the evening: about 30% of demand falls after sunset and needs grid power or storage.'
                  : 'A 24-hour load uses more than half its power at night. Rooftop solar covers the daytime share only; pair it with grid supply or storage.'}
              </p>
            )}
            <p className="mt-3 text-xs text-muted">Usage pattern shares (95% / 70% / 45%) are placeholders until metered load profiles are available.</p>
            <div className="mt-6 flex justify-between">
              <Link to={`/portfolio/${p.id}/details`} className="btn-ghost">Back</Link>
              <Link to={`/portfolio/${p.id}/plan`} className="btn-primary">Next: choose roofs</Link>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line p-4">
      <dt className="label">{label}</dt>
      <dd className="mt-1 text-xl font-semibold num">{value}</dd>
      {sub && <dd className="mt-0.5 text-xs text-muted">{sub}</dd>}
    </div>
  )
}

function PlanStep() {
  const [p, update] = usePortfolio()
  const { data } = useJson<TownshipIndex>('townships/index.json')
  const { data: y } = useJson<YieldData>('yield.json')
  const scanned = useStore(scannedStore)
  const [query, setQuery] = useState('')
  const [scanning, setScanning] = useState<string | null>(null)
  const [sent, setSent] = useState<number | null>(null)
  const leasing = useStore(leasingStore)
  const shortlist = useStore(shortlistStore)

  const plan = useMemo(() => (p && data && y ? buildPlan(p, data, y, scanned) : null), [p, data, y, scanned])
  const isDraft = p?.status === 'Draft'
  useEffect(() => {
    if (plan && isDraft) update({ status: 'Plan ready' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, isDraft])
  if (!p) return <NotFound />
  if (!data || !y) return <p className="text-muted">Loading…</p>

  const toggle = (id: string) =>
    update({ townships: p.townships.includes(id) ? p.townships.filter((t) => t !== id) : [...p.townships, id] })
  const scan = (id: string) => {
    setScanning(id)
    // same precomputed scan the Roof map runs; here we only need its totals
    loadRoofs(id).then(() =>
      window.setTimeout(() => {
        markScanned(id)
        update({ townships: [...new Set([...p.townships, id])] })
        setScanning(null)
      }, 1200),
    )
  }

  const send = async () => {
    if (!plan) return
    const have = new Set(leasing.map((l) => l.roofId))
    const items: LeaseItem[] = []
    for (const a of plan.allocation) {
      const roofs = await loadRoofs(a.township.id)
      const good = roofs
        .filter((r) => r.score >= GOOD_SCORE)
        // hand-picked roofs from the map go first, then best score
        .sort((x, y2) => Number(shortlist.includes(y2.id)) - Number(shortlist.includes(x.id)) || y2.score - x.score || y2.kwp - x.kwp)
        .slice(0, a.roofs)
      for (const r of good) if (!have.has(r.id)) items.push(leaseItemSat(r, a.township.name, p.id))
    }
    leasingStore.set((l) => [...l, ...items])
    update({ status: 'Sent to leasing' })
    setSent(items.length)
  }

  const shown = data.townships.filter((t) => `${t.name} ${t.state}`.toLowerCase().includes(query.toLowerCase()))

  return (
    <>
      <PageHeader title="Roofs & plan" subtitle="Roof outlines and yield are real (satellite footprints, NASA POWER); roof scores are sample data" />
      <Stepper step={2} />

      <div className="card mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
        <span className="font-semibold">{p.buyer}</span>
        <span className="text-muted">{p.location}</span>
        <span className="num">{fmt(requirement(p).needYr)} MWh/yr</span>
        <span>{PATTERN_INFO[p.pattern].label}</span>
        <Link to={`/portfolio/${p.id}/details`} className="ml-auto min-h-touch inline-flex items-center text-primary underline underline-offset-2">Edit buyer details</Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-6">
          <section className="card p-4" aria-labelledby="town-h">
            <h2 id="town-h" className="font-semibold">Townships</h2>
            <label htmlFor="town-q" className="sr-only">Search townships</label>
            <input id="town-q" className="input mt-3" placeholder="Search townships" value={query} onChange={(e) => setQuery(e.target.value)} />
            <ul className="mt-3 space-y-1">
              {shown.map((t) => {
                const st = townshipStats(t, scanned)
                return (
                  <li key={t.id} className="flex min-h-touch items-center gap-3 rounded-lg px-2 hover:bg-page">
                    {st ? (
                      <>
                        <input id={`t-${t.id}`} type="checkbox" className="h-5 w-5 accent-primary" checked={p.townships.includes(t.id)} onChange={() => toggle(t.id)} />
                        <label htmlFor={`t-${t.id}`} className="flex-1 cursor-pointer py-2 text-sm">
                          {t.name}
                          <span className="block text-xs text-muted">
                            <span className="num">{fmt(st.good)}</span> good roofs · {fmt(st.avgMwh, 1)} MWh/yr each · {t.state}
                          </span>
                        </label>
                      </>
                    ) : (
                      <>
                        <span className="h-5 w-5" aria-hidden="true" />
                        <span className="flex-1 py-2 text-sm">{t.name}<span className="block text-xs text-muted">Not scanned yet</span></span>
                        <button type="button" className="btn-ghost !min-h-[36px] !px-3" disabled={scanning !== null} onClick={() => scan(t.id)}>
                          {scanning === t.id ? 'Scanning…' : 'Scan roofs'}
                        </button>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="card p-4" aria-labelledby="safety-h">
            <h2 id="safety-h" className="font-semibold">Safety level</h2>
            <p className="text-xs text-muted">Extra roofs signed to absorb cloudy months and owners who back out.</p>
            <div role="radiogroup" aria-labelledby="safety-h" className="mt-3 grid grid-cols-3 gap-2">
              {(Object.keys(SAFETY_INFO) as Safety[]).map((s) => (
                <button key={s} type="button" role="radio" aria-checked={p.safety === s} onClick={() => update({ safety: s })}
                  className={`min-h-touch rounded-lg border px-2 py-2 text-sm ${p.safety === s ? 'border-primary bg-primary text-white' : 'border-line hover:bg-page'}`}>
                  <span className="block font-medium">{SAFETY_INFO[s].label}</span>
                  <span className={`block text-xs ${p.safety === s ? 'text-white/85' : 'text-muted'}`}>{SAFETY_INFO[s].note}</span>
                </button>
              ))}
            </div>
          </section>
        </div>

        {plan ? <PlanPanel p={p} plan={plan} y={y} onSend={send} sent={sent} /> : (
          <section className="card p-8 text-center text-muted">Select at least one scanned township to build the plan.</section>
        )}
      </div>
    </>
  )
}

function PlanPanel({ p, plan, y, onSend, sent }: { p: P; plan: Plan; y: YieldData; onSend: () => void; sent: number | null }) {
  const towns = plan.allocation.filter((a) => a.roofs > 0)
  const sendable = plan.allocation.reduce((a, x) => a + x.roofs, 0)
  // if the townships can't supply roofsNeeded, show what the available good roofs would actually cover
  const availableWorst = plan.enough ? null : Math.min(...plan.covers) * (plan.goodAvailable / plan.roofsNeeded)
  const where = towns.map((a) => a.township.name).join(' and ')
  const dropPct = Math.round(plan.dropoutCover * 100)
  const checks = [
    {
      ok: plan.enough,
      title: plan.enough ? 'Enough good roofs' : 'Not enough good roofs',
      text: `${fmt(plan.goodAvailable)} roofs score ${GOOD_SCORE}+ in the selected townships; the plan needs ${fmt(plan.roofsNeeded)}.${plan.enough ? '' : ' Add or scan another township.'}`,
    },
    {
      ok: p.pattern === 'office' ? true : p.pattern === 'mall' ? 'warn' : false,
      title: p.pattern === 'office' ? 'Usage matches solar hours' : 'Usage only partly matches solar hours',
      text: `Solar can cover about ${Math.round(plan.share * 100)}% of ${PATTERN_INFO[p.pattern].label.toLowerCase()} demand; the rest needs grid supply${p.pattern === 'office' ? '.' : ' or storage.'}`,
    },
    {
      ok: plan.dropoutCover >= 1 ? true : plan.dropoutCover >= 0.9 ? 'warn' : false,
      title: 'Dropout buffer',
      text: `If 1 in 5 owners decline, the worst month still covers ${dropPct}% of the solar share.`,
    },
  ] as const

  return (
    <section className="card p-6" aria-labelledby="plan-h" aria-live="polite">
      <div className="label">Plan</div>
      <h2 id="plan-h" className="mt-1 text-4xl font-semibold">
        Sign up <span className="num text-primary">{fmt(plan.roofsNeeded)}</span> roofs
      </h2>
      <p className="mt-2 max-w-2xl text-muted">
        {fmt(plan.roofsNeeded)} roofs in {where || 'the selected townships'} cover {Math.round(plan.share * 100)}% of {p.buyer}’s demand
        ({fmt(plan.solarNeed)} MWh/yr), including a {Math.round(plan.buffer * 100)}% buffer ({fmt(plan.roofsBase)} before buffer, avg {fmt(plan.avgMwhPerRoof, 1)} MWh/yr per roof).
      </p>

      <ul className="mt-5 grid gap-3 md:grid-cols-3">
        {checks.map((c) => (
          <li key={c.title} className="rounded-lg border border-line p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span aria-hidden="true" className={`grid h-5 w-5 place-items-center rounded-full text-xs text-white ${c.ok === true ? 'bg-primary' : c.ok === 'warn' ? 'bg-amber' : 'bg-warn'}`}>
                {c.ok === true ? '✓' : '!'}
              </span>
              {c.title}
            </div>
            <p className="mt-1 text-xs text-muted">{c.text}</p>
          </li>
        ))}
      </ul>

      <h3 className="mt-6 text-sm font-semibold">Where the roofs come from</h3>
      <ul className="mt-2 space-y-2">
        {plan.allocation.map((a) => (
          <li key={a.township.id}>
            <div className="flex justify-between text-sm">
              <span>{a.township.name}</span>
              <span className="num">{fmt(a.roofs)} <span className="text-muted">/ {fmt(a.stats.good)} good</span></span>
            </div>
            <div className="mt-1 h-2.5 rounded-full bg-page">
              <div className="h-2.5 rounded-full bg-primary" style={{ width: `${(a.roofs / Math.max(plan.roofsNeeded, 1)) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>

      <h3 className="mt-6 text-sm font-semibold">Monthly cover of the solar share</h3>
      <p className="text-xs text-muted">From the 2015–2025 average monthly yield (NASA POWER + pvlib), assuming all {fmt(plan.roofsNeeded)} roofs are signed.</p>
      {availableWorst !== null && (
        <p className="mt-2 rounded-lg border border-warn/40 bg-[#F6E1D8] px-3 py-2 text-sm text-warn">
          With only the {fmt(plan.goodAvailable)} good roofs available, the worst month would cover {Math.round(availableWorst * 100)}% of the solar share.
        </p>
      )}
      <ul className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-12">
        {plan.covers.map((c, i) => {
          const pct = Math.round(c * 100)
          const cls = pct >= 100 ? 'bg-primary text-white' : pct >= 90 ? 'bg-amber text-ink' : 'bg-warn text-white'
          return (
            <li key={i} className={`rounded-lg p-2 text-center ${cls}`}>
              <div className="text-xs">{y.monthly[i].month}</div>
              <div className="num text-sm font-semibold">{pct}%</div>
            </li>
          )
        })}
      </ul>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" onClick={onSend}>Send {fmt(sendable)} roofs to leasing list</button>
        {sent !== null && (
          <p className="text-sm" role="status">
            Added {sent} new roofs. <Link to="/leasing" className="text-primary underline underline-offset-2">Open leasing list</Link>
          </p>
        )}
      </div>
    </section>
  )
}

function NotFound() {
  return (
    <div className="card p-8 text-center">
      <p>Portfolio not found.</p>
      <Link to="/portfolio" className="btn-ghost mt-4">Back to portfolios</Link>
    </div>
  )
}
