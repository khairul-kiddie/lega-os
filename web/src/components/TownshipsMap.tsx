import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { TownshipGroup } from '../lib/townships'

// Light basemap so the pins carry the colour; same provider as the satellite imagery.
const BASE = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'
const LABELS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}'
const ATTRIBUTION = 'Basemap © Esri · Township locations © OpenStreetMap contributors'

function pinHtml(n: number, scanned: boolean, selected: boolean) {
  const ring = selected ? 'box-shadow:0 0 0 4px rgba(21,32,27,.35);' : ''
  const body = scanned
    ? `background:#1F6F57;color:#fff;border:2px solid #fff;`
    : `background:#fff;color:#15201B;border:2px dashed #15201B;`
  return `<div style="${body}${ring}width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font:600 14px 'IBM Plex Mono',monospace">${n}</div>`
}

interface Props {
  groups: TownshipGroup[]
  scanned: (g: TownshipGroup) => boolean
  selectedId: string
  onSelect: (g: TownshipGroup) => void
}

export default function TownshipsMap({ groups, scanned, selectedId, onSelect }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const markers = useRef<L.Marker[]>([])
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    if (!el.current || map.current) return
    const m = L.map(el.current, { zoomControl: true, scrollWheelZoom: false, maxZoom: 14 })
    L.tileLayer(BASE, { maxZoom: 16, attribution: ATTRIBUTION }).addTo(m)
    L.tileLayer(LABELS, { maxZoom: 16, opacity: 0.9 }).addTo(m)
    map.current = m
    return () => {
      m.remove()
      map.current = null
    }
  }, [])

  // frame all townships once
  useEffect(() => {
    const m = map.current
    if (!m || !groups.length) return
    m.fitBounds(L.latLngBounds(groups.map((g) => g.center)), { padding: [48, 48] })
  }, [groups])

  useEffect(() => {
    const m = map.current
    if (!m) return
    markers.current.forEach((k) => k.remove())
    markers.current = groups.map((g, i) => {
      const k = L.marker(g.center, {
        icon: L.divIcon({ html: pinHtml(i + 1, scanned(g), g.id === selectedId), className: '', iconSize: [34, 34], iconAnchor: [17, 17] }),
        title: `${i + 1}. ${g.name}${scanned(g) ? ' (scanned)' : ' (not scanned)'}`,
        keyboard: true,
        zIndexOffset: g.id === selectedId ? 1000 : 0,
      })
      k.on('click', () => onSelectRef.current(g))
      k.bindTooltip(g.name, { direction: 'right', offset: [18, 0], opacity: 0.95 })
      return k.addTo(m)
    })
  }, [groups, scanned, selectedId])

  return <div ref={el} className="h-[560px] w-full overflow-hidden rounded-lg bg-[#E8E8E4]" role="application" aria-label="Map of SDP townships. Use the township list beside the map to choose one." />
}
