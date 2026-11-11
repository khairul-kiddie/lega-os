import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Kpi, PageHeader, SampleNote } from '../components/ui'
import { fmt, useJson, type YieldData } from '../lib/data'
import { loadCommunity, type CommunityIndex } from '../lib/community'
import {
  assetsFromFacilities,
  assetStore,
  CRITICALITY_INFO,
  DOD,
  EFF,
  evaluate,
  GOAL_INFO,
  newAsset,
  OWNERSHIP_INFO,
  type Asset,
  type AssetType,
  type Goal,
  type PlannerData,
} from '../lib/planner'
import { monthlyShare, portfolioStore, requirement } from '../lib/portfolio'
import { leaseItemSat, leasingStore, useStore, type LeaseItem } from '../lib/store'
import { loadRoofs, type TownshipIndex } from '../lib/townships'
import Community from './Community'

export default function Planner() {
  return (
    <Routes>
      <Route index element={<List />} />
      <Route path="map" element={<><PlannerTabs active="map" /><Community embedded /></>} />
      <Route path=":id/details" element={<Details />} />
      <Route path=":id/goal" element={<GoalStep />} />
      <Route path=":id/plan" element={<PlanStep />} />
    </Routes>
  )
}

export const PLANNER_PORTFOLIO = (id: string) => `planner-${id}`

/** Seeds the planner with the City of Elmina's real OpenStreetMap facilities on first visit. */
export function useAssets(): [Asset[] | null, PlannerData | null] {
  const all = useStore(assetStore)
  const { data } = useJson<PlannerData>('load_profiles.json')
  useEffect(() => {
    if (all !== null || !data) return
    loadCommunity('elmina').then((plan) => {
      if (assetStore.get() !== null) return
      const guard: Asset = {
        ...newAsset('guardhouse', data.profiles.guardhouse),
        id: 'sample-guardhouse-p3', name: 'Guardhouse Precinct 3', goal: 'both', backupHours: 72, createdAt: '2026-11-01T09:30:00.000Z',
      }
      assetStore.set([...assetsFromFacilities(plan, data), guard])
    })
  }, [all, data])
  return [all, data]
}

function useAsset(): [Asset | undefined, (patch: Partial<Asset>) => void] {
  const { id } = useParams()
  const all = useStore(assetStore) ?? []
  const a = all.find((x) => x.id === id)
  const update = (patch: Partial<Asset>) => assetStore.set((list) => (list ?? []).map((x) => (x.id === id ? { ...x, ...patch } : x)))
  return [a, update]
}

/** Average size of a good roof left after the community plan: what one leased (CREAM) roof adds. */
function roofKwpFor(tidx: TownshipIndex | null | undefined, township: string) {
  const t = tidx?.townships.find((x) => x.id === township)
  if (!t) return 40
  const mwh = t.summary.avg_mwh_surplus ?? t.summary.avg_mwh_good
  return Math.max(5, (mwh * 1000) / t.summary.yield_kwh_kwp)
}

function PlannerTabs({ active }: { active: 'list' | 'map' }) {
  const tab = (id: 'list' | 'map', to: string, label: string) => (
    <Link to={to} aria-current={active === id ? 'page' : undefined}
      className={`min-h-touch inline-flex items-center rounded-md px-4 text-sm font-medium ${active === id ? 'bg-ink text-white' : 'text-ink hover:bg-page'}`}>{label}</Link>
  )
  return (
    <nav aria-label="Planner views" className="mb-5 inline-flex rounded-lg border border-line bg-card p-1">
      {tab('list', '/planner', 'Community buildings')}
      {tab('map', '/planner/map', 'Township map')}
    </nav>
  )
}

const STEPS = ['Asset details', 'Goal', 'Plan']
function Stepper({ step }: { step: number }) {
  return (
    <ol className="mb-6 flex flex-wrap gap-2" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li key={s} aria-current={i === step ? 'step' : undefined}
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${i === step ? 'border-primary bg-primary text-white' : i < step ? 'border-primary/40 bg-card text-primary' : 'border-line bg-card text-muted'}`}>
          <span className="num text-xs">{i < step ? '✓' : i + 1}</span>{s}
        </li>
      ))}
    </ol>
  )
}

const Tick = ({ ok }: { ok: boolean | 'warn' }) => (
  <span aria-label={ok === true ? 'yes' : ok === 'warn' ? 'partly' : 'no'}
    className={`inline-grid h-5 w-5 place-items-center rounded-full text-xs text-white ${ok === true ? 'bg-primary' : ok === 'warn' ? 'bg-amber' : 'bg-warn'}`}>{ok === true ? '✓' : '!'}</span>
)

type SortKey = 'priority' | 'name' | 'use' | 'backup'

// ---------------------------------------------------------------- list
function List() {
  const [all, data] = useAssets()
  const { data: tidx } = useJson<TownshipIndex>('townships/index.json')
  const portfolios = useStore(portfolioStore)
  const navigate = useNavigate()
  const [sort, setSort] = useState<SortKey>('priority')
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const rows = useMemo(() => {
    if (!all || !data) return []
    const r = all.map((a) => ({ a, r: evaluate(a, data, roofKwpFor(tidx, a.township)) }))
    const by: Record<SortKey, (x: (typeof r)[number]) => number | string> = {
      priority: (x) => -x.r.priority, name: (x) => x.a.name.toLowerCase(), use: (x) => -x.a.annualKwh, backup: (x) => -x.r.backup_hours,
    }
    return r.sort((x, y) => (by[sort](x) < by[sort](y) ? -1 : by[sort](x) > by[sort](y) ? 1 : 0))
  }, [all, data, tidx, sort])

  const totals = rows.reduce(
    (t, { r }) => ({ batt: t.batt + r.battery_kwh, fund: t.fund + r.fundingMwh, saved: t.saved + r.savedRmYr, neutral: t.neutral + Number(r.bill_neutral) }),
    { batt: 0, fund: 0, saved: 0, neutral: 0 },
  )
  const commercialMwh = portfolios.reduce((s, p) => s + (p.demand > 0 ? requirement(p).solarNeed : 0), 0)
  const th = (k: SortKey, label: string, cls = 'px-3') => (
    <th scope="col" className={`${cls} py-3 font-medium`} aria-sort={sort === k ? 'descending' : undefined}>
      <button type="button" className={`min-h-touch ${sort === k ? 'text-ink' : ''} hover:text-ink`} onClick={() => setSort(k)}>{label}{sort === k ? ' ↓' : ''}</button>
    </th>
  )

  return (
    <>
      <PageHeader eyebrow="Community first, commercially funded" title="Community energy planner"
        subtitle="Plan solar and batteries for the buildings a township depends on, ranked by community need, not revenue. Commercial buyers come last: they fund it."
        right={<button type="button" className="btn-primary !text-base" onClick={() => navigate('/planner/new/details')}>+ New asset</button>} />
      <PlannerTabs active="list" />
      {!all || !data ? <p className="text-muted">Loading…</p> : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Bill-neutral buildings" value={`${totals.neutral} of ${rows.length}`} hint="Solar over a year covers what they use" />
            <Kpi label="Community bills saved" value={`RM ${fmt(totals.saved / 1000)}k`} unit="/ yr" hint="At a sample RM 0.50 per kWh" />
            <Kpi label="Batteries to install" value={fmt(totals.batt)} unit="kWh" hint="For outage backup and after dark" />
            <Kpi label="Funded by commercial sales" value={fmt(totals.fund)} unit="MWh / yr" hint={`Pays the batteries back in 10 years · ${fmt(commercialMwh)} MWh/yr already planned`} />
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full text-[15px]">
              <caption className="sr-only">Community buildings, sorted by priority</caption>
              <thead className="border-b border-line text-left text-sm text-muted">
                <tr>
                  {th('priority', 'Priority', 'pl-6 pr-3')}
                  {th('name', 'Building')}
                  <th scope="col" className="px-3 py-3 font-medium">Owner · need</th>
                  <th scope="col" className="px-3 py-3 font-medium">Goal</th>
                  {th('use', 'Uses')}
                  <th scope="col" className="px-3 py-3 font-medium">Solar · battery</th>
                  {th('backup', 'Backup')}
                  <th scope="col" className="px-3 py-3 font-medium">Checks</th>
                  <th scope="col" className="px-6 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={9} className="px-6 py-10 text-center text-muted">No community buildings yet. Start with “+ New asset”.</td></tr>}
                {rows.map(({ a, r }) => (
                  <tr key={a.id} className="border-b border-line last:border-0">
                    <td className="pl-6 pr-3 py-3"><PriorityBadge v={r.priority} /></td>
                    <td className="px-3 py-3">
                      <span className="font-semibold">{a.name || <span className="text-muted">Untitled</span>}</span>
                      <div className="text-sm text-muted">{data.profiles[a.type].label}{a.osm ? ' · OpenStreetMap' : ''}{a.floodZone ? ' · flood zone' : ''}</div>
                    </td>
                    <td className="px-3 py-3 text-sm">{OWNERSHIP_INFO[a.ownership].label}<div className="text-muted">{CRITICALITY_INFO[a.criticality].label}</div></td>
                    <td className="px-3 py-3 text-sm">{GOAL_INFO[a.goal].label}</td>
                    <td className="px-3 py-3 num">{fmt(a.annualKwh / 1000, 1)} MWh</td>
                    <td className="px-3 py-3 num text-sm">{fmt(r.kwp, 1)} kWp<div className="text-muted">{r.battery_kwh ? `${fmt(r.battery_kwh)} kWh` : 'no battery'}</div></td>
                    <td className="px-3 py-3 num text-sm">{r.battery_kwh ? `${fmt(r.backup_hours)} h` : '—'}</td>
                    <td className="px-3 py-3">
                      <span className="flex gap-1" title="Bill-neutral · wettest week · SDP can own the battery">
                        <Tick ok={r.bill_neutral} /><Tick ok={r.wettest_week_ok} /><Tick ok={!r.battery_kwh || a.ownership === 'sdp' ? true : 'warn'} />
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      {confirmId === a.id ? (
                        <div className="flex items-center justify-end gap-2" role="group" aria-label={`Delete ${a.name}?`}>
                          <button type="button" className="btn-ghost" onClick={() => setConfirmId(null)}>Keep</button>
                          <button type="button" className="btn bg-warn text-white hover:bg-warn/90" onClick={() => { assetStore.set((l) => (l ?? []).filter((x) => x.id !== a.id)); setConfirmId(null) }}>Delete</button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <Link className="btn-dark" to={`/planner/${a.id}/plan`}>Open plan</Link>
                          <button type="button" className="btn-ghost !px-3" aria-label={`Delete ${a.name}`} onClick={() => setConfirmId(a.id)}>Delete</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">
            Checks: bill-neutral · lasts the wettest week (P90) · SDP can own the battery. Priority = 40% criticality + 25% people served + 20% flood-risk zone + 15% current bill.
            Buildings are real (OpenStreetMap); loads, people served and flood zones are sample values. Saved in this browser.
          </p>
          <FundedBy fund={totals.fund} />
          <div className="mt-4"><SampleNote>Load profiles, people served, flood zones and prices are sample values until SDP has bills and meter data.</SampleNote></div>
        </>
      )}
    </>
  )
}

function FundedBy({ fund }: { fund: number }) {
  const portfolios = useStore(portfolioStore)
  return (
    <section className="card mt-6 p-6" aria-labelledby="fund-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="fund-h" className="text-lg font-semibold">Funded by: commercial buyers</h2>
        <Link to="/portfolio" className="text-[15px] text-primary underline underline-offset-2">Commercial buyers →</Link>
      </div>
      <p className="mt-1 max-w-3xl text-[15px] text-muted">
        Good roofs left after the community plan supply local businesses. SDP’s margin on that power pays for the community batteries:
        about <span className="num font-semibold text-ink">{fmt(fund)} MWh</span> a year of sales covers them within 10 years.
      </p>
      <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {portfolios.filter((p) => p.demand > 0).map((p) => (
          <li key={p.id} className="rounded-lg border border-line p-4">
            <div className="font-semibold">{p.buyer}</div>
            <div className="text-sm text-muted num">{fmt(requirement(p).solarNeed)} MWh/yr from solar · funds community projects</div>
            <Link to={`/portfolio/${p.id}/plan`} className="mt-2 inline-flex min-h-touch items-center text-sm text-primary underline underline-offset-2">Open roof plan</Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function PriorityBadge({ v }: { v: number }) {
  const cls = v >= 70 ? 'bg-warn text-white' : v >= 45 ? 'bg-amber text-ink' : 'bg-page text-ink'
  return <span className={`inline-block min-w-[44px] rounded-full px-2.5 py-1 text-center text-sm font-semibold num ${cls}`}>{v}</span>
}

// ---------------------------------------------------------------- step 1
const TYPES: AssetType[] = ['hall', 'school', 'surau', 'clinic', 'guardhouse', 'commercial']

function Details() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const isNew = id === 'new'
  const [saved, update] = useAsset()
  const { data } = useJson<PlannerData>('load_profiles.json')
  const { data: cidx } = useJson<CommunityIndex>('community/index.json')
  const navigate = useNavigate()
  const [type, setType] = useState<AssetType>(saved?.type ?? ((params.get('type') as AssetType) || 'hall'))
  const [form, setForm] = useState<Asset | null>(saved ?? null)
  const [annual, setAnnual] = useState(saved ? String(saved.annualKwh) : '')
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!data || form || type === 'commercial') return
    const a = newAsset(type, data.profiles[type])
    setForm(a)
    setAnnual(String(a.annualKwh))
  }, [data, form, type])

  if (!isNew && !saved) return <NotFound />
  if (!data || !cidx) return <p className="text-muted">Loading…</p>

  const pickType = (t: AssetType) => {
    if (t === 'commercial') return navigate('/portfolio/new/details')
    setType(t)
    const p = data.profiles[t]
    const base = newAsset(t, p, form?.township)
    setForm((f) => ({ ...base, id: f?.id ?? base.id, name: f?.name ?? '', createdAt: f?.createdAt ?? base.createdAt }))
    setAnnual(String(p.typical_kwh))
  }
  if (!form) return <p className="text-muted">Loading…</p>
  const set = (patch: Partial<Asset>) => setForm({ ...form, ...patch })
  const annualNum = Number(annual.replace(/[,\s]/g, ''))
  const errors = { name: form.name.trim() ? null : 'Enter the building’s name.', annual: annualNum > 0 ? null : 'Enter the yearly use in kWh, e.g. 25000.' }
  const prof = data.profiles[form.type]

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (errors.name || errors.annual) return
    const a = { ...form, name: form.name.trim(), annualKwh: annualNum }
    if (isNew) assetStore.set((l) => [a, ...(l ?? [])])
    else update(a)
    navigate(`/planner/${a.id}/goal`)
  }

  return (
    <>
      <PageHeader title={isNew ? 'New community asset' : `Edit: ${saved?.name}`} />
      <Stepper step={0} />
      <form onSubmit={submit} noValidate className="card max-w-4xl space-y-6 p-6">
        <fieldset>
          <legend className="text-sm font-medium">Asset type</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TYPES.map((t) => {
              const p = data.profiles[t]
              const on = t === form.type
              return (
                <label key={t} className={`cursor-pointer rounded-card border p-4 ${on ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-line hover:bg-page'}`}>
                  <input type="radio" name="type" checked={on} onChange={() => pickType(t)} className="sr-only" />
                  <span className="flex items-center justify-between gap-2 font-medium">{p.label}{t === 'commercial' && <span className="rounded bg-amber-soft px-1.5 text-[11px]">funds community</span>}</span>
                  <MiniProfile kw={p.kw} em={p.emergency_kw} />
                  <span className="mt-1 block text-xs text-muted">{p.note}</span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="name" label="Name" err={tried ? errors.name : null}>
            <input id="name" className="input mt-1" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Dewan Komuniti Elmina (PPS)" aria-invalid={tried && !!errors.name} />
          </Field>
          <Field id="town" label="Township">
            <select id="town" className="input mt-1" value={form.township} onChange={(e) => set({ township: e.target.value })}>
              {cidx.townships.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field id="annual" label="Yearly use (kWh)" err={tried ? errors.annual : null}>
            <div className="mt-1 flex gap-2">
              <input id="annual" inputMode="decimal" className="input num" value={annual} onChange={(e) => setAnnual(e.target.value)} aria-invalid={tried && !!errors.annual} />
              <button type="button" className="btn-ghost whitespace-nowrap" onClick={() => setAnnual(String(prof.typical_kwh))}>Typical size</button>
            </div>
          </Field>
          <Field id="people" label="People served">
            <input id="people" inputMode="numeric" className="input mt-1 num" value={form.people} onChange={(e) => set({ people: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
          </Field>
          <Field id="roof" label="Usable solar on its own roof (kWp)">
            <input id="roof" inputMode="decimal" className="input mt-1 num" value={form.ownRoofKwp} onChange={(e) => set({ ownRoofKwp: Number(e.target.value) || 0 })} />
          </Field>
          <label className="flex min-h-touch items-center gap-3 self-end text-sm">
            <input type="checkbox" className="h-5 w-5 accent-primary" checked={form.floodZone} onChange={(e) => set({ floodZone: e.target.checked })} />
            In a flood-risk zone <span className="text-muted">(sample flag until JPS flood maps are added)</span>
          </label>
        </div>

        <Radios label="Ownership" value={form.ownership} onChange={(v) => set({ ownership: v })} options={OWNERSHIP_INFO} />
        <Radios label="Criticality" value={form.criticality} onChange={(v) => set({ criticality: v })} options={CRITICALITY_INFO} />

        <div className="flex justify-between gap-2">
          <Link to="/planner" className="btn-ghost">Cancel</Link>
          <button type="submit" className="btn-primary">Continue</button>
        </div>
      </form>
    </>
  )
}

function Field({ id, label, err, children }: { id: string; label: string; err?: string | null; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {children}
      {err && <p className="mt-1 text-sm text-warn">{err}</p>}
    </div>
  )
}

function Radios<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: Record<T, { label: string; note: string }> }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{label}</legend>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        {(Object.keys(options) as T[]).map((k) => (
          <label key={k} className={`cursor-pointer rounded-card border p-3 ${value === k ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-line hover:bg-page'}`}>
            <input type="radio" name={label} checked={value === k} onChange={() => onChange(k)} className="sr-only" />
            <span className="block font-medium">{options[k].label}</span>
            <span className="block text-xs text-muted">{options[k].note}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function MiniProfile({ kw, em }: { kw: number[]; em?: number[] }) {
  const max = Math.max(...kw, ...(em ?? []))
  return (
    <svg viewBox="0 0 96 28" className="mt-2 h-7 w-full" aria-hidden="true">
      {kw.map((v, h) => <rect key={h} x={h * 4} y={28 - (v / max) * 26} width={3} height={(v / max) * 26} fill={h < 7 || h > 18 ? '#5B655F' : '#E39B2E'} opacity={0.8} />)}
      {em && <line x1={0} x2={96} y1={28 - (em[0] / max) * 26} y2={28 - (em[0] / max) * 26} stroke="#A33A12" strokeDasharray="3 2" />}
    </svg>
  )
}

// ---------------------------------------------------------------- step 2
function GoalStep() {
  const [a, update] = useAsset()
  const navigate = useNavigate()
  const [hours, setHours] = useState(a ? String(a.backupHours) : '48')
  if (!a) return <NotFound />
  const outage = a.goal !== 'bills'
  const next = () => {
    update({ backupHours: Math.max(1, Number(hours) || 48) })
    navigate(`/planner/${a.id}/plan`)
  }
  return (
    <>
      <PageHeader title={a.name} subtitle={`${OWNERSHIP_INFO[a.ownership].label} · ${CRITICALITY_INFO[a.criticality].label}`} />
      <Stepper step={1} />
      <div className="card max-w-4xl space-y-6 p-6">
        <fieldset>
          <legend className="text-sm font-medium">What should solar do for {a.name}?</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {(Object.keys(GOAL_INFO) as Goal[]).map((g) => (
              <label key={g} className={`cursor-pointer rounded-card border p-4 ${a.goal === g ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-line hover:bg-page'}`}>
                <input type="radio" name="goal" checked={a.goal === g} onChange={() => update({ goal: g })} className="sr-only" />
                <span className="block text-lg font-medium">{GOAL_INFO[g].label}</span>
                <span className="mt-1 block text-sm text-muted">{GOAL_INFO[g].note}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {outage && (
          <div>
            <label htmlFor="hours" className="text-sm font-medium">Backup hours with no grid and no sun</label>
            <div className="mt-1 flex items-center gap-2">
              <input id="hours" inputMode="numeric" className="input max-w-[120px] num" value={hours} onChange={(e) => setHours(e.target.value.replace(/\D/g, ''))} />
              {[12, 24, 48, 72].map((h) => (
                <button key={h} type="button" aria-pressed={hours === String(h)} onClick={() => setHours(String(h))}
                  className={`min-h-touch rounded-md border px-3 text-sm ${hours === String(h) ? 'border-ink bg-ink text-white' : 'border-line'}`}>{h} h</button>
              ))}
            </div>
            <p className="mt-2 text-sm text-muted">Grid-tied solar switches off in a blackout for safety, so staying on always needs a battery.</p>
          </div>
        )}
        {outage && a.ownership !== 'sdp' && (
          <p className="rounded-lg border border-amber/60 bg-amber-soft p-3 text-sm">Needs the building owner’s agreement; SDP can only own batteries on its own property.</p>
        )}
        <div className="flex justify-between">
          <Link to={`/planner/${a.id}/details`} className="btn-ghost">Back</Link>
          <button type="button" className="btn-primary" onClick={next}>Next: see the plan</button>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- step 3
function PlanStep() {
  const [a, update] = useAsset()
  const { data } = useJson<PlannerData>('load_profiles.json')
  const { data: tidx } = useJson<TownshipIndex>('townships/index.json')
  const { data: y } = useJson<YieldData>('yield.json')
  const leasing = useStore(leasingStore)
  const [sent, setSent] = useState<number | null>(null)
  const isDraft = a?.status === 'Draft'
  useEffect(() => {
    if (a && isDraft) update({ status: 'Plan ready' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDraft])
  if (!a) return <NotFound />
  if (!data || !tidx || !y) return <p className="text-muted">Loading…</p>

  const prof = data.profiles[a.type]
  const town = tidx.townships.find((t) => t.id === a.township)
  const roofKwp = roofKwpFor(tidx, a.township)
  const r = evaluate(a, data, roofKwp)
  const tw = data.townships[a.township] ?? data.townships.elmina
  const goodLeft = town ? town.summary.good_roofs - (town.summary.community_reserved ?? 0) : 0
  const outage = a.goal !== 'bills'
  const extraKwp = Math.max(0, r.kwp_wettest - r.kwp)

  const checks: { ok: boolean | 'warn'; title: string; text: string }[] = [
    { ok: r.bill_neutral, title: r.bill_neutral ? 'Bill-neutral' : 'Not bill-neutral',
      text: `Makes ${fmt(r.solarKwhYr / 1000, 1)} MWh a year for ${fmt(a.annualKwh / 1000, 1)} MWh of use${r.bill_neutral ? '' : '; the goal is outage backup only'}.` },
    outage
      ? { ok: r.wettest_week_ok ? true : 'warn', title: r.wettest_week_ok ? 'Lasts the wettest week' : `Backup lasts ≈ ${fmt(r.wettest_week_hours)} hours in the wettest week`,
          text: r.wettest_week_ok ? `A full week of outage in a P90 wettest week (${fmt(tw.p90_kwh_kwp_day, 2)} kWh/kWp a day) keeps the critical load on.`
            : `In a P90 wettest week (${fmt(tw.p90_kwh_kwp_day, 2)} kWh/kWp a day), add ${fmt(extraKwp, 1)} kWp of solar to stay on all 7 days.` }
      : { ok: true, title: 'No battery needed', text: 'Night use comes from the grid, offset by daytime export.' },
    { ok: r.leased_roofs <= goodLeft, title: r.leased_roofs ? `${r.leased_roofs} leased roof${r.leased_roofs > 1 ? 's' : ''} needed` : 'Fits on its own roof',
      text: r.leased_roofs ? `${fmt(goodLeft)} good roofs are free in ${town?.name ?? 'this township'} after the community plan.` : `${fmt(a.ownRoofKwp)} kWp usable on its own roof.` },
    { ok: !r.battery_kwh || a.ownership === 'sdp' ? true : 'warn', title: a.ownership === 'sdp' ? 'Owned by SDP' : `${OWNERSHIP_INFO[a.ownership].label} building`,
      text: a.ownership === 'sdp' ? 'Behind the meter on SDP property: SDP owns the panels and battery.' : r.battery_kwh ? 'Needs the building owner’s agreement; SDP can only own batteries on its own property.' : 'Solar under a lease with the owner.' },
  ]

  const send = async () => {
    const roofs = await loadRoofs(a.township)
    const have = new Set(leasing.map((l) => l.roofId))
    const reserved = new Set(leasing.filter((l) => l.portfolioId?.startsWith('community-')).map((l) => l.roofId))
    const pick = roofs.filter((x) => x.score >= 75 && !have.has(x.id) && !reserved.has(x.id)).sort((p, q) => q.score - p.score).slice(0, r.leased_roofs)
    const items: LeaseItem[] = pick.map((x) => leaseItemSat(x, town?.name ?? a.township, PLANNER_PORTFOLIO(a.id)))
    leasingStore.set((l) => [...items, ...l])
    update({ status: 'Sent to leasing' })
    setSent(items.length)
  }

  const share = monthlyShare(y)
  const mf = prof.month.reduce((s, v) => s + v, 0)
  const covers = share.map((s, i) => (r.solarKwhYr * s) / ((a.annualKwh * prof.month[i]) / mf))

  return (
    <>
      <PageHeader title={a.name} subtitle={`${prof.label} · ${town?.name ?? a.township} · ${GOAL_INFO[a.goal].label}${outage ? ` · ${a.backupHours} h backup` : ''}`}
        right={<Link to={`/planner/${a.id}/details`} className="btn-ghost">Edit details</Link>} />
      <Stepper step={2} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Solar needed" value={fmt(r.kwp, 1)} unit="kWp" hint={`≈ ${fmt(r.panels)} panels of ${550} W`} />
        <Kpi label="Roofs" value={r.leased_roofs ? `Own + ${r.leased_roofs}` : 'Own roof'} hint={r.leased_roofs ? `${fmt(r.own_kwp, 1)} kWp on its roof, the rest on nearby leased roofs (CREAM)` : `${fmt(r.own_kwp, 1)} kWp on its own roof`} />
        <Kpi label="Battery" value={fmt(r.battery_kwh)} unit="kWh" hint={r.battery_kwh ? `${fmt(r.backup_hours)} h at ${fmt(r.critical_kw, 1)} kW critical load` : 'Not needed to cut bills'} />
        <Kpi label="Priority score" value={r.priority} unit="/ 100" hint={`${CRITICALITY_INFO[a.criticality].label} · ${fmt(a.people)} people${a.floodZone ? ' · flood zone' : ''}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="card p-6" aria-labelledby="day-h">
          <h2 id="day-h" className="text-lg font-semibold">A typical day: solar vs use</h2>
          <p className="text-sm text-muted">Average day in {town?.name ?? 'the township'}: solar from NASA POWER + pvlib, use from the sample {prof.label.toLowerCase()} profile.</p>
          <DayChart solar={data.solar_shape} kwp={r.kwp} yieldKwhKwp={tw.specific_yield} kw={prof.kw.map((v) => v * (a.annualKwh / prof.typical_kwh))}
            em={outage && prof.emergency_kw ? prof.emergency_kw.map((v) => v * (a.annualKwh / prof.typical_kwh)) : undefined} />
          <h3 className="mt-6 text-sm font-semibold">Monthly cover of the building’s use</h3>
          <ul className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-12">
            {covers.map((c, i) => {
              const pct = Math.round(c * 100)
              return (
                <li key={i} className={`rounded-lg p-2 text-center ${pct >= 100 ? 'bg-primary text-white' : pct >= 90 ? 'bg-amber text-ink' : 'bg-warn text-white'}`}>
                  <div className="text-xs">{y.monthly[i].month}</div><div className="num text-sm font-semibold">{pct}%</div>
                </li>
              )
            })}
          </ul>
        </section>

        <aside className="space-y-4">
          <ul className="card space-y-3 p-5">
            {checks.map((c) => (
              <li key={c.title}>
                <div className="flex items-center gap-2 text-sm font-semibold"><Tick ok={c.ok} />{c.title}</div>
                <p className="mt-1 text-xs text-muted">{c.text}</p>
              </li>
            ))}
          </ul>
          <div className="card p-5">
            <p className="label">Funded by</p>
            <p className="mt-1 text-2xl font-medium num">{fmt(r.fundingMwh)} <span className="text-base font-normal text-muted">MWh / yr of commercial sales</span></p>
            <p className="mt-1 text-sm text-muted">
              {r.battery_kwh ? `Pays back the RM ${fmt(r.batteryRm / 1000)}k battery in ${data.economics.payback_years} years at a RM ${data.economics.commercial_margin_rm_kwh.toFixed(2)}/kWh margin.` : 'No battery to fund.'}{' '}
              Saves the building about RM {fmt(r.savedRmYr)} a year.
            </p>
            <Link to="/portfolio" className="mt-2 inline-flex min-h-touch items-center text-sm text-primary underline underline-offset-2">See commercial buyers</Link>
          </div>
          <div className="card p-5">
            {r.leased_roofs > 0 ? (
              <>
                <button type="button" className="btn-primary w-full" onClick={send}>Send {r.leased_roofs} roof{r.leased_roofs > 1 ? 's' : ''} to leasing</button>
                {sent !== null && <p className="mt-2 text-sm" role="status">{sent ? `Added ${sent} roofs.` : 'Already on the leasing list.'} <Link to="/leasing" className="text-primary underline underline-offset-2">Open leasing list</Link></p>}
              </>
            ) : <p className="text-sm text-muted">Fits on its own roof: nothing to lease.</p>}
            {a.type === 'hall' && outage && (
              <Link to="/battery" className="btn-ghost mt-3 w-full justify-center">Run it in the battery controller →</Link>
            )}
          </div>
        </aside>
      </div>
      <p className="mt-4 text-xs text-muted">
        Battery = max(night use, critical load × backup hours) ÷ ({DOD} usable × {EFF} efficiency). Wettest week = each year’s darkest 7 days, the level 90% of years beat ({tw.years} years).
      </p>
    </>
  )
}

function DayChart({ solar, kwp, yieldKwhKwp, kw, em }: { solar: number[]; kwp: number; yieldKwhKwp: number; kw: number[]; em?: number[] }) {
  const sum = solar.reduce((a, b) => a + b, 0)
  const pv = solar.map((s) => (kwp * yieldKwhKwp) / 365 * (s / sum))
  const W = 640, H = 230, M = { t: 14, r: 10, b: 28, l: 44 }
  const iw = W - M.l - M.r, ih = H - M.t - M.b
  const max = Math.max(...pv, ...kw, ...(em ?? [])) * 1.1
  const x = (h: number) => M.l + (h / 24) * iw
  const yv = (v: number) => M.t + ih - (v / max) * ih
  const step = (arr: number[]) => arr.map((v, h) => `${x(h)},${yv(v)} ${x(h + 1)},${yv(v)}`).join(' ')
  const night = kw.reduce((a, v, h) => a + Math.max(0, v - pv[h]), 0)
  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Solar and load over 24 hours">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={M.l} x2={W - M.r} y1={yv(max * f / 1.1)} y2={yv(max * f / 1.1)} stroke="#E2E0D8" />
            <text x={M.l - 6} y={yv(max * f / 1.1) + 4} fontSize={11} textAnchor="end" fill="#5B655F">{fmt(max * f / 1.1, max > 20 ? 0 : 1)}</text>
          </g>
        ))}
        {kw.map((v, h) => v > pv[h] && <rect key={h} x={x(h)} width={iw / 24} y={yv(v)} height={yv(pv[h]) - yv(v)} fill="#15201B" opacity={0.12} />)}
        <polygon points={`${x(0)},${yv(0)} ${step(pv)} ${x(24)},${yv(0)}`} fill="#FBEBD3" stroke="#E39B2E" strokeWidth={1.5} />
        <polyline points={step(kw)} fill="none" stroke="#1F6F57" strokeWidth={2.5} />
        {em && <polyline points={step(em)} fill="none" stroke="#A33A12" strokeWidth={1.5} strokeDasharray="5 4" />}
        {[0, 6, 12, 18, 24].map((h) => <text key={h} x={x(h)} y={H - 8} fontSize={11} textAnchor="middle" fill="#5B655F">{h === 24 ? '24:00' : `${String(h).padStart(2, '0')}:00`}</text>)}
        <text x={M.l} y={10} fontSize={11} fill="#5B655F">kW</text>
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-5 text-sm text-muted">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-amber bg-amber-soft" />Solar</span>
        <span className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-primary" />Use</span>
        {em && <span className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-warn" />Emergency mode</span>}
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-ink/15" />Needs battery or grid · {fmt(night)} kWh a day</span>
      </figcaption>
    </figure>
  )
}

function NotFound() {
  return (
    <div className="card p-8 text-center">
      <p>Asset not found.</p>
      <Link to="/planner" className="btn-ghost mt-4">Back to the planner</Link>
    </div>
  )
}

