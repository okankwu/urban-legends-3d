import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import type { RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { rt } from '../engine/runtime'
import { useGame } from '../store/game'
import type { Marker } from './types'

/** Street race around the downtown ring. Start/finish on the east-west road at z = -80. */
export const START = { x: -40, z: -80 }
export const GRID = { x: -54, z: -80 }
export const CHECKPOINTS: { x: number; z: number }[] = [
  { x: 80, z: -80 },
  { x: 80, z: 0 },
  { x: 80, z: 80 },
  { x: 0, z: 80 },
  { x: -80, z: 80 },
  { x: -80, z: 0 },
  { x: -80, z: -80 },
]
const CORNERS = [
  { x: 80, z: -80 },
  { x: 80, z: 80 },
  { x: -80, z: 80 },
  { x: -80, z: -80 },
]
const ROUTE = [START, ...CORNERS, START]
const RACERS = [
  { name: 'Vega', color: '#e8a31b', speed: 24.5, lane: -5 },
  { name: 'Mako', color: '#c0392b', speed: 27, lane: 0 },
  { name: 'Ruiz', color: '#2fa36b', speed: 29, lane: 5 },
]

// ---- smoothed path ----------------------------------------------------------------------------------
const path: { x: number; z: number; slow: number }[] = []
const cum: number[] = []
;(() => {
  const R = 16
  const pts: { x: number; z: number }[] = [ROUTE[0]]
  for (let i = 1; i < ROUTE.length - 1; i++) {
    const a = ROUTE[i - 1]
    const b = ROUTE[i]
    const c = ROUTE[i + 1]
    const d1 = Math.hypot(b.x - a.x, b.z - a.z)
    const d2 = Math.hypot(c.x - b.x, c.z - b.z)
    const p0 = { x: b.x + ((a.x - b.x) / d1) * R, z: b.z + ((a.z - b.z) / d1) * R }
    const p2 = { x: b.x + ((c.x - b.x) / d2) * R, z: b.z + ((c.z - b.z) / d2) * R }
    pts.push(p0)
    for (let s = 1; s < 8; s++) {
      const t = s / 8
      pts.push({
        x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * b.x + t * t * p2.x,
        z: (1 - t) * (1 - t) * p0.z + 2 * (1 - t) * t * b.z + t * t * p2.z,
      })
    }
    pts.push(p2)
  }
  pts.push(ROUTE[ROUTE.length - 1])
  // resample every 3 m along the smoothed polyline
  const dc: number[] = [0]
  for (let i = 1; i < pts.length; i++) dc.push(dc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z))
  const total = dc[dc.length - 1]
  let j = 1
  for (let d = 0; d < total; d += 3) {
    while (j < pts.length - 1 && dc[j] < d) j++
    const a = pts[j - 1]
    const b = pts[j]
    const u = (d - dc[j - 1]) / Math.max(1e-6, dc[j] - dc[j - 1])
    path.push({ x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, slow: 1 })
  }
  path.push({ ...pts[pts.length - 1], slow: 1 })
  cum.push(0)
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z))
  for (const p of path) {
    let dmin = 1e9
    for (const c of CORNERS) dmin = Math.min(dmin, Math.hypot(p.x - c.x, p.z - c.z))
    p.slow = THREE.MathUtils.clamp(dmin / 45, 0.5, 1)
  }
})()
const LENGTH = cum[cum.length - 1]

function sample(s: number): { x: number; z: number; fx: number; fz: number; slow: number } {
  const t = Math.max(0, Math.min(LENGTH - 0.01, s))
  let lo = 0
  let hi = cum.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (cum[mid] <= t) lo = mid
    else hi = mid
  }
  const a = path[lo]
  const b = path[hi]
  const u = (t - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo])
  const dx = b.x - a.x
  const dz = b.z - a.z
  const dl = Math.hypot(dx, dz) || 1
  return { x: a.x + dx * u, z: a.z + dz * u, fx: dx / dl, fz: dz / dl, slow: a.slow }
}

// ---- race state -------------------------------------------------------------------------------------------
interface Racer {
  s: number
  v: number
  x: number
  z: number
  yaw: number
  finished: boolean
}
export const racers: Racer[] = RACERS.map(() => ({ s: 0, v: 0, x: GRID.x, z: GRID.z, yaw: Math.PI / 2, finished: false }))
export const race = {
  active: false,
  state: 'idle' as 'idle' | 'countdown' | 'running' | 'done',
  count: 3.99,
  cp: 0,
  playerIdx: 0,
  place: 0,
  finishPlace: 0,
  go: 0,
}

export function startRace() {
  race.active = true
  race.state = 'countdown'
  race.count = 3.99
  race.cp = 0
  race.playerIdx = 0
  race.finishPlace = 0
  racers.forEach((r, i) => {
    r.s = 0
    r.v = 0
    r.finished = false
    const p = sample(0)
    r.x = p.x
    r.z = p.z + RACERS[i].lane
    r.yaw = Math.PI / 2
  })
  rt.raceActive = true
  rt.freezeCar = true
}

export function stopRace() {
  race.active = false
  race.state = 'idle'
  rt.raceActive = false
  rt.freezeCar = false
  useGame.getState().set({ race: null })
}

export function raceMarkers(): Marker[] {
  if (race.state === 'idle') return []
  const total = CHECKPOINTS.length
  const out: Marker[] = []
  if (race.cp < total) out.push({ ...CHECKPOINTS[race.cp], kind: 'cp', label: `Checkpoint ${race.cp + 1}/${total}` })
  if (race.cp < total - 1) out.push({ ...CHECKPOINTS[race.cp + 1], kind: 'cp' })
  if (race.cp >= total) out.push({ ...START, kind: 'finish', label: 'Finish' })
  return out
}

/** Advances the race. Returns 'done' when the player finishes, 'fail' if disqualified. */
export function tickRace(dt: number, px: number, pz: number): 'done' | 'fail' | null {
  const st = useGame.getState()
  if (race.state === 'idle') return null
  const total = CHECKPOINTS.length

  if (race.state === 'countdown') {
    race.count -= dt
    if (race.count <= 0) {
      race.state = 'running'
      race.go = rt.simTime
      rt.freezeCar = false
    }
  }

  // project player onto the route to rank positions
  let best = race.playerIdx
  let bd = 1e9
  for (let i = Math.max(0, race.playerIdx - 4); i < Math.min(path.length, race.playerIdx + 70); i++) {
    const d = (path[i].x - px) ** 2 + (path[i].z - pz) ** 2
    if (d < bd) {
      bd = d
      best = i
    }
  }
  race.playerIdx = best
  const sPlayer = cum[best]

  if (race.state === 'running') {
    // AI: follow the path with rubber-banding relative to the player
    racers.forEach((r, i) => {
      if (r.finished) return
      const spec = RACERS[i]
      const gap = r.s - sPlayer
      let band = 1
      if (gap > 70) band = 0.82
      else if (gap > 35) band = 0.92
      else if (gap < -45) band = 1.12
      const p = sample(r.s)
      const target = spec.speed * p.slow * band
      r.v += (target - r.v) * Math.min(1, dt * 1.5)
      r.s += r.v * dt
      if (r.s >= LENGTH) {
        r.finished = true
        r.s = LENGTH
      }
      const q = sample(r.s)
      // lane offset perpendicular to travel, fading out near the end so everyone meets the line
      const off = spec.lane * (1 - Math.min(1, Math.max(0, (r.s - (LENGTH - 60)) / 60)))
      r.x = q.x - q.fz * off
      r.z = q.z + q.fx * off
      r.yaw = Math.atan2(q.fx, q.fz)
    })
    // player checkpoints
    if (race.cp < total) {
      const c = CHECKPOINTS[race.cp]
      if (Math.hypot(px - c.x, pz - c.z) < 16) race.cp++
    } else if (Math.hypot(px - START.x, pz - START.z) < 14) {
      race.finishPlace = 1 + racers.filter((r) => r.finished).length
      race.state = 'done'
      st.set({ race: { state: 'done', count: 0, place: race.finishPlace, total: RACERS.length + 1, cp: total, cps: total } })
      return 'done'
    }
  }

  const ahead = racers.filter((r) => r.s > sPlayer).length
  race.place = 1 + ahead
  const cdN = Math.max(0, Math.ceil(race.count))
  st.set({ race: { state: race.state === 'done' ? 'done' : race.state, count: cdN, place: race.place, total: RACERS.length + 1, cp: race.cp, cps: total } })
  if (st.vehicleHealth <= 0) return 'fail'
  return null
}

/** AI racer cars (kinematic bodies so the player can bump them). */
export function RaceCars() {
  const bodies = useRef<(RapierRigidBody | null)[]>([])
  const groups = useRef<(THREE.Group | null)[]>([])
  const mats = useMemo(() => RACERS.map((r) => new THREE.MeshStandardMaterial({ color: r.color, roughness: 0.35, metalness: 0.5 })), [])
  useFrame(() => {
    for (let i = 0; i < racers.length; i++) {
      const g = groups.current[i]
      if (g) g.visible = race.active
      const b = bodies.current[i]
      if (!b) continue
      if (!race.active) {
        b.setNextKinematicTranslation({ x: 0, y: -60, z: 0 })
        continue
      }
      const r = racers[i]
      b.setNextKinematicTranslation({ x: r.x, y: 0.55, z: r.z })
      const h = r.yaw / 2
      b.setNextKinematicRotation({ x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) })
    }
  })
  return (
    <>
      {RACERS.map((_, i) => (
        <RigidBody key={i} ref={(b) => {
            bodies.current[i] = b
          }} type="kinematicPosition" colliders={false} position={[0, -60, 0]}>
          <CuboidCollider args={[0.9, 0.55, 2.1]} position={[0, 0.2, 0]} />
          <group ref={(g) => {
              groups.current[i] = g
            }} visible={false}>
            <mesh position={[0, 0.25, 0]} castShadow material={mats[i]}>
              <boxGeometry args={[1.8, 0.6, 4.3]} />
            </mesh>
            <mesh position={[0, 0.78, -0.3]} castShadow>
              <boxGeometry args={[1.55, 0.5, 2.0]} />
              <meshStandardMaterial color="#12151a" roughness={0.2} metalness={0.6} />
            </mesh>
            <mesh position={[0, 0.95, -1.9]} material={mats[i]}>
              <boxGeometry args={[1.7, 0.08, 0.5]} />
            </mesh>
            {[-1, 1].map((sx) =>
              [-1.3, 1.3].map((sz) => (
                <mesh key={sx + '_' + sz} position={[sx * 0.9, -0.15, sz]} rotation-z={Math.PI / 2}>
                  <cylinderGeometry args={[0.36, 0.36, 0.26, 12]} />
                  <meshStandardMaterial color="#111" />
                </mesh>
              )),
            )}
          </group>
        </RigidBody>
      ))}
    </>
  )
}

export const RACER_NAMES = RACERS.map((r) => r.name)
