import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

type NavItem = { to: string; label: string; icon: string; badge?: string }

const NAV: NavItem[] = [
  { to: '/map', label: 'Roof map', icon: 'M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2V5zm6-2v16m6-14v16' },
  { to: '/portfolio', label: 'Portfolio builder', icon: 'M4 7h16v12H4zM9 7V4h6v3' },
  { to: '/leasing', label: 'Leasing list', icon: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01' },
  { to: '/insights', label: 'Model insights', icon: 'M4 20V10m6 10V4m6 16v-7m4 7H2' },
  { to: '/firming', label: 'Firming forecast', icon: 'M12 3v2m0 14v2M5 12H3m18 0h-2M6.3 6.3l1.4 1.4m8.6 8.6l1.4 1.4m0-11.4l-1.4 1.4M7.7 16.3l-1.4 1.4M12 8a4 4 0 100 8 4 4 0 000-8z', badge: 'Soon' },
]

function Icon({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

export default function Layout() {
  const { pathname, search } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname, search])
  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-side text-white md:w-60 md:shrink-0 md:min-h-screen md:sticky md:top-0 md:h-screen flex md:flex-col">
        <div className="flex items-center gap-2 px-5 py-4 md:py-6">
          <img src="./favicon.svg" alt="" className="h-7 w-7" />
          <span className="font-semibold tracking-wide">LEGA OS</span>
        </div>
        <nav aria-label="Main" className="flex md:flex-col gap-1 px-2 md:px-3 overflow-x-auto">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `flex items-center gap-3 min-h-touch px-3 rounded-lg text-sm whitespace-nowrap transition-colors ${
                  isActive ? 'bg-white/10 text-white' : 'text-white/75 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <Icon d={n.icon} />
              <span className="hidden sm:inline">{n.label}</span>
              {n.badge && (
                <span className="hidden sm:inline ml-auto rounded-full bg-amber px-2 py-0.5 text-[10px] font-semibold text-ink">{n.badge}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="hidden md:block mt-auto px-5 py-5 text-xs text-white/60 leading-relaxed">
          Prototype for SDP University Hackathon 2026. Base map: Sime Darby Property.
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  )
}
