import { CELL, ROAD_MAX, ROAD_MIN, ROAD_W, blocks } from '../city/layout'
import { nightFactor } from '../city/City'
import { rt } from '../engine/runtime'
import { useGame } from '../store/game'
import { markerColor } from '../ui/palette'
import { fmtDist, fmtEta, gps } from './gps'
import { activeJob } from './manager'
import { limit, streetName } from './roadGraph'
import type { Turn } from './gps'

/**
 * The GPS map renderer. It draws the game's real road grid, the active route, markers and the vehicle onto any
 * 2D canvas context, so the dashboard texture, the floating overlay and the expanded map all share one source
 * of truth and always show the same world coordinates the physics and missions use.
 */
export interface GpsStyle {
  w: number
  h: number
  /** pixels per metre */
  scale: number
  mode: 'track' | 'north'
  /** font / chrome multiplier (1 = dashboard size) */
  ui: number
  hud: boolean
  /** 'map' draws the live map, 'home' the plain dashboard page */
  view?: 'map' | 'home'
  /** centre the map on this point instead of the vehicle (north-up only) */
  centre?: { x: number; z: number }
}

const FONT = (px: number, w = 600) => `${w} ${Math.round(px)}px "Segoe UI", system-ui, sans-serif`

function palette() {
  const s = useGame.getState()
  const night = nightFactor(s.hour)
  const cb = s.colorblind
  return {
    bg: night > 0.4 ? '#070b14' : '#0d1626',
    block: night > 0.4 ? '#0c1422' : '#142036',
    park: night > 0.4 ? '#0d2417' : '#143323',
    road: night > 0.4 ? '#243049' : '#2c3c5a',
    roadLocked: '#171f30',
    centre: night > 0.4 ? '#3a4a6b' : '#4a5d82',
    label: '#ffffff',
    route: cb ? '#56B4E9' : '#3da5ff',
    routeCase: '#0a2a55',
    dest: cb ? '#E69F00' : '#35e08a',
    check: cb ? '#F0E442' : '#ffd24a',
    car: '#ffffff',
    barBg: 'rgba(5,9,18,.86)',
    accent: cb ? '#56B4E9' : '#3da5ff',
  }
}

function turnGlyph(g: CanvasRenderingContext2D, turn: Turn, cx: number, cy: number, s: number, color: string) {
  g.save()
  g.translate(cx, cy)
  g.strokeStyle = color
  g.fillStyle = color
  g.lineWidth = s * 0.16
  g.lineCap = 'round'
  g.lineJoin = 'round'
  if (turn === 'arrive') {
    g.beginPath()
    g.arc(0, -s * 0.1, s * 0.3, 0, Math.PI * 2)
    g.fill()
    g.beginPath()
    g.moveTo(-s * 0.28, s * 0.35)
    g.lineTo(s * 0.28, s * 0.35)
    g.stroke()
  } else if (turn === 'uturn') {
    g.beginPath()
    g.moveTo(s * 0.25, s * 0.4)
    g.lineTo(s * 0.25, -s * 0.15)
    g.arc(0, -s * 0.15, s * 0.25, 0, Math.PI, true)
    g.lineTo(-s * 0.25, s * 0.15)
    g.stroke()
    g.beginPath()
    g.moveTo(-s * 0.45, s * 0.1)
    g.lineTo(-s * 0.25, s * 0.42)
    g.lineTo(-s * 0.05, s * 0.1)
    g.closePath()
    g.fill()
  } else {
    const dir = turn === 'left' ? -1 : turn === 'right' ? 1 : 0
    g.beginPath()
    g.moveTo(0, s * 0.42)
    g.lineTo(0, dir === 0 ? -s * 0.15 : -s * 0.02)
    if (dir !== 0) g.lineTo(dir * s * 0.3, -s * 0.02)
    g.stroke()
    g.beginPath()
    if (dir === 0) {
      g.moveTo(-s * 0.25, -s * 0.12)
      g.lineTo(0, -s * 0.45)
      g.lineTo(s * 0.25, -s * 0.12)
    } else {
      g.moveTo(dir * s * 0.28, -s * 0.28)
      g.lineTo(dir * s * 0.55, -s * 0.02)
      g.lineTo(dir * s * 0.28, s * 0.24)
    }
    g.closePath()
    g.fill()
  }
  g.restore()
}

const turnText = (t: Turn) => ({ left: 'Turn left', right: 'Turn right', straight: 'Continue straight', uturn: 'Make a U-turn', arrive: 'Arrive' })[t]

export function drawGps(g: CanvasRenderingContext2D, o: GpsStyle) {
  const s = useGame.getState()
  const p = palette()
  const W = o.w
  const H = o.h
  const u = o.ui
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.fillStyle = p.bg
  g.fillRect(0, 0, W, H)

  if (o.view === 'home') return drawHome(g, o, p)

  const px = s.inVehicle ? rt.vehiclePos.x : rt.playerPos.x
  const pz = s.inVehicle ? rt.vehiclePos.z : rt.playerPos.z
  const yaw = s.inVehicle ? rt.vehicleYaw : rt.playerYaw
  const sin = Math.sin(yaw)
  const cos = Math.cos(yaw)
  const k = o.scale
  const track = o.mode === 'track'
  const cxw = o.centre && !track ? o.centre.x : px
  const czw = o.centre && !track ? o.centre.z : pz
  const cx = W / 2
  const cy = track ? H * (o.hud ? 0.66 : 0.62) : H / 2
  const sx = (x: number, z: number) => {
    const dx = x - cxw
    const dz = z - czw
    return track ? cx + (-dx * cos + dz * sin) * k : cx + dx * k
  }
  const sy = (x: number, z: number) => {
    const dx = x - cxw
    const dz = z - czw
    return track ? cy - (dx * sin + dz * cos) * k : cy + dz * k
  }
  const P = (x: number, z: number): [number, number] => [sx(x, z), sy(x, z)]

  // visible world radius (generous for rotated views)
  const rad = Math.hypot(W, H) / k / 2 + CELL
  const L = limit()

  // blocks
  for (const b of blocks) {
    if (Math.abs(b.cx - cxw) > rad || Math.abs(b.cz - czw) > rad) continue
    const hx = Math.abs(b.cx) > (L + 0.5) * CELL
    const hz = Math.abs(b.cz) > (L + 0.5) * CELL
    g.fillStyle = hx || hz ? '#0a101c' : b.district === 'park' ? p.park : p.block
    g.beginPath()
    const hw = (CELL - ROAD_W) / 2
    const c = [P(b.cx - hw, b.cz - hw), P(b.cx + hw, b.cz - hw), P(b.cx + hw, b.cz + hw), P(b.cx - hw, b.cz + hw)]
    g.moveTo(c[0][0], c[0][1])
    for (let i = 1; i < 4; i++) g.lineTo(c[i][0], c[i][1])
    g.closePath()
    g.fill()
  }

  // roads
  const roadW = Math.max(3, ROAD_W * k)
  g.lineCap = 'butt'
  const drawRoads = (locked: boolean) => {
    g.strokeStyle = locked ? p.roadLocked : p.road
    g.lineWidth = roadW
    g.beginPath()
    for (let i = ROAD_MIN; i <= ROAD_MAX; i++) {
      const isLocked = Math.abs(i) > L
      if (isLocked !== locked) continue
      const ext = (locked ? ROAD_MAX : L) * CELL
      const [ax, ay] = P(i * CELL, -ext)
      const [bx, by] = P(i * CELL, ext)
      g.moveTo(ax, ay)
      g.lineTo(bx, by)
      const [cx2, cy2] = P(-ext, i * CELL)
      const [dx2, dy2] = P(ext, i * CELL)
      g.moveTo(cx2, cy2)
      g.lineTo(dx2, dy2)
    }
    g.stroke()
  }
  drawRoads(true)
  drawRoads(false)
  // centre lines
  g.strokeStyle = p.centre
  g.lineWidth = Math.max(1, k * 0.45)
  g.setLineDash([Math.max(4, k * 5), Math.max(4, k * 5)])
  g.beginPath()
  for (let i = -L; i <= L; i++) {
    const ext = L * CELL
    const [ax, ay] = P(i * CELL, -ext)
    const [bx, by] = P(i * CELL, ext)
    g.moveTo(ax, ay)
    g.lineTo(bx, by)
    const [cx2, cy2] = P(-ext, i * CELL)
    const [dx2, dy2] = P(ext, i * CELL)
    g.moveTo(cx2, cy2)
    g.lineTo(dx2, dy2)
  }
  g.stroke()
  g.setLineDash([])
  // intersections
  g.fillStyle = '#3b4d72'
  for (let i = -L; i <= L; i++)
    for (let j = -L; j <= L; j++) {
      if (Math.abs(i * CELL - cxw) > rad || Math.abs(j * CELL - czw) > rad) continue
      const [ix, iy] = P(i * CELL, j * CELL)
      g.beginPath()
      g.arc(ix, iy, Math.max(2, 2.6 * u), 0, Math.PI * 2)
      g.fill()
    }

  // street names along the roads near the view centre
  if (k * CELL > 52) {
    g.font = FONT(11 * u, 600)
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const label = (alongZ: boolean, idx: number) => {
      const name = streetName(alongZ, idx)
      // place the label on the road a block ahead of the view centre
      const aheadX = cxw + (track ? sin * 60 : 0)
      const aheadZ = czw + (track ? cos * 60 : 0)
      const wx = alongZ ? idx * CELL : (Math.floor(aheadX / CELL) + 0.5) * CELL
      const wz = alongZ ? (Math.floor(aheadZ / CELL) + 0.5) * CELL : idx * CELL
      if (Math.abs(wx) > L * CELL + 1 || Math.abs(wz) > L * CELL + 1) return
      const [ax, ay] = P(wx, wz)
      if (ax < 20 || ax > W - 20 || ay < 20 * u || ay > H - 20 * u) return
      const [bx, by] = alongZ ? P(wx, wz + 10) : P(wx + 10, wz)
      let ang = Math.atan2(by - ay, bx - ax)
      if (ang > Math.PI / 2) ang -= Math.PI
      if (ang < -Math.PI / 2) ang += Math.PI
      g.save()
      g.translate(ax, ay)
      g.rotate(ang)
      g.fillStyle = 'rgba(8,14,26,.72)'
      const tw = g.measureText(name).width + 8 * u
      g.fillRect(-tw / 2, -7 * u, tw, 14 * u)
      g.fillStyle = p.label
      g.fillText(name, 0, 0.5)
      g.restore()
    }
    for (let i = -L; i <= L; i++) {
      if (Math.abs(i * CELL - cxw) < rad * 0.7) label(true, i)
      if (Math.abs(i * CELL - czw) < rad * 0.7) label(false, i)
    }
  }

  // route
  const r = gps.route
  if (r && gps.target) {
    const aheadPts: [number, number][] = []
    // the part of the route still to drive, starting at the car's progress
    let a = gps.along
    let startIdx = 1
    while (startIdx < r.pts.length - 1 && r.cum[startIdx] < a) startIdx++
    const seg0 = r.pts[startIdx - 1]
    const seg1 = r.pts[startIdx]
    const segLen = r.cum[startIdx] - r.cum[startIdx - 1] || 1
    const u0 = Math.max(0, Math.min(1, (a - r.cum[startIdx - 1]) / segLen))
    aheadPts.push(P(seg0.x + (seg1.x - seg0.x) * u0, seg0.z + (seg1.z - seg0.z) * u0))
    for (let i = startIdx; i < r.pts.length; i++) aheadPts.push(P(r.pts[i].x, r.pts[i].z))
    g.lineJoin = 'round'
    g.lineCap = 'round'
    const stroke = (col: string, w: number) => {
      g.strokeStyle = col
      g.lineWidth = w
      g.beginPath()
      g.moveTo(aheadPts[0][0], aheadPts[0][1])
      for (let i = 1; i < aheadPts.length; i++) g.lineTo(aheadPts[i][0], aheadPts[i][1])
      g.stroke()
    }
    stroke(p.routeCase, Math.max(7, 7.5 * u))
    stroke(p.route, Math.max(4, 4.6 * u))
    // dashed connector from the road to the exact destination (kerbside)
    const last = r.pts[r.pts.length - 1]
    if (Math.hypot(last.x - gps.target.x, last.z - gps.target.z) > 1) {
      g.setLineDash([4, 4])
      g.strokeStyle = p.dest
      g.lineWidth = 2
      g.beginPath()
      g.moveTo(...P(last.x, last.z))
      g.lineTo(...P(gps.target.x, gps.target.z))
      g.stroke()
      g.setLineDash([])
    }
    // next manoeuvre ring
    const nm = r.maneuvers.find((q) => q.at > gps.along + 1 && q.turn !== 'straight' && q.turn !== 'arrive')
    if (nm) {
      const [mx, my] = P(nm.x, nm.z)
      g.fillStyle = '#fff'
      g.strokeStyle = p.routeCase
      g.lineWidth = 2
      g.beginPath()
      g.arc(mx, my, 5.5 * u, 0, Math.PI * 2)
      g.fill()
      g.stroke()
    }
  }

  // markers (mission destination green, checkpoints yellow, pickups blue)
  const all = [...s.djMarkers, ...s.markers, ...s.startMarkers]
  for (const m of all) {
    if (m.kind === 'search') continue
    const [mx, my] = P(m.x, m.z)
    if (mx < -20 || my < -20 || mx > W + 20 || my > H + 20) continue
    const col = m.kind === 'cp' ? p.dest : m.kind === 'goal' ? p.check : markerColor(m.kind)
    g.fillStyle = col
    g.strokeStyle = '#04101e'
    g.lineWidth = 2.5
    if (m.kind === 'goal') {
      g.beginPath()
      g.moveTo(mx, my - 8 * u)
      g.lineTo(mx + 7 * u, my)
      g.lineTo(mx, my + 8 * u)
      g.lineTo(mx - 7 * u, my)
      g.closePath()
    } else {
      // map pin
      g.beginPath()
      g.arc(mx, my - 9 * u, 7 * u, Math.PI * 0.85, Math.PI * 2.15)
      g.lineTo(mx, my)
      g.closePath()
    }
    g.fill()
    g.stroke()
    if (m.kind !== 'goal') {
      g.fillStyle = '#fff'
      g.beginPath()
      g.arc(mx, my - 9 * u, 2.6 * u, 0, Math.PI * 2)
      g.fill()
    }
  }
  // parking bay outline
  const bay = activeJob()?.bay
  if (bay) {
    const ax = Math.sin(bay.yaw)
    const az = Math.cos(bay.yaw)
    const corner = (a: number, b: number) => P(bay.x + ax * a + az * b, bay.z + az * a - ax * b)
    const c = [corner(-bay.len / 2, -bay.wid / 2), corner(bay.len / 2, -bay.wid / 2), corner(bay.len / 2, bay.wid / 2), corner(-bay.len / 2, bay.wid / 2)]
    g.strokeStyle = p.dest
    g.fillStyle = 'rgba(53,224,138,.25)'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(c[0][0], c[0][1])
    for (let i = 1; i < 4; i++) g.lineTo(c[i][0], c[i][1])
    g.closePath()
    g.fill()
    g.stroke()
  }

  // off-screen destination arrow on the screen edge
  if (gps.target) {
    const [tx, ty] = P(gps.target.x, gps.target.z)
    const m = 16 * u
    if (tx < m || ty < m || tx > W - m || ty > H - m) {
      const dx = tx - cx
      const dy = ty - cy
      const sc = Math.min((W / 2 - m) / Math.abs(dx || 1e-6), (H / 2 - m * (o.hud ? 3.4 : 1)) / Math.abs(dy || 1e-6))
      const ex = cx + dx * sc
      const ey = cy + dy * sc
      g.save()
      g.translate(ex, ey)
      g.rotate(Math.atan2(dy, dx) + Math.PI / 2)
      g.fillStyle = p.dest
      g.strokeStyle = '#04101e'
      g.lineWidth = 2
      g.beginPath()
      g.moveTo(0, -9 * u)
      g.lineTo(7 * u, 6 * u)
      g.lineTo(-7 * u, 6 * u)
      g.closePath()
      g.fill()
      g.stroke()
      g.restore()
    }
  }

  // vehicle / player arrow
  const [vx, vy] = track ? [cx, cy] : P(px, pz)
  g.save()
  g.translate(vx, vy)
  g.rotate(track ? 0 : Math.PI - yaw)
  g.fillStyle = 'rgba(61,165,255,.22)'
  g.beginPath()
  g.arc(0, 0, 15 * u, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = p.car
  g.strokeStyle = '#04101e'
  g.lineWidth = 2.2
  g.beginPath()
  g.moveTo(0, -13 * u)
  g.lineTo(9 * u, 10 * u)
  g.lineTo(0, 5 * u)
  g.lineTo(-9 * u, 10 * u)
  g.closePath()
  g.fill()
  g.stroke()
  g.restore()

  // compass
  const cr = 10 * u
  const ccx = W - cr - 8 * u
  const ccy = (o.hud ? H * 0.2 + 6 * u : 8 * u) + cr
  g.fillStyle = 'rgba(5,9,18,.7)'
  g.beginPath()
  g.arc(ccx, ccy, cr, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#ff6a5a'
  g.font = FONT(10 * u, 800)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  // north is -z in the world; in track-up mode it swings around the compass as the car turns
  const nx = track ? -sin : 0
  const ny = track ? cos : -1
  g.fillText('N', ccx + nx * cr * 0.55, ccy + ny * cr * 0.55)
  g.fillStyle = '#9fb0d4'
  g.beginPath()
  g.arc(ccx - nx * cr * 0.45, ccy - ny * cr * 0.45, 1.6 * u, 0, Math.PI * 2)
  g.fill()

  if (o.hud) drawHud(g, o, p)
}

function drawHud(g: CanvasRenderingContext2D, o: GpsStyle, p: ReturnType<typeof palette>) {
  const s = useGame.getState()
  const W = o.w
  const H = o.h
  const u = o.ui
  const top = H * 0.2
  g.fillStyle = p.barBg
  g.fillRect(0, 0, W, top)
  const bot = H * 0.14
  g.fillStyle = p.barBg
  g.fillRect(0, H - bot, W, bot)
  g.textBaseline = 'middle'

  // top bar: next turn
  if (gps.target && gps.route) {
    if (gps.recalcFlash > 0) {
      g.fillStyle = '#ffd24a'
      g.font = FONT(17 * u, 700)
      g.textAlign = 'left'
      g.fillText('Recalculating route…', 12 * u, top / 2)
    } else {
      const n = gps.next
      const turn: Turn = n ? n.turn : 'arrive'
      turnGlyph(g, turn, top * 0.55, top / 2, top * 0.72, '#fff')
      g.textAlign = 'left'
      g.fillStyle = '#fff'
      g.font = FONT(20 * u, 700)
      const dist = n ? n.dist : gps.remaining
      g.fillText(fmtDist(dist), top * 1.05, top * 0.34)
      g.fillStyle = '#b9c7e6'
      g.font = FONT(13 * u, 600)
      const line = n ? `${turnText(turn)}${n.street ? ' onto ' + n.street : ''}` : `Arrive at ${gps.target.label}`
      g.fillText(clip(g, line, W - top * 1.05 - 34 * u), top * 1.05, top * 0.72)
    }
  } else {
    g.fillStyle = '#b9c7e6'
    g.font = FONT(14 * u, 600)
    g.textAlign = 'left'
    g.fillText('No destination — press J for driver jobs', 12 * u, top / 2)
  }

  // bottom bar: distance, ETA, mission status
  g.font = FONT(14 * u, 700)
  g.textAlign = 'left'
  g.fillStyle = '#fff'
  const left = gps.target ? `${fmtDist(gps.remaining)}  ·  ${fmtEta(gps.etaSec)}` : `${s.speedKmh} km/h`
  g.fillText(left, 12 * u, H - bot / 2)
  g.textAlign = 'right'
  g.font = FONT(12 * u, 600)
  g.fillStyle = s.djJob ? p.check : '#7f8fb0'
  const status = s.djJob ? `${s.djJob.title}` : 'No active job'
  g.fillText(clip(g, status, W * 0.5), W - 12 * u, H - bot / 2)
}

function clip(g: CanvasRenderingContext2D, text: string, max: number) {
  if (g.measureText(text).width <= max) return text
  let t = text
  while (t.length > 3 && g.measureText(t + '…').width > max) t = t.slice(0, -1)
  return t + '…'
}

function drawHome(g: CanvasRenderingContext2D, o: GpsStyle, p: ReturnType<typeof palette>) {
  const s = useGame.getState()
  const W = o.w
  const H = o.h
  const u = o.ui
  const hh = Math.floor(s.hour)
  const mm = Math.floor((s.hour - hh) * 60)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#fff'
  g.font = FONT(46 * u, 700)
  g.fillText(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, W / 2, H * 0.24)
  g.fillStyle = p.accent
  g.font = FONT(38 * u, 700)
  g.fillText(`${s.speedKmh} km/h`, W / 2, H * 0.46)
  g.fillStyle = '#b9c7e6'
  g.font = FONT(15 * u, 600)
  g.fillText(s.djJob ? s.djJob.title : 'No active driver job', W / 2, H * 0.64)
  g.fillStyle = '#7f8fb0'
  g.font = FONT(13 * u, 600)
  g.fillText(s.djJob ? clip(g, s.djJob.text, W - 30 * u) : 'Press J for the Driver Jobs menu', W / 2, H * 0.74)
  g.fillStyle = p.accent
  g.fillText('Press MAP for navigation', W / 2, H * 0.9)
}

export function drawOff(g: CanvasRenderingContext2D, w: number, h: number, ui: number) {
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.fillStyle = '#030509'
  g.fillRect(0, 0, w, h)
  g.fillStyle = '#26324a'
  g.font = FONT(16 * ui, 600)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('GPS OFF', w / 2, h / 2 - 8 * ui)
  g.font = FONT(12 * ui, 500)
  g.fillText('press G or the GPS button', w / 2, h / 2 + 14 * ui)
}

/** Pixels per metre for the dashboard screen: zooms out a little as the car speeds up. */
export const dashScale = (w: number) => (w / 520) * (1.25 - 0.45 * Math.min(1, rt.vehicleSpeed / 40))
