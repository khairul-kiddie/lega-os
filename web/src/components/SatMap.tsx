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

interface Props {
  meta: TownshipMeta
  roofs: SatRoof[]
  /** 0..1 while the scan sweep is running (roofs north of the sweep line are revealed); null when done. */
  sweep: number | null
  selectedId: string | null
  onSelect: (r: SatRoof) => void
  /** Bump to fly to the selected roof. */
  focusKey: number
}

export default function SatMap({ meta, roofs, sweep, selectedId, onSelect, focusKey }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const polys = useRef(new Map<string, L.Polygon>())
  const sweepLine = useRef<L.Polyline | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // create the map once
  useEffect(() => {
    if (!el.current || map.current) return
    const m = L.map(el.current, { preferCanvas: true, zoomControl: true, attributionControl: true, maxZoom: 19 })
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

  // scan sweep: hide roofs south of the line
  useEffect(() => {
    const m = map.current
    if (!m) return
    const [s, n, w, e] = meta.bbox
    sweepLine.current?.remove()
    sweepLine.current = null
    if (sweep === null) {
      polys.current.forEach((p) => p.setStyle({ opacity: 1, fillOpacity: 0.55 }))
      return
    }
    const lat = n - (n - s) * sweep
    for (const r of roofs) polys.current.get(r.id)?.setStyle(r.center[0] >= lat ? { opacity: 1, fillOpacity: 0.55 } : { opacity: 0, fillOpacity: 0 })
    sweepLine.current = L.polyline([[lat, w], [lat, e]], { color: '#8CC7B0', weight: 3, opacity: 0.95, interactive: false }).addTo(m)
  }, [sweep, meta, roofs])

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

  return <div ref={el} className="h-[620px] w-full overflow-hidden rounded-lg bg-[#2b332e]" role="application" aria-label={`Satellite map of ${meta.name} with detected roofs`} />
}
