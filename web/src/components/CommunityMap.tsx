import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { fmt } from '../lib/data'
import { STATUS_INFO, type CommunityPlan } from '../lib/community'
import type { SatRoof, TownshipMeta } from '../lib/townships'

const IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const LABELS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
const ATTRIBUTION = 'Imagery © Esri, Maxar, Earthstar Geographics · Facilities, roads © OpenStreetMap contributors (ODbL) · Buildings © Overture Maps (ODbL)'

export const MAP_COLORS = { facilityRoof: '#2BD18A', lampRoof: '#F2B33D', lamp: '#FFE08A' }

interface Props {
  meta: TownshipMeta
  plan: CommunityPlan
  roofs: SatRoof[]
  /** facility id or lamp group id */
  selected: string | null
  onSelect: (id: string) => void
  focusKey: number
}

export default function CommunityMap({ meta, plan, roofs, selected, onSelect, focusKey }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const marks = useRef(new Map<string, L.CircleMarker>())
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    if (!el.current || map.current) return
    const m = L.map(el.current, { preferCanvas: true, maxZoom: 19, scrollWheelZoom: false })
    L.tileLayer(IMAGERY, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(m)
    L.tileLayer(LABELS, { maxZoom: 19, opacity: 0.85 }).addTo(m)
    layer.current = L.layerGroup().addTo(m)
    map.current = m
    return () => {
      m.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    const [s, n, w, e] = meta.bbox
    map.current?.fitBounds([[s, w], [n, e]], { padding: [12, 12] })
  }, [meta])

  useEffect(() => {
    const g = layer.current
    if (!g) return
    g.clearLayers()
    marks.current.clear()
    for (const ring of meta.outline) L.polygon(ring, { color: '#FFFFFF', weight: 2, dashArray: '6 6', fill: false, interactive: false }).addTo(g)

    const byId = new Map(roofs.map((r) => [r.id, r]))
    const renderer = L.canvas({ padding: 0.5 })
    const drawRoof = (id: string, color: string, tip: string) => {
      const r = byId.get(id)
      if (!r) return
      L.polygon(r.ring, { renderer, color, weight: 1.5, fillColor: color, fillOpacity: 0.6 }).bindTooltip(tip, { sticky: true, opacity: 0.9 }).addTo(g)
    }
    for (const f of plan.facilities)
      for (const id of [...f.own_roofs, ...f.shared_roofs])
        drawRoof(id, MAP_COLORS.facilityRoof, `${byId.get(id)?.label ?? id} · powers ${f.name}`)

    for (const lg of plan.lamp_groups) {
      const c = L.circleMarker([lg.lat, lg.lon], {
        radius: Math.max(6, Math.min(20, Math.sqrt(lg.lamps) * 1.1)), color: '#15201B', weight: 1.5,
        fillColor: lg.ok ? MAP_COLORS.lamp : '#E8643F', fillOpacity: 0.85,
      })
      c.bindTooltip(`Lamp group ${lg.id} · ${fmt(lg.lamps)} solar lamps · ${fmt(lg.panel_wp)} Wp panel + ${fmt(lg.battery_wh_per_lamp / 1000, 1)} kWh battery each`, { direction: 'top', opacity: 0.95 })
      c.on('click', () => onSelectRef.current(lg.id))
      c.addTo(g)
      marks.current.set(lg.id, c)
    }
    for (const f of plan.facilities) {
      const c = L.circleMarker([f.lat, f.lon], { radius: 8, color: '#FFFFFF', weight: 2.5, fillColor: STATUS_INFO[f.status].color, fillOpacity: 1 })
      c.bindTooltip(`${f.name} · ${f.label} · ${STATUS_INFO[f.status].label}`, { direction: 'top', opacity: 0.95 })
      c.on('click', () => onSelectRef.current(f.id))
      c.addTo(g)
      marks.current.set(f.id, c)
    }
  }, [meta, plan, roofs])

  useEffect(() => {
    marks.current.forEach((c, id) => {
      const isLamp = plan.lamp_groups.some((g) => g.id === id)
      c.setStyle(id === selected ? { color: '#15201B', weight: 4 } : { color: isLamp ? '#15201B' : '#FFFFFF', weight: isLamp ? 1.5 : 2.5 })
      if (id === selected) c.bringToFront()
    })
  }, [selected, plan])

  useEffect(() => {
    if (!selected || focusKey === 0) return
    const f = plan.facilities.find((x) => x.id === selected) ?? plan.lamp_groups.find((x) => x.id === selected)
    if (f) map.current?.flyTo([f.lat, f.lon], 17, { duration: 0.8 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey])

  return <div ref={el} className="h-[560px] w-full overflow-hidden rounded-lg bg-[#2b332e]" role="application" aria-label={`Satellite map of ${meta.name}: community facilities, lamp groups and the roofs that power them`} />
}
