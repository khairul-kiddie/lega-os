import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { SatRoof, TownshipMeta } from '../lib/townships'

const IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const LABELS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
const ATTRIBUTION = 'Imagery © Esri, Maxar, Earthstar Geographics · Building footprints © Microsoft (ODbL)'

// Bright fills that stay readable on top of satellite imagery.
export const SAT_COLORS = { good: '#2BD18A', fair: '#F2B33D', poor: '#E8643F' }
const fill = (s: number) => (s >= 75 ? SAT_COLORS.good : s >= 55 ? SAT_COLORS.fair : SAT_COLORS.poor)

/** Scan replay: each value is how far (0..1, north → south) that pass has swept. */
export interface ScanSweep {
  /** roofs north of this line show as detected (white outline) */
  detect: number
  /** roofs north of this line show their score colour */
  score: number
}

type Phase = 'hidden' | 'outline' | 'scored'
const PHASE_STYLE: Record<Exclude<Phase, 'scored'>, L.PathOptions> = {
  hidden: { opacity: 0, fillOpacity: 0 },
  outline: { color: '#FFFFFF', opacity: 0.95, fillColor: '#FFFFFF', fillOpacity: 0.12, weight: 1 },
}

interface Props {
  meta: TownshipMeta
  roofs: SatRoof[]
  /** scan replay in progress; null shows every roof scored */
  scan: ScanSweep | null
  selectedId: string | null
  onSelect: (r: SatRoof) => void
  /** Bump to fly to the selected roof. */
  focusKey: number
}

export default function SatMap({ meta, roofs, scan, selectedId, onSelect, focusKey, height = 'h-[620px]' }: Props & { height?: string }) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const polys = useRef(new Map<string, L.Polygon>())
  const lines = useRef<L.Polyline[]>([])
  const phases = useRef(new Map<string, Phase>())
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // create the map once
  useEffect(() => {
    if (!el.current || map.current) return
    // no scroll-wheel zoom: the map sits in a scrolling page; use the +/− buttons or pinch
    const m = L.map(el.current, { preferCanvas: true, zoomControl: true, attributionControl: true, maxZoom: 19, scrollWheelZoom: false })
    L.tileLayer(IMAGERY, { maxZoom: 19, maxNativeZoom: 19, attribution: ATTRIBUTION }).addTo(m)
    L.tileLayer(LABELS, { maxZoom: 19, opacity: 0.85 }).addTo(m)
    layer.current = L.layerGroup().addTo(m)
    map.current = m
    return () => {
      m.remove()
      map.current = null
    }
  }, [])

  // township change: frame the extent
  useEffect(() => {
    const m = map.current
    if (!m) return
    const [s, n, w, e] = meta.bbox
    m.fitBounds([[s, w], [n, e]], { padding: [12, 12] })
  }, [meta])

  // (re)draw roofs
  useEffect(() => {
    const m = map.current
    const g = layer.current
    if (!m || !g) return
    g.clearLayers()
    polys.current.clear()
    phases.current.clear()
    const [s, n, w, e] = meta.bbox
    L.rectangle([[s, w], [n, e]], { color: '#FFFFFF', weight: 1.5, dashArray: '6 6', fill: false, interactive: false }).addTo(g)
    const renderer = L.canvas({ padding: 0.5 })
    for (const r of roofs) {
      const p = L.polygon(r.ring, { renderer, color: fill(r.score), weight: 1.2, fillColor: fill(r.score), fillOpacity: 0.55, opacity: 1 })
      p.on('click', () => onSelectRef.current(r))
      p.bindTooltip(`${r.label} · score ${r.score} · ${r.kwp} kWp`, { sticky: true, direction: 'top', opacity: 0.9 })
      p.addTo(g)
      polys.current.set(r.id, p)
    }
  }, [meta, roofs])

  // scan replay: only restyle roofs whose phase changed, so thousands of roofs stay smooth
  useEffect(() => {
    const m = map.current
    if (!m) return
    const [s, n, w, e] = meta.bbox
    lines.current.forEach((l) => l.remove())
    lines.current = []
    const latOf = (k: number) => n - (n - s) * k
    for (const r of roofs) {
      const ph: Phase = !scan ? 'scored' : r.center[0] >= latOf(scan.score) ? 'scored' : r.center[0] >= latOf(scan.detect) ? 'outline' : 'hidden'
      if (phases.current.get(r.id) === ph) continue
      phases.current.set(r.id, ph)
      const c = fill(r.score)
      polys.current.get(r.id)?.setStyle(ph === 'scored' ? { color: c, fillColor: c, opacity: 1, fillOpacity: 0.55, weight: 1.2 } : PHASE_STYLE[ph])
    }
    if (!scan) return
    if (scan.detect > 0 && scan.detect < 1)
      lines.current.push(L.polyline([[latOf(scan.detect), w], [latOf(scan.detect), e]], { color: '#FFFFFF', weight: 2, opacity: 0.9, interactive: false }).addTo(m))
    if (scan.score > 0 && scan.score < 1)
      lines.current.push(L.polyline([[latOf(scan.score), w], [latOf(scan.score), e]], { color: '#8CC7B0', weight: 3, opacity: 0.95, interactive: false }).addTo(m))
  }, [scan, meta, roofs])

  // selection highlight
  useEffect(() => {
    const score = new Map(roofs.map((r) => [r.id, r.score]))
    polys.current.forEach((p, id) => {
      if (id === selectedId) p.setStyle({ color: '#FFFFFF', weight: 3 }).bringToFront()
      else p.setStyle({ color: fill(score.get(id) ?? 0), weight: 1.2 })
    })
  }, [selectedId, roofs])

  useEffect(() => {
    const r = selectedId ? roofs.find((x) => x.id === selectedId) : null
    if (r && focusKey > 0) map.current?.flyTo(r.center, 18, { duration: 0.8 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey])

  return <div ref={el} className={`${height} w-full overflow-hidden rounded-lg bg-[#2b332e]`} role="application" aria-label={`Satellite map of ${meta.name} with detected roofs`} />
}
