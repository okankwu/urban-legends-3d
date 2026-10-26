import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import type { RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { CELL } from '../city/layout'
import { LANE, STOP_DIST, inRoads, lightState, pedSpots, roadMax, RNG } from '../city/roadnet'
import { nightFactor } from '../city/City'
import { rt } from '../engine/runtime'
import { useGame } from '../store/game'
import { updateWanted } from '../police/wanted'

const COLORS = ['#b3201f', '#e8e8e8', '#202226', '#2c5aa8', '#d8a31b', '#3a7d44', '#7a7f87', '#e86f1c']
const MAX_CARS = 36
export const MAX_POLICE = 5
const CAR_VIS = { low: 130, medium: 190, high: 260 } as const
const LIMITS = { low: 12, medium: 24, high: 36 }

interface Car {
  // position, heading
  x: number
  z: number
  fx: number
  fz: number
  speed: number
  vmax: number
  // route state: heading along an axis towards intersection (ia, ib)
  ia: number
  ib: number
  maneuver: 'straight' | 'left' | 'right' | null
  turn: null | { t: number; len: number; p0: THREE.Vector2; p1: THREE.Vector2; p2: THREE.Vector2; nf: THREE.Vector2 }
  passed: boolean
  stopped: number
  braking: boolean
  color: string
  police?: boolean
  on?: boolean
  /** true while the car is in the world (not pooled/hidden) */
  act?: boolean
  offT?: number
}

const rnd = RNG(7771)

/** Live car state shared with audio / other systems. */
export const carPositions: Car[] = []

function laneCenter(i: number, axis: 'x' | 'z', dir: number): { x: number; z: number } {
  // axis x: road is the z-line k=i;  right-hand traffic
  if (axis === 'x') return { x: 0, z: i * CELL + (dir > 0 ? LANE : -LANE) }
  return { x: i * CELL + (dir > 0 ? -LANE : LANE), z: 0 }
}

function spawn(): Car {
  for (let tries = 0; tries < 50; tries++) {
    const axis = rnd() < 0.5 ? 'x' : 'z'
    const R = roadMax()
    const k = -R + Math.floor(rnd() * (2 * R + 1))
    const dir = rnd() < 0.5 ? 1 : -1
    const along = (rnd() * 2 - 1) * (R * CELL - 20)
    const lc = laneCenter(k, axis, dir)
    const x = axis === 'x' ? along : lc.x
    const z = axis === 'x' ? lc.z : along
    // next intersection ahead
    const idx = Math.floor(along / CELL) + (dir > 0 ? 1 : 0)
    const ahead = dir > 0 ? Math.floor(along / CELL) + 1 : Math.ceil(along / CELL) - 1
    void idx
    if (!inRoads(ahead)) continue
    // keep out of intersection boxes
    const rem = Math.abs(along - ahead * CELL)
    if (rem < 22) continue
    return {
      x,
      z,
      fx: axis === 'x' ? dir : 0,
      fz: axis === 'z' ? dir : 0,
      speed: 0,
      vmax: 9 + rnd() * 4,
      ia: axis === 'x' ? ahead : k,
      ib: axis === 'x' ? k : ahead,
      maneuver: null,
      turn: null,
      passed: false,
      stopped: 0,
      braking: false,
      color: COLORS[Math.floor(rnd() * COLORS.length)],
    }
  }
  return spawn()
}

function chooseManeuver(c: Car, goal?: { x: number; z: number }): 'straight' | 'left' | 'right' {
  const options: ('straight' | 'left' | 'right')[] = []
  const f = new THREE.Vector2(c.fx, c.fz)
  const r = new THREE.Vector2(-c.fz, c.fx)
  const ok = (d: THREE.Vector2) => inRoads(c.ia + d.x) && inRoads(c.ib + d.y)
  if (goal) {
    // pursuit: on a grid, picking the exit that ends closest to the target gets there
    let best: 'straight' | 'left' | 'right' = 'straight'
    let bd = 1e12
    const tryOpt = (name: 'straight' | 'left' | 'right', d: THREE.Vector2) => {
      if (!ok(d)) return
      const nx = (c.ia + d.x) * CELL
      const nz = (c.ib + d.y) * CELL
      const dist = (nx - goal.x) ** 2 + (nz - goal.z) ** 2 - (name === 'straight' ? 400 : 0)
      if (dist < bd) {
        bd = dist
        best = name
      }
    }
    tryOpt('straight', f)
    tryOpt('right', r)
    tryOpt('left', r.clone().negate())
    return best
  }
  if (ok(f)) options.push('straight', 'straight', 'straight')
  if (ok(r)) options.push('right')
  if (ok(r.clone().negate())) options.push('left')
  return options[Math.floor(rnd() * options.length)] ?? 'right'
}

/** Puts a police car on a road 120-190 m from the player. */
function spawnPolice(c: Car, px: number, pz: number) {
  for (let i = 0; i < 60; i++) {
    const s = spawn()
    const d = Math.hypot(s.x - px, s.z - pz)
    if (d > 110 && d < 200) {
      Object.assign(c, s, { police: true, on: true, offT: 0, color: '#f2f4f7', speed: 8 })
      return
    }
  }
  Object.assign(c, spawn(), { police: true, on: true, offT: 0, color: '#f2f4f7', speed: 8 })
}

function beginTurn(c: Car) {
  const cx = c.ia * CELL
  const cz = c.ib * CELL
  const f = new THREE.Vector2(c.fx, c.fz)
  const r = new THREE.Vector2(-f.y, f.x)
  const nf = c.maneuver === 'right' ? r.clone() : r.clone().negate()
  const nr = new THREE.Vector2(-nf.y, nf.x)
  const C = new THREE.Vector2(cx, cz)
  const p0 = C.clone().addScaledVector(f, -8).addScaledVector(r, LANE)
  const p2 = C.clone().addScaledVector(nr, LANE).addScaledVector(nf, 8)
  const p1 = C.clone().addScaledVector(r, LANE).addScaledVector(nr, LANE)
  const len = p0.distanceTo(p1) + p1.distanceTo(p2)
  c.turn = { t: 0, len: len * 0.85, p0, p1, p2, nf }
}

export default function Traffic() {
  const quality = useGame((s) => s.quality)
  const cars = useMemo(() => {
    const list = Array.from({ length: MAX_CARS + MAX_POLICE }, spawn)
    for (let i = MAX_CARS; i < list.length; i++) Object.assign(list[i], { police: true, on: false, offT: 0, color: '#f2f4f7' })
    return list
  }, [])
  const bodies = useRef<(RapierRigidBody | null)[]>([])
  const groups = useRef<(THREE.Group | null)[]>([])
  const brakeMats = useRef<THREE.MeshBasicMaterial[]>([])
  const headMats = useRef<THREE.MeshBasicMaterial[]>([])
  const limit = LIMITS[quality]
  carPositions.length = 0
  carPositions.push(...cars)
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__cars = cars

  useEffect(() => {
    // initial placement
    cars.forEach((c, i) => {
      bodies.current[i]?.setTranslation({ x: c.x, y: 0.5, z: c.z }, true)
    })
  }, [cars])

  const brakeMat = useMemo(() => Array.from({ length: MAX_CARS + MAX_POLICE }, () => new THREE.MeshBasicMaterial({ color: '#5a0f0f' })), [])
  const headMat = useMemo(() => Array.from({ length: MAX_CARS + MAX_POLICE }, () => new THREE.MeshBasicMaterial({ color: '#555' })), [])
  const barRed = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff1a1a' }), [])
  const barBlue = useMemo(() => new THREE.MeshBasicMaterial({ color: '#1a4dff' }), [])
  brakeMats.current = brakeMat
  headMats.current = headMat

  useFrame((_, rawDt) => {
    const st = useGame.getState()
    if (st.phase !== 'playing') return
    const dt = Math.min(rawDt, 0.05)
    rt.simTime += dt
    const night = nightFactor(st.hour)
    const px = st.inVehicle ? rt.vehiclePos.x : rt.playerPos.x
    const pz = st.inVehicle ? rt.vehiclePos.z : rt.playerPos.z

    // police: how many cars should be chasing, and (re)spawn / stand down
    const wantPolice = st.wanted > 0 ? Math.min(MAX_POLICE, st.wanted + 1) : 0
    const flash = Math.floor(performance.now() / 160) % 2 === 0
    barRed.color.set(flash ? '#ff1a1a' : '#400808')
    barBlue.color.set(flash ? '#081a55' : '#2f66ff')

    for (let i = 0; i < cars.length; i++) {
      const c = cars[i]
      if (c.police) {
        const pi = i - MAX_CARS
        if (pi < wantPolice && !c.on) spawnPolice(c, px, pz)
        if (pi >= wantPolice && c.on) {
          // stand down once far enough away, or after a while
          c.offT = (c.offT ?? 0) + dt
          if (Math.hypot(c.x - px, c.z - pz) > 90 || c.offT > 20) {
            c.on = false
            c.offT = 0
          }
        } else if (pi < wantPolice) c.offT = 0
      }
      const active = c.police ? !!c.on : i < limit && !rt.raceActive
      // cars stranded outside a (re)locked district are replaced
      if (Math.abs(c.x) > roadMax() * CELL + 14 || Math.abs(c.z) > roadMax() * CELL + 14) Object.assign(c, spawn())
      c.act = active
      const g = groups.current[i]
      if (g) {
        g.visible = active && Math.abs(c.x - px) < CAR_VIS[quality] && Math.abs(c.z - pz) < CAR_VIS[quality]
        if (g.visible) {
          // level of detail: beyond ~60 m only the body and cabin are drawn (children 0 and 1)
          const near = (c.x - px) ** 2 + (c.z - pz) ** 2 < 60 * 60
          if (g.userData.near !== near) {
            g.userData.near = near
            for (let k = 2; k < Math.min(10, g.children.length); k++) g.children[k].visible = near // wheels and lamps (a police light bar stays visible)
          }
        }
      }
      if (!active) {
        bodies.current[i]?.setNextKinematicTranslation({ x: 0, y: -50, z: 0 })
        continue
      }

      // ---- how far can we go? gap to the nearest obstacle ahead -------------------------
      let gap = 1e9
      const rx = -c.fz
      const rz = c.fx
      const consider = (ox: number, oz: number, halfW: number, maxAlong: number) => {
        const dx = ox - c.x
        const dz = oz - c.z
        const along = dx * c.fx + dz * c.fz
        if (along <= 0.5 || along > maxAlong) return
        const lat = Math.abs(dx * rx + dz * rz)
        if (lat < halfW) gap = Math.min(gap, along - 2.4)
      }
      for (let j = 0; j < cars.length; j++) {
        if (j === i || (cars[j].police ? !cars[j].on : j >= limit)) continue
        consider(cars[j].x, cars[j].z, 2.0, 24)
      }
      consider(rt.vehiclePos.x, rt.vehiclePos.z, 2.0, 24)
      if (!st.inVehicle) consider(rt.playerPos.x, rt.playerPos.z, 1.3, 14)
      for (const p of pedSpots) if (p.active) consider(p.x, p.z, 1.4, 12)
      if (c.stopped > 7) gap = 1e9 // do not deadlock forever

      // ---- intersection logic ---------------------------------------------------------------
      const cx = c.ia * CELL
      const cz = c.ib * CELL
      const toCenter = (cx - c.x) * c.fx + (cz - c.z) * c.fz // >0 while approaching
      if (!c.turn) {
        const chase = c.police && st.wanted > 0
        if (!c.maneuver && toCenter < 26) c.maneuver = chooseManeuver(c, chase ? { x: px, z: pz } : undefined)
        const axis = c.fx !== 0 ? 'x' : 'z'
        if (!c.passed && toCenter > 0) {
          const distStop = toCenter - STOP_DIST
          const color = lightState(axis, c.ia, c.ib)
          const mustStop = !(c.police && st.wanted > 0) && (color === 'red' || (color === 'yellow' && distStop > 5))
          if (mustStop && distStop > -0.5) gap = Math.min(gap, Math.max(0, distStop))
          if (toCenter <= STOP_DIST) c.passed = !mustStop || distStop <= -0.5
        }
        if (!c.turn && c.passed && c.maneuver && c.maneuver !== 'straight' && toCenter <= 8.2 && toCenter > 0) beginTurn(c)
        if (!c.turn && c.passed && toCenter < -9) {
          // straight through: head for the next intersection
          c.ia += c.fx
          c.ib += c.fz
          c.passed = false
          c.maneuver = null
        }
      }

      // ---- speed ------------------------------------------------------------------------------
      const vtop = c.police && st.wanted > 0 ? 15 + st.wanted * 2 : c.vmax
      let target = (c.turn ? (c.police ? 7 : 5) : vtop) * (1 - 0.28 * st.wetness * (c.police ? 0.4 : 1))
      if (gap < 1e8) target = Math.min(target, Math.max(0, (gap - 1.5) * 0.9))
      c.braking = c.speed > target + 0.5 || target < 0.3
      c.speed += THREE.MathUtils.clamp(target - c.speed, -9 * dt, 4 * dt)
      c.stopped = c.speed < 0.3 ? c.stopped + dt : 0

      // ---- move ------------------------------------------------------------------------------
      if (c.turn) {
        const T = c.turn
        T.t = Math.min(1, T.t + (c.speed * dt) / T.len)
        const u = T.t
        const a = (1 - u) * (1 - u)
        const b = 2 * (1 - u) * u
        const d = u * u
        const nx = a * T.p0.x + b * T.p1.x + d * T.p2.x
        const nz = a * T.p0.y + b * T.p1.y + d * T.p2.y
        const tx = 2 * (1 - u) * (T.p1.x - T.p0.x) + 2 * u * (T.p2.x - T.p1.x)
        const tz = 2 * (1 - u) * (T.p1.y - T.p0.y) + 2 * u * (T.p2.y - T.p1.y)
        const tl = Math.hypot(tx, tz) || 1
        c.x = nx
        c.z = nz
        c.fx = tx / tl
        c.fz = tz / tl
        if (u >= 1) {
          c.fx = Math.round(T.nf.x)
          c.fz = Math.round(T.nf.y)
          c.ia += c.fx
          c.ib += c.fz
          c.turn = null
          c.passed = false
          c.maneuver = null
        }
      } else {
        c.x += c.fx * c.speed * dt
        c.z += c.fz * c.speed * dt
      }

      // ---- apply -------------------------------------------------------------------------------
      const yaw = Math.atan2(c.fx, c.fz)
      const body = bodies.current[i]
      if (body) {
        body.setNextKinematicTranslation({ x: c.x, y: 0.55, z: c.z })
        const h = yaw / 2
        body.setNextKinematicRotation({ x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) })
      }
      brakeMat[i].color.set(c.braking ? '#ff2a2a' : '#5a0f0f')
      headMat[i].color.set(night > 0.4 ? '#fff2b8' : '#555')
    }
    updateWanted(dt, cars.slice(MAX_CARS), px, pz)
  })

  return (
    <>
      {cars.map((c, i) => (
        <RigidBody
          key={i}
          ref={(b) => {
            bodies.current[i] = b
          }}
          type="kinematicPosition"
          colliders={false}
          position={[c.x, 0.55, c.z]}
        >
          <CuboidCollider args={[0.9, 0.55, 2.1]} position={[0, 0.2, 0]} />
          <group
            ref={(g) => {
              groups.current[i] = g
            }}
          >
            <mesh position={[0, 0.25, 0]} castShadow={quality === 'high'}>
              <boxGeometry args={[1.8, 0.65, 4.2]} />
              <meshStandardMaterial color={c.color} roughness={0.4} metalness={0.4} />
            </mesh>
            <mesh position={[0, 0.82, -0.2]} castShadow={quality === 'high'}>
              <boxGeometry args={[1.6, 0.55, 2.2]} />
              <meshStandardMaterial color="#15181d" roughness={0.2} metalness={0.6} />
            </mesh>
            {[-1, 1].map((sx) =>
              [-1.3, 1.3].map((sz) => (
                <mesh key={sx + '_' + sz} position={[sx * 0.9, -0.15, sz]} rotation-z={Math.PI / 2}>
                  <cylinderGeometry args={[0.36, 0.36, 0.26, 12]} />
                  <meshStandardMaterial color="#111" />
                </mesh>
              )),
            )}
            {[-0.6, 0.6].map((sx) => (
              <mesh key={'b' + sx} position={[sx, 0.3, -2.12]} material={brakeMat[i]}>
                <boxGeometry args={[0.45, 0.16, 0.06]} />
              </mesh>
            ))}
            {[-0.6, 0.6].map((sx) => (
              <mesh key={'h' + sx} position={[sx, 0.3, 2.12]} material={headMat[i]}>
                <boxGeometry args={[0.4, 0.16, 0.06]} />
              </mesh>
            ))}
            {c.police && (
              <>
                <mesh position={[0, 0.3, 0]}>
                  <boxGeometry args={[1.84, 0.2, 1.4]} />
                  <meshStandardMaterial color="#14171c" />
                </mesh>
                <mesh position={[-0.35, 1.18, -0.3]} material={barRed}>
                  <boxGeometry args={[0.5, 0.14, 0.3]} />
                </mesh>
                <mesh position={[0.35, 1.18, -0.3]} material={barBlue}>
                  <boxGeometry args={[0.5, 0.14, 0.3]} />
                </mesh>
              </>
            )}
          </group>
        </RigidBody>
      ))}
    </>
  )
}
