import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CELL } from '../city/layout'
import { CORNER, inBlocks, inRoads, lightState, pedSpots, redRemaining, RNG } from '../city/roadnet'
import { rt } from '../engine/runtime'
import { useGame } from '../store/game'
import { shops } from '../shops/shops'
import { pedInfos } from './pedData'
import type { PedInfo } from './pedData'
import { Person, animateWalk, newRig } from './Person'
import type { Rig } from './Person'
import { carPositions } from '../traffic/Traffic'
import { sfx } from '../engine/audio'
import { addWanted } from '../police/wanted'

const rnd = RNG(4242)
const LIMITS = { low: 18, medium: 32, high: 48 }
const MAX_PEDS = 48
const PED_VIS = { low: 60, medium: 95, high: 140 } as const
const NAMES = ['Ava', 'Mateo', 'Priya', 'Jonas', 'Lena', 'Omar', 'Chloe', 'Diego', 'Yuki', 'Sam', 'Nadia', 'Theo', 'Rosa', 'Kai', 'Mira', 'Ben', 'Zara', 'Luis', 'Ines', 'Finn']
const SKINS = ['#f3d3b5', '#e0ac82', '#c68642', '#8d5524', '#5c3a21']
const HAIRS = ['#1a1410', '#4a3020', '#8a5a2b', '#d9b36c', '#9aa0aa']
const TYPES: PedInfo['type'][] = ['local', 'jogger', 'shopper', 'tourist', 'worker']

interface Node {
  a: number
  b: number
  sx: number
  sz: number
}
const nodeOk = (n: Node) => inRoads(n.a) && inRoads(n.b) && inBlocks(n.a + (n.sx > 0 ? 0 : -1)) && inBlocks(n.b + (n.sz > 0 ? 0 : -1))
const nodePos = (n: Node) => ({ x: n.a * CELL + n.sx * CORNER, z: n.b * CELL + n.sz * CORNER })

function neighbours(n: Node): { to: Node; cross: boolean }[] {
  const out: { to: Node; cross: boolean }[] = []
  const alongX: Node = { a: n.a + (n.sx > 0 ? 1 : -1), b: n.b, sx: -n.sx, sz: n.sz }
  const alongZ: Node = { a: n.a, b: n.b + (n.sz > 0 ? 1 : -1), sx: n.sx, sz: -n.sz }
  const crossX: Node = { a: n.a, b: n.b, sx: -n.sx, sz: n.sz } // moves in x across the z-road
  const crossZ: Node = { a: n.a, b: n.b, sx: n.sx, sz: -n.sz } // moves in z across the x-road
  if (nodeOk(alongX)) out.push({ to: alongX, cross: false })
  if (nodeOk(alongZ)) out.push({ to: alongZ, cross: false })
  if (nodeOk(crossX)) out.push({ to: crossX, cross: true })
  if (nodeOk(crossZ)) out.push({ to: crossZ, cross: true })
  return out
}

type State = 'walk' | 'wait' | 'cross' | 'idle' | 'look' | 'toDoor' | 'inside' | 'down'

interface Ped {
  node: Node
  target: Node
  prev: Node | null
  cross: boolean
  x: number
  z: number
  tx: number
  tz: number
  heading: number
  state: State
  timer: number
  speed: number
  base: number
  phase: number
  fleeT: number
  cooldown: number
  shop: number
  skin: string
  shirt: string
  pants: string
  hair: string
  info: PedInfo
}

function makePed(i: number): Ped {
  for (let tries = 0; tries < 100; tries++) {
    const n: Node = {
      a: Math.floor(rnd() * 9) - 4,
      b: Math.floor(rnd() * 9) - 4,
      sx: rnd() < 0.5 ? -1 : 1,
      sz: rnd() < 0.5 ? -1 : 1,
    }
    if (!nodeOk(n)) continue
    const nb = neighbours(n).filter((q) => !q.cross)
    if (!nb.length) continue
    const pick = nb[Math.floor(rnd() * nb.length)]
    const u = rnd()
    const p0 = nodePos(n)
    const p1 = nodePos(pick.to)
    const type = TYPES[Math.floor(rnd() * TYPES.length)]
    const base = type === 'jogger' ? 3.3 : 1.2 + rnd() * 0.6
    return {
      node: n,
      target: pick.to,
      prev: n,
      cross: false,
      x: p0.x + (p1.x - p0.x) * u,
      z: p0.z + (p1.z - p0.z) * u,
      tx: p1.x,
      tz: p1.z,
      heading: Math.atan2(p1.x - p0.x, p1.z - p0.z),
      state: 'walk',
      timer: 0,
      speed: base,
      base,
      phase: rnd() * 6,
      fleeT: 0,
      cooldown: 0,
      shop: -1,
      skin: SKINS[Math.floor(rnd() * SKINS.length)],
      shirt: `hsl(${Math.floor(rnd() * 360)}, ${40 + Math.floor(rnd() * 40)}%, ${35 + Math.floor(rnd() * 30)}%)`,
      pants: ['#222a3a', '#3b3b3b', '#4a3b2a', '#1c2a44', '#555a66'][Math.floor(rnd() * 5)],
      hair: HAIRS[Math.floor(rnd() * HAIRS.length)],
      info: { x: p0.x, z: p0.z, name: NAMES[(i * 7) % NAMES.length], type, talkUntil: 0, active: true },
    }
  }
  throw new Error('no ped spawn')
}

function nearestNodeOfBlock(shopIdx: number, x: number, z: number): Node {
  const s = shops[shopIdx]
  const bi = s.blockIndex
  // blocks array order: i outer loop, j inner loop over [-4,3]
  const i = Math.floor(bi / 8) - 4
  const j = (bi % 8) - 4
  const cand: Node[] = [
    { a: i, b: j, sx: 1, sz: 1 },
    { a: i + 1, b: j, sx: -1, sz: 1 },
    { a: i, b: j + 1, sx: 1, sz: -1 },
    { a: i + 1, b: j + 1, sx: -1, sz: -1 },
  ]
  let best = cand[0]
  let bd = 1e9
  for (const c of cand) {
    const p = nodePos(c)
    const d = (p.x - x) ** 2 + (p.z - z) ** 2
    if (d < bd) {
      bd = d
      best = c
    }
  }
  return best
}

function chooseNext(p: Ped) {
  const nb = neighbours(p.node)
  let opts = nb.filter((o) => !(p.prev && o.to.a === p.prev.a && o.to.b === p.prev.b && o.to.sx === p.prev.sx && o.to.sz === p.prev.sz))
  if (!opts.length) opts = nb
  const crossing = opts.filter((o) => o.cross)
  const walking = opts.filter((o) => !o.cross)
  let pick = opts[0]
  if (crossing.length && (rnd() < 0.4 || !walking.length)) pick = crossing[Math.floor(rnd() * crossing.length)]
  else pick = walking[Math.floor(rnd() * walking.length)] ?? opts[0]
  p.prev = p.node
  p.target = pick.to
  p.cross = pick.cross
  const t = nodePos(pick.to)
  p.tx = t.x
  p.tz = t.z
  p.state = pick.cross ? 'wait' : 'walk'
}

export default function Peds() {
  const quality = useGame((s) => s.quality)
  const peds = useMemo(() => {
    pedInfos.length = 0
    pedSpots.length = 0
    return Array.from({ length: MAX_PEDS }, (_, i) => {
      const p = makePed(i)
      pedInfos.push(p.info)
      pedSpots.push({ x: p.x, z: p.z, active: false })
      return p
    })
  }, [])
  const rigs = useMemo<Rig[]>(() => Array.from({ length: MAX_PEDS }, newRig), [])
  const limit = LIMITS[quality]
  const hornSeen = useRef(-10)
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__peds = peds

  useEffect(() => {
    peds.forEach((p, i) => rigs[i].root?.position.set(p.x, 0, p.z))
  }, [peds, rigs])

  useFrame((_, rawDt) => {
    const st = useGame.getState()
    if (st.phase !== 'playing') return
    const dt = Math.min(rawDt, 0.05)
    const now = performance.now()
    const player = rt.playerPos
    const veh = rt.vehiclePos
    const horn = rt.hornTime !== hornSeen.current && rt.simTime - rt.hornTime < 0.2
    if (horn) hornSeen.current = rt.hornTime

    for (let i = 0; i < peds.length; i++) {
      const p = peds[i]
      const rig = rigs[i]
      const active = i < limit
      p.info.active = active && p.state !== 'inside'
      const spot = pedSpots[i]
      if (!active || !rig.root) {
        if (rig.root) rig.root.visible = false
        spot.active = false
        continue
      }
      p.cooldown -= dt
      if (!nodeOk(p.node) || !nodeOk(p.target)) {
        const info = p.info
        const fresh = makePed(i)
        Object.assign(p, fresh)
        p.info = info
        info.x = p.x
        info.z = p.z
        info.type = fresh.info.type
      }
      let moving = false
      let speedNow = 0

      // ---- reactions ------------------------------------------------------------------------
      const dPlayer = Math.hypot(p.x - player.x, p.z - player.z)
      const dVeh = Math.hypot(p.x - veh.x, p.z - veh.z)
      if (p.state !== 'down' && p.state !== 'inside') {
        if (st.inVehicle || rt.vehicleSpeed > 4) {
          if (dVeh < 1.9 && rt.vehicleSpeed > 4) {
            p.state = 'down'
            p.timer = 6
            sfx('hit')
            addWanted(1, 'ped')
          }
        }
        if (horn && Math.hypot(p.x - veh.x, p.z - veh.z) < 25) p.fleeT = 3
        for (const c of carPositions) {
          if (!c.act) continue
          if (c.speed > 3 && Math.abs(c.x - p.x) < 2 && Math.abs(c.z - p.z) < 2) {
            p.state = 'down'
            p.timer = 6
            break
          }
        }
      }
      if (p.info.talkUntil > now && p.state !== 'down' && p.state !== 'inside') {
        p.heading = THREE.MathUtils.lerp(p.heading, Math.atan2(player.x - p.x, player.z - p.z), 0.15)
        animateWalk(rig, 0, 0)
        spot.active = false
        rig.root.position.set(p.x, 0, p.z)
        rig.root.rotation.y = p.heading
        continue
      }

      switch (p.state) {
        case 'walk':
        case 'cross':
        case 'toDoor': {
          const dx = p.tx - p.x
          const dz = p.tz - p.z
          const d = Math.hypot(dx, dz)
          // a person on foot notices the player nearby and looks over briefly
          if (p.state === 'walk' && dPlayer < 3.5 && p.cooldown <= 0 && !st.inVehicle && rnd() < 0.02) {
            p.state = 'look'
            p.timer = 1.8
            p.cooldown = 9
            break
          }
          const flee = p.fleeT > 0 ? 2.3 : 1
          speedNow = (p.state === 'cross' ? Math.max(p.base, 1.7) : p.base) * flee
          const step = speedNow * dt
          if (d <= step) {
            p.x = p.tx
            p.z = p.tz
            if (p.state === 'toDoor') {
              p.state = 'inside'
              p.timer = 8 + rnd() * 8
              break
            }
            p.node = p.target
            if (p.state === 'cross') spot.active = false
            // at a node: sometimes stop, sometimes pop into a shop on this block
            const r = rnd()
            if (r < 0.12) {
              p.state = 'idle'
              p.timer = 3 + rnd() * 4
            } else {
              chooseNext(p)
              const bi = (p.node.a + (p.node.sx > 0 ? 0 : -1) + 4) * 8 + (p.node.b + (p.node.sz > 0 ? 0 : -1) + 4)
              const si = shops.findIndex((s) => s.blockIndex === bi)
              if (!p.cross && si >= 0 && r > 0.88) {
                p.shop = si
                p.tx = shops[si].door.x
                p.tz = shops[si].door.z
                p.state = 'toDoor'
              }
            }
          } else {
            p.x += (dx / d) * step
            p.z += (dz / d) * step
            p.heading = THREE.MathUtils.lerp(p.heading, Math.atan2(dx, dz), 1 - Math.exp(-10 * dt))
            moving = true
          }
          spot.active = p.state === 'cross'
          break
        }
        case 'wait': {
          // stand at the kerb until the traffic crossing our path is stopped for long enough
          const moveX = Math.abs(p.tx - p.x) > Math.abs(p.tz - p.z)
          const axis = moveX ? 'z' : 'x'
          if (lightState(axis, p.node.a, p.node.b) === 'red' && redRemaining(axis, p.node.a, p.node.b) > 9.5) {
            p.state = 'cross'
          }
          p.heading = THREE.MathUtils.lerp(p.heading, Math.atan2(p.tx - p.x, p.tz - p.z), 0.1)
          break
        }
        case 'idle':
          p.timer -= dt
          if (p.timer <= 0) chooseNext(p)
          break
        case 'look':
          p.timer -= dt
          p.heading = THREE.MathUtils.lerp(p.heading, Math.atan2(player.x - p.x, player.z - p.z), 0.15)
          if (p.timer <= 0) {
            p.state = 'walk'
          }
          break
        case 'inside':
          p.timer -= dt
          if (p.timer <= 0) {
            const s = shops[p.shop]
            p.x = s.out.x
            p.z = s.out.z
            p.node = nearestNodeOfBlock(p.shop, p.x, p.z)
            p.prev = null
            p.cross = false
            p.state = 'walk'
            const tp = nodePos(p.node)
            p.target = p.node
            p.tx = tp.x
            p.tz = tp.z
          }
          break
        case 'down':
          p.timer -= dt
          if (p.timer <= 0) p.state = p.cross ? 'cross' : 'walk'
          spot.active = false
          break
      }
      p.fleeT = Math.max(0, p.fleeT - dt)

      // ---- animate ------------------------------------------------------------------------------
      p.phase += speedNow * dt * 4.2
      animateWalk(rig, p.phase, moving ? Math.min(1, speedNow / 1.4) : 0)
      const vis = PED_VIS[quality]
      rig.root.visible = p.state !== 'inside' && Math.abs(p.x - player.x) < vis && Math.abs(p.z - player.z) < vis
      if (rig.root.visible) {
        // level of detail: past ~40 m a person is a few pixels tall, so skip the arms and hair (3 of 7 draw calls)
        const near = (p.x - player.x) ** 2 + (p.z - player.z) ** 2 < 40 * 40
        if (rig.root.userData.near !== near) {
          rig.root.userData.near = near
          if (rig.armL) rig.armL.visible = near
          if (rig.armR) rig.armR.visible = near
          const hair = rig.body?.children[2]
          if (hair) hair.visible = near
        }
      }
      rig.root.position.set(p.x, p.state === 'down' ? 0.12 : 0, p.z)
      rig.root.rotation.set(p.state === 'down' ? -Math.PI / 2 : 0, p.heading, 0)
      p.info.x = p.x
      p.info.z = p.z
      spot.x = p.x
      spot.z = p.z
    }
  })

  return (
    <>
      {peds.map((p, i) => (
        <Person key={i} rig={rigs[i]} skin={p.skin} shirt={p.shirt} pants={p.pants} hair={p.hair} shadows={quality === 'high'} />
      ))}
    </>
  )
}
