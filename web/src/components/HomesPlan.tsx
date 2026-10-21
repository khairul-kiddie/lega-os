import type { Zone } from '../lib/data'

// Illustrative City of Elmina homes layout (not real precinct boundaries).
export default function HomesPlan({ zones, viewBox = '0 0 1000 800', className = '' }: { zones: Zone[]; viewBox?: string; className?: string }) {
  return (
    <svg viewBox={viewBox} className={className} preserveAspectRatio="xMidYMid slice" role="img" aria-label="Illustrative homes precinct layout">
      <rect width="1000" height="800" fill="#DCE7D2" />
      {/* roads */}
      <g stroke="#C9C6BC" strokeWidth="26" strokeLinecap="round">
        <line x1="0" y1="300" x2="1000" y2="300" />
        <line x1="0" y1="550" x2="1000" y2="550" />
        <line x1="320" y1="0" x2="320" y2="800" />
        <line x1="625" y1="0" x2="625" y2="800" />
      </g>
      <g stroke="#FFFFFF" strokeWidth="2" strokeDasharray="10 10">
        <line x1="0" y1="300" x2="1000" y2="300" />
        <line x1="0" y1="550" x2="1000" y2="550" />
        <line x1="320" y1="0" x2="320" y2="800" />
        <line x1="625" y1="0" x2="625" y2="800" />
      </g>
      {/* lake */}
      <ellipse cx="175" cy="665" rx="120" ry="75" fill="#7FB6CF" />
      <text x="175" y="670" textAnchor="middle" fontSize="20" fill="#2F5D70" fontFamily="IBM Plex Sans">Lake</text>
      {/* park */}
      <rect x="650" y="580" width="300" height="160" rx="18" fill="#A9CC94" />
      {[690, 740, 800, 860, 910, 720, 830, 890].map((x, i) => (
        <circle key={i} cx={x} cy={i < 5 ? 620 : 700} r="16" fill="#7FAF6B" />
      ))}
      <text x="800" y="668" textAnchor="middle" fontSize="20" fill="#355B2A" fontFamily="IBM Plex Sans">Central park</text>
      {/* houses */}
      {zones.map((z) => {
        const w = (z.x2 - z.x1) / z.cols
        const h = (z.y2 - z.y1) / z.rows
        return (
          <g key={z.id}>
            <rect x={z.x1 - 6} y={z.y1 - 6} width={z.x2 - z.x1 + 12} height={z.y2 - z.y1 + 12} rx="8" fill="#ECEAE2" />
            {z.roofs.map((r) => (
              <rect key={r.id} x={z.x1 + r.col * w + 2} y={z.y1 + r.row * h + 3} width={w - 4} height={h - 6} rx="2" fill={z.type === 'a' ? '#9FB3C8' : '#B9A9C9'} />
            ))}
          </g>
        )
      })}
    </svg>
  )
}
