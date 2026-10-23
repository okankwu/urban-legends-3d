import { CELL } from '../city/layout'
import { limit, nodePos, snapToRoad, streetName } from './roadGraph'
import type { GridNode, Pt, RoadPoint } from './roadGraph'

/**
 * GPSRoutePlanner: A* over the road graph, plus the runtime that follows the driver along the route,
 * reports the next turn / remaining distance / ETA, and re-plans when the driver leaves the route.
 */
export type Turn = 'left' | 'right' | 'straight' | 'uturn' | 'arrive'
export interface Maneuver {
  turn: Turn
  x: number
  z: number
  /** distance along the route where the manoeuvre happens */
  at: number
  street: string
}
export interface Route {
  pts: Pt[]
  cum: number[]
  length: number
  maneuvers: Maneuver[]
  /** exact destination (may sit on the kerb beside the snapped road point) */
  dest: Pt
}
export interface NavTarget extends Pt {
  label: string
}

const DIRS = [
  { di: 1, dj: 0 },
  { di: -1, dj: 0 },
  { di: 0, dj: 1 },
  { di: 0, dj: -1 },
]
const TURN_COST = 6
const UTURN_COST = 45

const key = (i: number, j: number, d: number) => ((i + 8) * 17 + (j + 8)) * 4 + d
const edgeKey = (a: GridNode, b: GridNode) => (a.i < b.i || (a.i === b.i && a.j < b.j) ? `${a.i},${a.j}|${b.i},${b.j}` : `${b.i},${b.j}|${a.i},${a.j}`)
const unit = (dx: number, dz: number) => {
  const l = Math.hypot(dx, dz) || 1
  return { x: dx / l, z: dz / l }
}

interface Rec {
  g: number
  f: number
  i: number
  j: number
  d: number
  parent: number
  /** terminal records represent "arrived at the destination" */
  goal?: boolean
}

/**
 * Plans a route from a world position (with an optional travel heading) to a destination.
 * Returns null when no road exists (never happens on the full grid, but kept honest).
 */
export function planRoute(from: Pt, heading: number | null, to: Pt): Route | null {
  const S = snapToRoad(from.x, from.z)
  const G = snapToRoad(to.x, to.z)
  const L = limit()
  const gEdge = edgeKey(G.a, G.b)
  const sEdge = edgeKey(S.a, S.b)
  const hv = heading == null ? null : { x: Math.sin(heading), z: Math.cos(heading) }
  const along = (p: RoadPoint) => (p.alongZ ? { x: 0, z: 1 } : { x: 1, z: 0 })
  const sd = along(S)
  const sdot = hv ? hv.x * sd.x + hv.z * sd.z : 0

  const recs: Rec[] = []
  const open: number[] = []
  const best = new Map<number, number>()
  const gridDist = (i: number, j: number) => Math.abs(i * CELL - G.x) + Math.abs(j * CELL - G.z)
  const push = (r: Rec) => {
    const k = r.goal ? -1 : key(r.i, r.j, r.d)
    if (!r.goal) {
      const prev = best.get(k)
      if (prev !== undefined && prev <= r.g) return
      best.set(k, r.g)
    }
    recs.push(r)
    open.push(recs.length - 1)
  }

  // direct run along the shared segment
  if (sEdge === gEdge) {
    const forward = G.t >= S.t
    const dirDot = forward ? sdot : -sdot
    const pen = hv && dirDot < -0.3 ? UTURN_COST : 0
    push({ g: Math.abs(G.t - S.t) * CELL + pen, f: 0, i: 0, j: 0, d: 0, parent: -1, goal: true })
  }
  // leave the start segment towards either end
  const ends: { n: GridNode; dist: number; dir: number; dot: number }[] = []
  const dirIdx = (dx: number, dz: number) => DIRS.findIndex((q) => q.di === Math.sign(dx) && q.dj === Math.sign(dz))
  ends.push({ n: S.b, dist: (1 - S.t) * CELL, dir: dirIdx(S.b.i - S.a.i, S.b.j - S.a.j), dot: sdot })
  ends.push({ n: S.a, dist: S.t * CELL, dir: dirIdx(S.a.i - S.b.i, S.a.j - S.b.j), dot: -sdot })
  for (const e of ends) {
    const pen = hv && e.dot < -0.3 ? UTURN_COST : 0
    push({ g: e.dist + pen, f: e.dist + pen + gridDist(e.n.i, e.n.j), i: e.n.i, j: e.n.j, d: e.dir, parent: -1 })
  }

  let goalRec = -1
  let guard = 0
  while (open.length && guard++ < 4000) {
    // pop the lowest f (the open list is tiny: at most a few hundred states)
    let bi = 0
    for (let k = 1; k < open.length; k++) if (recs[open[k]].f < recs[open[bi]].f) bi = k
    const ri = open.splice(bi, 1)[0]
    const r = recs[ri]
    if (r.goal) {
      goalRec = ri
      break
    }
    if (r.g > (best.get(key(r.i, r.j, r.d)) ?? Infinity)) continue
    for (let nd = 0; nd < 4; nd++) {
      if (DIRS[nd].di === -DIRS[r.d].di && DIRS[nd].dj === -DIRS[r.d].dj) continue // no U-turn at a junction
      const ni = r.i + DIRS[nd].di
      const nj = r.j + DIRS[nd].dj
      if (Math.abs(ni) > L || Math.abs(nj) > L) continue
      const turn = nd !== r.d ? TURN_COST : 0
      if (edgeKey({ i: r.i, j: r.j }, { i: ni, j: nj }) === gEdge) {
        // the destination lies on this segment: finish after the distance from this node to the point
        const dd = Math.hypot(G.x - r.i * CELL, G.z - r.j * CELL)
        push({ g: r.g + turn + dd, f: r.g + turn + dd, i: r.i, j: r.j, d: nd, parent: ri, goal: true })
      }
      const g = r.g + turn + CELL
      push({ g, f: g + gridDist(ni, nj), i: ni, j: nj, d: nd, parent: ri })
    }
  }
  if (goalRec < 0) return null

  // rebuild the node list
  const nodes: GridNode[] = []
  // a goal record's parent is the last junction record (or -1 for a direct run along the start segment)
  let cur = recs[goalRec].parent
  const chain: Rec[] = []
  while (cur >= 0) {
    chain.push(recs[cur])
    cur = recs[cur].parent
  }
  chain.reverse()
  for (const r of chain) nodes.push({ i: r.i, j: r.j })
  // the first record is the node at the end of the start segment we chose
  const pts: Pt[] = [{ x: S.x, z: S.z }]
  for (const n of nodes) pts.push(nodePos(n.i, n.j))
  pts.push({ x: G.x, z: G.z })

  // drop zero-length hops (start sitting exactly on a junction)
  const clean: Pt[] = [pts[0]]
  for (let k = 1; k < pts.length; k++) if (Math.hypot(pts[k].x - clean[clean.length - 1].x, pts[k].z - clean[clean.length - 1].z) > 0.5) clean.push(pts[k])
  if (clean.length < 2) clean.push({ x: G.x, z: G.z })

  const cum = [0]
  for (let k = 1; k < clean.length; k++) cum.push(cum[k - 1] + Math.hypot(clean[k].x - clean[k - 1].x, clean[k].z - clean[k - 1].z))

  const maneuvers: Maneuver[] = []
  // an immediate U-turn when the first leg points against the driver's heading
  if (hv) {
    const d0 = unit(clean[1].x - clean[0].x, clean[1].z - clean[0].z)
    if (hv.x * d0.x + hv.z * d0.z < -0.5) maneuvers.push({ turn: 'uturn', x: clean[0].x, z: clean[0].z, at: 0, street: nameAlong(d0, clean[1]) })
  }
  for (let k = 1; k < clean.length - 1; k++) {
    const din = unit(clean[k].x - clean[k - 1].x, clean[k].z - clean[k - 1].z)
    const dout = unit(clean[k + 1].x - clean[k].x, clean[k + 1].z - clean[k].z)
    const cross = din.x * dout.z - din.z * dout.x
    const dot = din.x * dout.x + din.z * dout.z
    let turn: Turn = 'straight'
    if (dot < -0.5) turn = 'uturn'
    else if (cross > 0.5) turn = 'right'
    else if (cross < -0.5) turn = 'left'
    maneuvers.push({ turn, x: clean[k].x, z: clean[k].z, at: cum[k], street: nameAlong(dout, clean[k + 1]) })
  }
  const last = clean[clean.length - 1]
  maneuvers.push({ turn: 'arrive', x: last.x, z: last.z, at: cum[cum.length - 1], street: '' })
  return { pts: clean, cum, length: cum[cum.length - 1], maneuvers, dest: { x: to.x, z: to.z } }
}

/** Name of the street that a leg heading in direction d towards point p belongs to. */
function nameAlong(d: Pt, p: Pt): string {
  const alongZ = Math.abs(d.x) < Math.abs(d.z)
  const k = alongZ ? Math.round(p.x / CELL) : Math.round(p.z / CELL)
  return streetName(alongZ, k)
}

// ---------------------------------------------------------------------------------------------------------
// runtime tracking
// ---------------------------------------------------------------------------------------------------------
export const gps = {
  target: null as NavTarget | null,
  route: null as Route | null,
  /** metres travelled along the current route */
  along: 0,
  remaining: 0,
  etaSec: 0,
  /** distance from the route centre line */
  offDist: 0,
  offRouteT: 0,
  /** seconds spent driving against the route direction */
  wrongWayT: 0,
  recalcs: 0,
  /** seconds left to show "Recalculating…" */
  recalcFlash: 0,
  speedAvg: 9,
  /** bumps every time the route is (re)built */
  rev: 0,
  routeLimit: 3,
  next: null as null | { turn: Turn; dist: number; street: string },
  /** progress counters read by the job tracker */
  offRouteSeconds: 0,
  routeSeconds: 0,
}

const OFF_ROUTE = 15

export function setNavTarget(t: NavTarget | null) {
  const same = gps.target && t && gps.target.x === t.x && gps.target.z === t.z
  gps.target = t
  if (!same) {
    gps.route = null
    gps.recalcs = 0
    gps.offRouteT = 0
  }
  if (!t) {
    gps.route = null
    gps.next = null
    gps.remaining = 0
    gps.etaSec = 0
  }
}

function plan(pos: Pt, yaw: number | null) {
  const t = gps.target
  if (!t) return
  gps.route = planRoute(pos, yaw, t)
  gps.routeLimit = limit()
  gps.rev++
  gps.along = 0
}

export function tickGps(dt: number, pos: Pt, yaw: number | null, speed: number) {
  gps.recalcFlash = Math.max(0, gps.recalcFlash - dt)
  if (!gps.target) return
  gps.speedAvg += (speed - gps.speedAvg) * Math.min(1, dt * 0.4)
  if (!gps.route || gps.routeLimit !== limit()) plan(pos, yaw)
  const r = gps.route
  if (!r) return

  // distance to the route polyline and progress along it
  let bestD = Infinity
  let bestAlong = 0
  let bestDir = { x: 0, z: 0 }
  for (let k = 1; k < r.pts.length; k++) {
    const a = r.pts[k - 1]
    const b = r.pts[k]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const l2 = dx * dx + dz * dz || 1
    const u = Math.max(0, Math.min(1, ((pos.x - a.x) * dx + (pos.z - a.z) * dz) / l2))
    const d = Math.hypot(pos.x - (a.x + dx * u), pos.z - (a.z + dz * u))
    if (d < bestD) {
      bestD = d
      bestAlong = r.cum[k - 1] + u * Math.sqrt(l2)
      bestDir = { x: dx / Math.sqrt(l2), z: dz / Math.sqrt(l2) }
    }
  }
  gps.offDist = bestD
  gps.along = Math.max(gps.along, bestAlong) // progress only moves forward; a re-plan resets it
  gps.remaining = Math.max(0, r.length - gps.along)
  const toDest = Math.hypot(pos.x - gps.target.x, pos.z - gps.target.z)
  if (gps.remaining < toDest) gps.remaining = toDest
  const v = Math.max(8, Math.min(22, gps.speedAvg))
  gps.etaSec = gps.remaining / v

  gps.routeSeconds += dt
  if (bestD > OFF_ROUTE) {
    gps.offRouteT += dt
    gps.offRouteSeconds += dt
    if (gps.offRouteT > 1.0) {
      gps.offRouteT = 0
      gps.recalcs++
      gps.recalcFlash = 1.6
      plan(pos, yaw)
    }
  } else {
    gps.offRouteT = 0
    // driving the right road the wrong way: re-plan so the GPS asks for a U-turn
    if (yaw != null && speed > 2.5 && Math.sin(yaw) * bestDir.x + Math.cos(yaw) * bestDir.z < -0.5) gps.wrongWayT += dt
    else gps.wrongWayT = 0
    if (gps.wrongWayT > 1.2) {
      gps.wrongWayT = 0
      plan(pos, yaw)
      if (gps.route?.maneuvers[0]?.turn === 'uturn') gps.wrongWayT = -6 // the GPS is already asking for a U-turn
      else {
        gps.recalcs++
        gps.recalcFlash = 1.6
      }
    }
  }

  const m = gps.route?.maneuvers.find((q) => q.at > gps.along - 3 && q.turn !== 'straight')
  gps.next = m ? { turn: m.turn, dist: Math.max(0, m.at - gps.along), street: m.street } : null
}

/** Resets the per-job route-adherence counters (called when a job starts). */
export function resetRouteStats() {
  gps.offRouteSeconds = 0
  gps.routeSeconds = 0
  gps.recalcs = 0
}

export const fmtDist = (m: number) => (m >= 950 ? (m / 1000).toFixed(1) + ' km' : Math.max(0, Math.round(m / 10) * 10) + ' m')
export const fmtEta = (s: number) => {
  const t = Math.max(0, Math.round(s))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}
