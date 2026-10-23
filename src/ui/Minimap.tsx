import { useEffect, useRef } from 'react'
import { blocks, buildings, CELL, ROAD_MAX, ROAD_MIN, ROAD_W, BLOCK } from '../city/layout'
import { rt } from '../engine/runtime'
import { shops } from '../shops/shops'
import { useGame } from '../store/game'
import { MARKER_COLOR } from './MapScreen'
import { activeGarages } from '../garage/garages'

const SIZE = 168
const SCALE = 1.6 // pixels per meter

export default function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current!
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width = SIZE * dpr
    cv.height = SIZE * dpr
    const g = cv.getContext('2d')!
    g.scale(dpr, dpr)
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const st = useGame.getState()
      const inCar = st.inVehicle
      const px = inCar ? rt.vehiclePos.x : rt.playerPos.x
      const pz = inCar ? rt.vehiclePos.z : rt.playerPos.z
      const rot = rt.camYaw // map "up" = camera forward

      if (st.inShop) {
        g.clearRect(0, 0, SIZE, SIZE)
        g.fillStyle = '#1b2233'
        g.beginPath()
        g.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = '#ffd24a'
        g.font = '700 14px sans-serif'
        g.textAlign = 'center'
        g.fillText('INSIDE', SIZE / 2, SIZE / 2 + 5)
        return
      }
      g.save()
      g.clearRect(0, 0, SIZE, SIZE)
      g.beginPath()
      g.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2)
      g.clip()
      g.fillStyle = '#26332a'
      g.fillRect(0, 0, SIZE, SIZE)
      g.translate(SIZE / 2, SIZE / 2)
      g.rotate(rot)
      g.scale(SCALE, SCALE)
      g.translate(-px, -pz)
      // roads
      g.fillStyle = '#4a4e57'
      const ext = (ROAD_MAX - ROAD_MIN) * CELL + ROAD_W
      for (let k = ROAD_MIN; k <= ROAD_MAX; k++) {
        g.fillRect(-ext / 2, k * CELL - ROAD_W / 2, ext, ROAD_W)
        g.fillRect(k * CELL - ROAD_W / 2, -ext / 2, ROAD_W, ext)
      }
      // blocks (parks are green)
      for (const b of blocks) {
        g.fillStyle = b.district === 'park' ? '#3f7a3c' : '#2f3a33'
        g.fillRect(b.cx - BLOCK / 2, b.cz - BLOCK / 2, BLOCK, BLOCK)
      }
      g.fillStyle = '#8a95a3'
      for (const b of buildings) g.fillRect(b.x - b.w / 2, b.z - b.d / 2, b.w, b.d)
      // shop markers
      g.fillStyle = '#ffd24a'
      for (const s of shops) g.fillRect(s.door.x - 3, s.door.z - 3, 6, 6)
      // vehicle blip when on foot
      if (!inCar) {
        g.fillStyle = '#ff5050'
        g.fillRect(rt.vehiclePos.x - 2, rt.vehiclePos.z - 3.5, 4, 7)
      }
      g.restore()

      // objective blips; off-map ones are pinned to the rim
      const R = SIZE / 2 - 10
      const cs = Math.cos(rot)
      const sn = Math.sin(rot)
      const garageBlips = activeGarages(st.unlocks).map((g) => ({ x: g.x, z: g.z, kind: 'pickup' as const }))
      for (const m of [...st.djMarkers, ...st.markers, ...st.startMarkers, ...garageBlips]) {
        if (m.kind === 'search') continue
        const dx = m.x - px
        const dz = m.z - pz
        let sx = (dx * cs - dz * sn) * SCALE
        let sy = (dx * sn + dz * cs) * SCALE
        const len = Math.hypot(sx, sy)
        const far = len > R
        if (far) {
          sx = (sx / len) * R
          sy = (sy / len) * R
        }
        g.fillStyle = MARKER_COLOR[m.kind]
        g.strokeStyle = '#000'
        g.lineWidth = 2
        g.beginPath()
        g.arc(SIZE / 2 + sx, SIZE / 2 + sy, far ? 4.5 : 6, 0, Math.PI * 2)
        g.fill()
        g.stroke()
      }

      // player arrow (always centered)
      g.save()
      g.translate(SIZE / 2, SIZE / 2)
      const facing = inCar ? rt.vehicleYaw : rt.playerYaw
      // world heading (sin h, cos h) -> screen angle relative to map rotation
      g.rotate(-(facing - 0) + rot + Math.PI)
      g.fillStyle = '#ffd24a'
      g.strokeStyle = '#000'
      g.lineWidth = 1.5
      g.beginPath()
      g.moveTo(0, -8)
      g.lineTo(5.5, 6)
      g.lineTo(0, 3)
      g.lineTo(-5.5, 6)
      g.closePath()
      g.fill()
      g.stroke()
      g.restore()
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [])

  return <canvas ref={ref} className="minimap" style={{ width: SIZE, height: SIZE }} />
}
