import type { Site, Zone } from '../lib/data'
import HomesPlan from './HomesPlan'

function tint(score: number) {
  if (score >= 80) return 'bg-primary/30 border-primary border-2 hover:bg-primary/45'
  if (score >= 70) return 'bg-amber/30 border-amber border-2 hover:bg-amber/45'
  return 'bg-white/10 border-ink/70 border-2 border-dashed hover:bg-white/30'
}

function badge(score: number) {
  if (score >= 80) return 'bg-primary text-white'
  if (score >= 70) return 'bg-amber text-ink'
  return 'bg-ink text-white'
}

export default function SiteMap({ site, onSelect, highlight }: { site: Site; onSelect: (z: Zone) => void; highlight?: string | null }) {
  const { w, h } = site.frame
  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-[#DCE7D2]" style={{ aspectRatio: `${w} / ${h}` }}>
      {site.image ? (
        <img src={`./${site.image}`} alt="Elmina Business Park master plan" className="absolute inset-0 h-full w-full object-fill" />
      ) : (
        <HomesPlan zones={site.zones} className="absolute inset-0 h-full w-full" />
      )}
      {site.zones.map((z) => (
        <button
          key={z.id}
          type="button"
          onClick={() => onSelect(z)}
          aria-label={`Zone ${z.id}, average score ${Math.round(z.summary.avg_score)}, ${z.summary.n_roofs} roofs`}
          className={`absolute rounded-md transition-colors ${tint(z.summary.avg_score)} ${highlight === z.id ? 'ring-4 ring-ink/80' : ''}`}
          style={{
            left: `${(z.x1 / w) * 100}%`,
            top: `${(z.y1 / h) * 100}%`,
            width: `${((z.x2 - z.x1) / w) * 100}%`,
            height: `${((z.y2 - z.y1) / h) * 100}%`,
          }}
        >
          <span className={`absolute right-0.5 top-0.5 rounded px-1 text-[10px] font-semibold num leading-4 ${badge(z.summary.avg_score)}`}>
            {Math.round(z.summary.avg_score)}
          </span>
        </button>
      ))}
    </div>
  )
}

export function MapLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Map legend">
      <li className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm border-2 border-primary bg-primary/30" />Avg score 80+</li>
      <li className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm border-2 border-amber bg-amber/30" />70–79</li>
      <li className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm border-2 border-dashed border-ink/70" />Below 70</li>
    </ul>
  )
}

/** Crop of the zone from the base map, zoomed with CSS background-size/position. */
export function ZoneCrop({ site, zone }: { site: Site; zone: Zone }) {
  const { w, h } = site.frame
  const pad = 0.15
  const zw = zone.x2 - zone.x1
  const zh = zone.y2 - zone.y1
  const x1 = Math.max(0, zone.x1 - zw * pad)
  const y1 = Math.max(0, zone.y1 - zh * pad)
  const x2 = Math.min(w, zone.x2 + zw * pad)
  const y2 = Math.min(h, zone.y2 + zh * pad)
  const cw = x2 - x1
  const ch = y2 - y1
  const outline = {
    left: `${((zone.x1 - x1) / cw) * 100}%`,
    top: `${((zone.y1 - y1) / ch) * 100}%`,
    width: `${(zw / cw) * 100}%`,
    height: `${(zh / ch) * 100}%`,
  }
  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-[#DCE7D2]" style={{ aspectRatio: `${cw} / ${ch}`, maxHeight: 320 }}>
      {site.image ? (
        <div
          role="img"
          aria-label={`Zone ${zone.id} cropped from the master plan`}
          className="absolute inset-0"
          style={{
            backgroundImage: `url(./${site.image})`,
            backgroundSize: `${(w / cw) * 100}% ${(h / ch) * 100}%`,
            backgroundPosition: `${cw === w ? 0 : (x1 / (w - cw)) * 100}% ${ch === h ? 0 : (y1 / (h - ch)) * 100}%`,
          }}
        />
      ) : (
        <HomesPlan zones={site.zones} viewBox={`${x1} ${y1} ${cw} ${ch}`} className="absolute inset-0 h-full w-full" />
      )}
      <div className="absolute rounded border-2 border-white shadow-[0_0_0_2px_#15201B]" style={outline} />
    </div>
  )
}
