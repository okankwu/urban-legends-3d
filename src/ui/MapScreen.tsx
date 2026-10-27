import { useEffect, useRef } from 'react'
import { BLOCK, CELL, HALF_WORLD, ROAD_MAX, ROAD_MIN, ROAD_W, blocks, buildings } from '../city/layout'
import { shops } from '../shops/shops'
import { rt } from '../engine/runtime'
import { useGame } from '../store/game'
import type { MarkerKind } from '../missions/types'
import { markerColor } from './palette'
import { activeGarages } from '../garage/garages'
import CloseButton from './CloseButton'
import { gps } from '../driver/gps'

const RANGE = HALF_WORLD + 24
export const MARKER_COLOR = new Proxy({} as Record<MarkerKind, string>, { get: (_t, k) => markerColor(k as MarkerKind) })

/** Full-screen city map. Click to place a waypoint, right-click to clear it. */
export default function MapScreen() {
  const ref = useRef<HTMLCanvasElement>(null)
  const markers = useGame((s) => s.markers)
  const starts = useGame((s) => s.startMarkers)
  const dj = useGame((s) => s.djMarkers)
  const set = useGame((s) => s.set)
  const size = Math.max(280, Math.min(window.innerWidth - 320, window.innerHeight - 60, 840))

  useEffect(() => {
    const cv = ref.current!
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width = size * dpr
    cv.height = size * dpr
    const g = cv.getContext('2d')!
    const k = size / (RANGE * 2)
    const tx = (x: number) => (x + RANGE) * k
    const tz = (z: number) => (z + RANGE) * k
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const st = useGame.getState()
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.fillStyle = '#26332a'
      g.fillRect(0, 0, size, size)
      g.fillStyle = '#4a4e57'
      const ext = (ROAD_MAX - ROAD_MIN) * CELL + ROAD_W
      for (let i = ROAD_MIN; i <= ROAD_MAX; i++) {
        g.fillRect(tx(-ext / 2), tz(i * CELL - ROAD_W / 2), ext * k, ROAD_W * k)
        g.fillRect(tx(i * CELL - ROAD_W / 2), tz(-ext / 2), ROAD_W * k, ext * k)
      }
      for (const b of blocks) {
        g.fillStyle = b.district === 'park' ? '#3f7a3c' : b.district === 'downtown' ? '#39414a' : '#2f3a33'
        g.fillRect(tx(b.cx - BLOCK / 2), tz(b.cz - BLOCK / 2), BLOCK * k, BLOCK * k)
      }
      g.fillStyle = '#8a95a3'
      for (const b of buildings) g.fillRect(tx(b.x - b.w / 2), tz(b.z - b.d / 2), b.w * k, b.d * k)

      g.font = '600 10px sans-serif'
      g.textAlign = 'center'
      for (const s of shops) {
        g.fillStyle = '#ffd24a'
        g.fillRect(tx(s.door.x) - 4, tz(s.door.z) - 4, 8, 8)
        g.fillStyle = 'rgba(255,255,255,.9)'
        g.fillText(s.name, tx(s.door.x), tz(s.door.z) - 8)
      }
      for (const gr of activeGarages(st.unlocks)) {
        g.fillStyle = '#5ec8ff'
        g.fillRect(tx(gr.x) - 5, tz(gr.z) - 5, 10, 10)
        g.fillStyle = '#e8f6ff'
        g.fillText(gr.name, tx(gr.x), tz(gr.z) - 9)
      }
      // the GPS route over the real road network
      const rt2 = gps.route
      if (rt2 && gps.target) {
        g.lineJoin = 'round'
        g.lineCap = 'round'
        for (const [col, w] of [['#0a2a55', 8], ['#3da5ff', 5]] as const) {
          g.strokeStyle = col
          g.lineWidth = w
          g.beginPath()
          rt2.pts.forEach((p, i) => (i ? g.lineTo(tx(p.x), tz(p.z)) : g.moveTo(tx(p.x), tz(p.z))))
          g.stroke()
        }
      }
      const all = [...st.djMarkers, ...st.markers, ...st.startMarkers]
      for (const m of all) {
        if (m.kind !== 'search') continue
        g.strokeStyle = 'rgba(255,107,107,.9)'
        g.fillStyle = 'rgba(255,107,107,.15)'
        g.lineWidth = 2
        g.beginPath()
        g.arc(tx(m.x), tz(m.z), (m.r ?? 50) * k, 0, Math.PI * 2)
        g.fill()
        g.stroke()
      }
      for (const m of all) {
        if (m.kind === 'search') continue
        g.fillStyle = MARKER_COLOR[m.kind]
        g.strokeStyle = '#000'
        g.lineWidth = 2
        g.beginPath()
        g.arc(tx(m.x), tz(m.z), 7, 0, Math.PI * 2)
        g.fill()
        g.stroke()
        if (m.label) {
          g.fillStyle = '#fff'
          g.fillText(m.label, tx(m.x), tz(m.z) - 11)
        }
      }
      if (st.waypoint) {
        g.fillStyle = MARKER_COLOR.waypoint
        g.strokeStyle = '#000'
        g.lineWidth = 2
        g.beginPath()
        g.moveTo(tx(st.waypoint.x), tz(st.waypoint.z))
        g.lineTo(tx(st.waypoint.x) - 7, tz(st.waypoint.z) - 16)
        g.lineTo(tx(st.waypoint.x) + 7, tz(st.waypoint.z) - 16)
        g.closePath()
        g.fill()
        g.stroke()
      }
      g.fillStyle = '#ff5050'
      g.fillRect(tx(rt.vehiclePos.x) - 3, tz(rt.vehiclePos.z) - 5, 6, 10)
      const px = st.inVehicle ? rt.vehiclePos.x : rt.playerPos.x
      const pz = st.inVehicle ? rt.vehiclePos.z : rt.playerPos.z
      if (!st.inShop) {
        g.save()
        g.translate(tx(px), tz(pz))
        g.rotate(Math.PI - (st.inVehicle ? rt.vehicleYaw : rt.playerYaw))
        g.fillStyle = '#ffd24a'
        g.strokeStyle = '#000'
        g.beginPath()
        g.moveTo(0, -10)
        g.lineTo(7, 8)
        g.lineTo(0, 4)
        g.lineTo(-7, 8)
        g.closePath()
        g.fill()
        g.stroke()
        g.restore()
      }
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [size])

  const toWorld = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * RANGE * 2 - RANGE, z: ((e.clientY - r.top) / r.height) * RANGE * 2 - RANGE }
  }

  const all = [...dj, ...markers, ...starts].filter((m) => m.kind !== 'search')
  return (
    <div className="overlay" role="dialog" aria-label="City map">
      <CloseButton label="map" />
      <div className="map-wrap">
        <canvas
          ref={ref}
          className="map-canvas"
          style={{ width: size, height: size }}
          onClick={(e) => set({ waypoint: toWorld(e) })}
          onContextMenu={(e) => {
            e.preventDefault()
            set({ waypoint: null })
          }}
        />
        <div className="legend">
          <h3>Map</h3>
          <small style={{ color: 'var(--muted)' }}>Click to set a waypoint · right-click to clear · M or Esc to close</small>
          {all.length === 0 && <div>No active objectives.</div>}
          {all.map((m, i) => (
            <div className="row" key={i}>
              <span className="dot" style={{ background: MARKER_COLOR[m.kind] }} />
              {m.label ?? m.kind}
            </div>
          ))}
          <div className="row">
            <span className="dot" style={{ background: '#ffd24a', borderRadius: 2 }} /> Shops
          </div>
          <div className="row">
            <span className="dot" style={{ background: '#5ec8ff', borderRadius: 2 }} /> Garages (G)
          </div>
          <div className="row">
            <span className="dot" style={{ background: '#ff5050', borderRadius: 2 }} /> Your vehicle
          </div>
        </div>
      </div>
    </div>
  )
}
