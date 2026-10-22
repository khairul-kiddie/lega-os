import { useEffect } from 'react'
import { NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { useJson } from '../lib/data'
import type { TownshipIndex } from '../lib/townships'

const NAV: { to: string; label: string; badge?: string }[] = [
  { to: '/map', label: 'Roof map' },
  { to: '/portfolio', label: 'Portfolio builder' },
  { to: '/leasing', label: 'Leasing list' },
  { to: '/insights', label: 'Model insights' },
  { to: '/firming', label: 'Firming forecast', badge: 'Soon' },
]

export function SunLogo({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" fill="none" stroke="#E39B2E" strokeWidth={2.4} strokeLinecap="round">
      <circle cx="16" cy="16" r="5.5" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <line key={a} x1="16" y1="3.5" x2="16" y2="7" transform={`rotate(${a} 16 16)`} />
      ))}
    </svg>
  )
}

/** What the sidebar footer says the current screen is scoped to. */
function useContext(): [string, string] {
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const { data } = useJson<TownshipIndex>('townships/index.json')
  if (pathname.startsWith('/map')) {
    const t = data?.townships.find((x) => x.id === params.get('t'))
    return t ? ['Township', `${t.name}, ${t.state}`] : ['Roof map', 'All SDP townships']
  }
  if (pathname.startsWith('/portfolio')) return ['Portfolio', 'All SDP townships']
  return ['Township', 'City of Elmina']
}

export default function Layout() {
  const { pathname, search } = useLocation()
  const [ctxLabel, ctxValue] = useContext()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname, search])

  return (
    <div className="min-h-screen md:flex">
      <aside className="flex bg-side text-white md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:flex-col">
        <div className="flex items-center gap-3 px-6 py-4 md:py-7">
          <SunLogo />
          <span className="text-lg font-semibold tracking-wide">LEGA OS</span>
        </div>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-2 md:flex-col md:px-4">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `flex min-h-[52px] items-center gap-3 whitespace-nowrap rounded-lg px-4 text-[15px] transition-colors ${
                  isActive ? 'bg-white/10 font-semibold text-white' : 'text-white/80 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              {n.label}
              {n.badge && <span className="ml-auto hidden rounded border border-white/50 px-1.5 py-px text-[11px] text-white/85 sm:inline">{n.badge}</span>}
            </NavLink>
          ))}
        </nav>
        <NavLink to="/resident" className="mx-4 mt-4 hidden min-h-touch items-center rounded-lg px-4 text-xs text-white/70 hover:bg-white/5 hover:text-white md:flex">
          Resident app (mock) →
        </NavLink>
        <div className="mx-4 mt-auto hidden border-t border-white/15 px-2 py-5 md:block">
          <div className="text-xs text-white/65">{ctxLabel}</div>
          <div className="text-sm font-semibold">{ctxValue}</div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:px-10 md:py-8">
        <Outlet />
      </main>
    </div>
  )
}
