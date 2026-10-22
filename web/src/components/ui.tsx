import type { ReactNode } from 'react'

export function PageHeader({ title, subtitle, eyebrow, right }: { title: string; subtitle?: ReactNode; eyebrow?: string; right?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1 text-sm font-medium text-primary">{eyebrow}</p>}
        <h1 className="text-[28px] font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-[15px] text-muted">{subtitle}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-3">{right}</div>}
    </header>
  )
}

/** Segmented control; the active option is dark ink. */
export function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-line bg-card p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`min-h-touch rounded-md px-4 text-sm font-medium ${value === o.id ? 'bg-ink text-white' : 'text-ink hover:bg-page'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SampleNote({ children = 'Sample data — scores, shading, roof condition and owner interest are synthetic.' }: { children?: ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 rounded-full border border-amber/60 bg-amber-soft px-3 py-1 text-xs text-ink">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber" />
      {children}
    </p>
  )
}

export function Kpi({ label, value, unit, hint }: { label: string; value: ReactNode; unit?: string; hint?: string }) {
  return (
    <div className="card px-6 py-5">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-2 text-[28px] font-medium leading-none num">
        {value}
        {unit && <span className="ml-2 text-base font-normal text-muted">{unit}</span>}
      </div>
      {hint && <div className="mt-2 text-xs text-muted">{hint}</div>}
    </div>
  )
}

export function Placeholder({ title }: { title: string }) {
  return (
    <div className="card p-10 text-center text-muted">
      <p className="font-medium text-ink">{title}</p>
      <p className="mt-1 text-sm">Coming in a later build phase.</p>
    </div>
  )
}
