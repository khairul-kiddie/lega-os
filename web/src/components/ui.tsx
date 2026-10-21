import type { ReactNode } from 'react'

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted max-w-2xl">{subtitle}</p>}
      </div>
      {right}
    </header>
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
    <div className="card p-4">
      <div className="label">{label}</div>
      <div className="mt-2 text-2xl font-semibold num">
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-muted">{unit}</span>}
      </div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
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
