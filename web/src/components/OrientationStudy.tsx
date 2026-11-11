import { Link } from 'react-router-dom'
import { fmt, useJson } from '../lib/data'
import type { Lookup } from '../lib/kulai'

const DIR = (a: number) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(a / 45) % 8]

/** Heatmap of tilt × direction → share of the best yield, from NASA POWER hourly + pvlib (Kulai). */
export default function OrientationStudy() {
  const { data: d, error } = useJson<Lookup & { tilt_spread_pct: number }>('orientation_lookup.json')
  if (error) return <p className="text-warn">Could not load the orientation study: {error}</p>
  if (!d) return <p className="text-muted">Loading…</p>
  const lo = Math.min(...d.kwh_kwp.flat())
  const at = (t: number, a: number) => d.kwh_kwp[d.tilts.indexOf(t)][d.azimuths.indexOf(a % 360)]
  const housePairs = d.azimuths.filter((a) => a < 180).map((a) => (at(20, a) + at(20, a + 180)) / 2)
  const houseSpread = ((Math.max(...housePairs) - Math.min(...housePairs)) / Math.max(...housePairs)) * 100
  const pitch = ((at(15, 180) - at(30, 180)) / at(30, 180)) * 100
  const cell = (v: number) => {
    const f = (v - lo) / (d.best - lo)
    const c = (a: number, b: number) => Math.round(a + (b - a) * f)
    return `rgb(${c(251, 23)},${c(235, 84)},${c(211, 63)})`
  }
  return (
    <div className="space-y-6">
      <section className="card p-6">
        <p className="label">Takeaway</p>
        <p className="mt-1 max-w-4xl text-xl">
          Near the equator, a whole house barely cares which way it faces ({fmt(houseSpread, 1)}% across all street directions for a 20° gable roof),
          while pitch matters more ({fmt(pitch, 1)}% from 30° down to 15°). Plan for low pitch and simple roof shapes; let the street grid follow the land.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <Stat k="Best roof" v={`${fmt(d.best)} kWh/kWp`} />
          <Stat k="Flat roof" v={`${fmt(d.flat_kwh_kwp)} kWh/kWp`} />
          <Stat k="One roof face turned any way (20°)" v={`${fmt(d.azimuth_spread_pct_at_20, 1)}% best to worst`} />
          <Stat k="Sunshine (GHI)" v={`${fmt(d.ghi_kwh_m2_yr)} kWh/m² · ${Math.round(d.diffuse_share * 100)}% diffuse`} />
        </div>
      </section>
      <section className="card overflow-x-auto p-6" aria-labelledby="hm-h">
        <h2 id="hm-h" className="text-lg font-semibold">Share of the best yield, by roof tilt and the direction a roof face points</h2>
        <table className="mt-4 border-separate border-spacing-0.5 text-xs num">
          <caption className="sr-only">Percent of best yield for each tilt and azimuth</caption>
          <thead>
            <tr>
              <th scope="col" className="px-2 py-1 text-left font-sans font-medium text-muted">Tilt</th>
              {d.azimuths.map((a) => <th key={a} scope="col" className="w-11 py-1 font-sans font-medium text-muted">{a % 45 === 0 ? DIR(a) : <span className="text-[10px]">{a}°</span>}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.tilts.map((t, i) => (
              <tr key={t}>
                <th scope="row" className="px-2 text-left font-sans font-medium">{t}°</th>
                {d.kwh_kwp[i].map((v, j) => {
                  const pct = (v / d.best) * 100
                  return <td key={j} title={`${t}° tilt, facing ${d.azimuths[j]}°: ${fmt(v)} kWh/kWp`} className="h-8 text-center" style={{ background: cell(v), color: pct > 97 ? '#FFFFFF' : '#15201B' }}>{Math.round(pct)}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-sm text-muted">Method: {d.method}. Site: {d.site.name} ({d.site.lat}°N, {d.site.lon}°E).</p>
        <Link to="/kulai" className="mt-2 inline-flex min-h-touch items-center text-sm text-primary underline underline-offset-2">Try it on the Kulai layout →</Link>
      </section>
    </div>
  )
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-page px-4 py-3">
      <div className="text-sm text-muted">{k}</div>
      <div className="mt-1 font-medium num">{v}</div>
    </div>
  )
}
