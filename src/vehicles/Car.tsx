import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { CuboidCollider, RigidBody, useRapier } from '@react-three/rapier'
import type { RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { consumePressed, rt } from '../engine/runtime'
import { useGame } from '../store/game'
import { nightFactor } from '../city/City'
import { SPAWN } from '../city/layout'
import { buildProcedural, spec as specOf } from './specs'
import type { GlbConfig, Prepared, VehicleSpec } from './specs'
import { reportCrash } from '../police/wanted'
import Dashboard from './Dashboard'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export const glbUrl = (cfg: GlbConfig) => import.meta.env.BASE_URL + 'models/' + cfg.file
// The wheel mounts stay where they were (SUSP_MOUNT); a longer rest length lets the springs hold the body about 9 cm higher
const SUSP_MOUNT = 0.28
const SUSP_REST = 0.37

/**
 * The Sketchfab car is ~180 separate meshes. Everything that is not a wheel is baked into one mesh per
 * material (converting the meshopt-quantised attributes to floats first), cutting draw calls ~3x.
 */
function mergeStatic(holder: THREE.Object3D, root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const groups = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>()
  const done: THREE.Mesh[] = []
  holder.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || Array.isArray(m.material)) return
    const g = m.geometry
    const pos = g.getAttribute('position')
    if (!pos) return
    const fg = new THREE.BufferGeometry()
    const copy = (name: string, size: number) => {
      const a = g.getAttribute(name)
      const arr = new Float32Array(pos.count * size)
      if (a) {
        for (let i = 0; i < pos.count; i++) {
          arr[i * size] = a.getX(i)
          if (size > 1) arr[i * size + 1] = a.getY(i)
          if (size > 2) arr[i * size + 2] = a.getZ(i)
        }
      }
      fg.setAttribute(name, new THREE.BufferAttribute(arr, size))
      return !!a
    }
    copy('position', 3)
    const hasNormal = copy('normal', 3)
    copy('uv', 2)
    const idx = g.index ? Array.from(g.index.array as ArrayLike<number>) : Array.from({ length: pos.count }, (_, i) => i)
    fg.setIndex(idx)
    if (!hasNormal) fg.computeVertexNormals()
    m.updateWorldMatrix(true, false)
    fg.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld))
    const mat = m.material as THREE.Material
    const e = groups.get(mat.uuid) ?? { mat, geos: [] }
    e.geos.push(fg)
    groups.set(mat.uuid, e)
    done.push(m)
  })
  for (const m of done) m.removeFromParent()
  let merged = 0
  for (const { mat, geos } of groups.values()) {
    const g = geos.length === 1 ? geos[0] : mergeGeometries(geos, false)
    if (!g) continue
    const mesh = new THREE.Mesh(g, mat)
    mesh.castShadow = true
    root.add(mesh)
    merged++
  }
  return { before: done.length, after: merged }
}

/** Normalizes a car model: front -> +Z, real-world length, wheels on steer/spin pivots. */
export function prepareGLB(source: THREE.Object3D, cfg: GlbConfig): Prepared {
  const model = source.clone(true)
  const holder = new THREE.Group()
  holder.add(model)
  holder.updateMatrixWorld(true)

  const find = (n: string) => {
    let f: THREE.Object3D | undefined
    model.traverse((o) => {
      if (o.name === n) f = o
    })
    return f
  }
  const center = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3())
  const nodes = ['WHEEL_LF', 'WHEEL_RF', 'WHEEL_LR', 'WHEEL_RR'].map(find) as THREE.Object3D[]
  const [lf, rf, lr, rr] = nodes.map(center)
  const fwd = lf.clone().add(rf).sub(lr).sub(rr)
  fwd.y = 0
  fwd.normalize()
  holder.rotation.y = -Math.atan2(fwd.x, fwd.z)
  holder.updateMatrixWorld(true)

  let box = new THREE.Box3().setFromObject(holder)
  holder.scale.setScalar(cfg.length / (box.max.z - box.min.z))
  holder.updateMatrixWorld(true)
  box = new THREE.Box3().setFromObject(holder)

  const wc = nodes.map(center)
  const wbox = new THREE.Box3().setFromObject(nodes[0])
  const radius = (wbox.max.y - wbox.min.y) / 2
  const wheelCyWorld = wc.reduce((a, c) => a + c.y, 0) / 4
  const yo = wheelCyWorld + 0.25

  const root = new THREE.Group()
  holder.position.set(-(box.min.x + box.max.x) / 2, -yo, -(box.min.z + box.max.z) / 2)
  root.add(holder)
  root.updateMatrixWorld(true)

  const wheels: Prepared['wheels'] = []
  nodes.forEach((n, i) => {
    const c = center(n)
    let wr: number | undefined
    if (cfg.radiusFromLength) {
      // the tyre's profile length gives its true radius; the axle sits one radius above the lowest point
      const wb = new THREE.Box3().setFromObject(n)
      wr = (wb.max.z - wb.min.z) / 2
      c.y = wb.min.y + wr
    }
    const hub = new THREE.Group()
    hub.position.copy(c)
    const steer = new THREE.Group()
    const spin = new THREE.Group()
    hub.add(steer)
    steer.add(spin)
    root.add(hub)
    root.updateMatrixWorld(true)
    spin.attach(n)
    wheels.push({ hub, steer, spin, front: i < 2, cx: c.x, cy: c.y, cz: c.z, r: wr })
  })

  if (cfg.sport) {
    // the model's glass is baked into one double-sided shell; culling its back faces lets the driver see out through the windows
    root.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh && !Array.isArray(m.material) && m.material.side !== THREE.FrontSide) {
        m.material.side = THREE.FrontSide
        m.material.needsUpdate = true
      }
    })
  }
  const stats = mergeStatic(holder, root)
  if (import.meta.env.DEV) console.info('[car] merged static meshes', stats)
  const b2 = new THREE.Box3().setFromObject(root)
  const wheelCy = wheelCyWorld - yo
  return {
    root,
    wheels,
    radius,
    halfW: (b2.max.x - b2.min.x) / 2,
    halfL: (b2.max.z - b2.min.z) / 2,
    bottom: wheelCy - radius + 0.28,
    top: b2.max.y - yo,
    wheelCy,
    paint: [],
    lightY: wheelCy - radius + 0.28 + 0.62,
    cockpit: (() => {
      const ground = wheelCy - radius
      const belt = ground + cfg.belt
      return { eye: [cfg.eye[0], belt + cfg.eye[1], cfg.eye[2]] as [number, number, number], belt, zFront: cfg.zFront, zBack: cfg.zBack, sport: cfg.sport }
    })(),
  }
}

/** Soft dark blob drawn under a vehicle when real shadows are off (Low quality), so it still looks planted on the road. */
let blobMat: THREE.MeshBasicMaterial | null = null
function blobMaterial() {
  if (blobMat) return blobMat
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32)
  grad.addColorStop(0, 'rgba(0,0,0,0.75)')
  grad.addColorStop(0.6, 'rgba(0,0,0,0.4)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  blobMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true })
  return blobMat
}

function Vehicle({ prep, spec, damagePaint }: { prep: Prepared; spec: VehicleSpec; damagePaint: boolean }) {
  const quality = useGame((s) => s.quality)
  const body = useRef<RapierRigidBody>(null)
  const { world } = useRapier()
  const ctrl = useRef<ReturnType<typeof world.createVehicleController> | null>(null)
  const steer = useRef(0)
  const prevSpeed = useRef(0)
  const damageCooldown = useRef(0)
  const lightsRef = useRef({ head: false, left: false, right: false })
  const brakeMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#4a0c0c' }), [])
  const indMatL = useMemo(() => new THREE.MeshBasicMaterial({ color: '#5a3a00' }), [])
  const indMatR = useMemo(() => new THREE.MeshBasicMaterial({ color: '#5a3a00' }), [])
  const headMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#777' }), [])
  const spotL = useRef<THREE.SpotLight>(null)
  const spotR = useRef<THREE.SpotLight>(null)
  const targetL = useMemo(() => new THREE.Object3D(), [])
  const targetR = useMemo(() => new THREE.Object3D(), [])
  const paintBase = useMemo(() => prep.paint.map((m) => m.color.clone()), [prep])
  const massScale = spec.mass / 1400
  const nWheels = prep.wheels.length

  useEffect(() => {
    prep.root.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) m.castShadow = quality !== 'low'
    })
  }, [prep, quality])

  useEffect(() => {
    rt.cockpit = prep.cockpit ?? null
    rt.vehicleDims.l = prep.halfL * 0.96
    rt.vehicleDims.w = prep.halfW * 0.92
  }, [prep])

  useEffect(() => {
    const b = body.current
    if (!b) return
    rt.carBody = b
    const c = world.createVehicleController(b)
    ctrl.current = c
    for (const w of prep.wheels) {
      c.addWheel({ x: w.cx, y: w.cy + SUSP_MOUNT, z: w.cz }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, SUSP_REST + (spec.glb?.lift ?? 0), w.r ?? prep.radius)
    }
    for (let i = 0; i < nWheels; i++) {
      c.setWheelSuspensionStiffness(i, 38)
      c.setWheelSuspensionCompression(i, 2.4)
      c.setWheelSuspensionRelaxation(i, 3.2)
      c.setWheelMaxSuspensionTravel(i, 0.35)
      c.setWheelMaxSuspensionForce(i, 60000 * massScale)
      c.setWheelFrictionSlip(i, spec.grip)
      c.setWheelSideFrictionStiffness(i, 1.2)
    }
    return () => {
      world.removeVehicleController(c)
      ctrl.current = null
      rt.carBody = null
    }
  }, [world, prep, spec, nWheels, massScale])

  useFrame((_, rawDt) => {
    const b = body.current
    const c = ctrl.current
    if (!b || !c) return
    const st = useGame.getState()
    if (st.phase !== 'playing') return
    const dt = Math.min(rawDt, 0.05)

    const t = b.translation()
    const r = b.rotation()
    const q = new THREE.Quaternion(r.x, r.y, r.z, r.w)
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
    rt.vehiclePos.set(t.x, t.y, t.z)
    rt.vehicleQuat.copy(q)
    rt.steer = steer.current
    rt.vehicleYaw = Math.atan2(fwd.x, fwd.z)
    const lv = b.linvel()
    const forwardSpeed = lv.x * fwd.x + lv.y * fwd.y + lv.z * fwd.z
    const speed = Math.hypot(lv.x, lv.y, lv.z)
    rt.vehicleSpeed = speed

    const driving = st.inVehicle && st.vehicleHealth > 0
    const k = rt.keys
    let engine = 0
    let brake = 0
    let steerTarget = 0

    if (st.inVehicle && consumePressed('KeyR')) {
      b.setTranslation({ x: t.x, y: t.y + 1.2, z: t.z }, true)
      b.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(fwd.x, fwd.z)), true)
      b.setAngvel({ x: 0, y: 0, z: 0 }, true)
      b.setLinvel({ x: 0, y: 0, z: 0 }, true)
    }

    const wet = st.wetness
    if (rt.freezeCar) {
      brake = 1
    } else if (driving) {
      const throttle = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0)
      if (throttle > 0) {
        if (forwardSpeed < -1) brake = 1
        else engine = 1 - Math.max(0, forwardSpeed) / spec.maxSpeed
      } else if (throttle < 0) {
        if (forwardSpeed > 1) brake = 1
        else engine = -(1 - Math.max(0, -forwardSpeed) / spec.reverseMax)
      } else {
        brake = 0.08
      }
      if (k.Space) brake = Math.max(brake, 1)
      steerTarget = ((k.KeyA || k.ArrowLeft ? 1 : 0) - (k.KeyD || k.ArrowRight ? 1 : 0)) * spec.steer
      // touch joystick: analog steering with a small dead zone and a gentle curve
      if (rt.stick.active && Math.abs(rt.stick.x) > 0.1) steerTarget = -Math.sign(rt.stick.x) * Math.min(1, Math.abs(rt.stick.x) ** 1.25 * 1.1) * spec.steer
    } else {
      brake = st.inVehicle ? 0.5 : 0.35
    }

    const maxSteer = 1 / (1 + Math.abs(forwardSpeed) * (prep.isBike ? 0.1 : 0.07))
    steer.current = THREE.MathUtils.damp(steer.current, steerTarget * maxSteer, 7, dt)

    const grip = spec.grip * (1 - 0.32 * wet)
    for (let i = 0; i < nWheels; i++) {
      c.setWheelEngineForce(i, (engine * spec.engine) / (nWheels === 4 ? 1 : 1))
      c.setWheelBrake(i, brake * (i < 2 ? 3800 : 3000) * massScale)
      c.setWheelFrictionSlip(i, grip)
      if (i < 2) c.setWheelSteering(i, steer.current)
    }
    c.updateVehicle(dt)

    // motorcycle: keep it upright with a restoring torque, lean into corners visually
    if (prep.isBike) {
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q)
      const corr = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 1, 0))
      const av = b.angvel()
      const roll = new THREE.Vector3(av.x, av.y, av.z).dot(fwd)
      const m = spec.mass
      const kp = ((window as unknown as { __bikeK?: number }).__bikeK ?? 40) * m * dt
      const kd = ((window as unknown as { __bikeD?: number }).__bikeD ?? 4) * m * dt
      // restoring torque about the forward axis only (so steering yaw is untouched)
      const rollAxis = fwd.clone().multiplyScalar(corr.dot(fwd) * kp - roll * kd)
      b.applyTorqueImpulse(rollAxis, true)
      prep.root.rotation.z = THREE.MathUtils.damp(prep.root.rotation.z, -steer.current * Math.min(1, Math.abs(forwardSpeed) / 12) * 0.9, 6, dt)
    }

    for (let i = 0; i < nWheels; i++) {
      const w = prep.wheels[i]
      const len = c.wheelSuspensionLength(i) ?? SUSP_REST
      w.hub.position.y = w.cy + SUSP_MOUNT - len
      if (w.front) w.steer.rotation.y = steer.current
      w.spin.rotation.x = c.wheelRotation(i) ?? 0
    }

    // lights
    if (st.inVehicle) {
      if (consumePressed('KeyL')) lightsRef.current.head = !lightsRef.current.head
      if (consumePressed('KeyZ')) lightsRef.current.left = !lightsRef.current.left
      if (consumePressed('KeyX')) lightsRef.current.right = !lightsRef.current.right
    }
    const night = nightFactor(st.hour)
    const headOn = lightsRef.current.head || night > 0.35 || wet > 0.6
    const braking = brake > 0.5 || (engine < 0 && forwardSpeed < 1)
    brakeMat.color.set(braking ? '#ff2a2a' : '#4a0c0c')
    headMat.color.set(headOn ? '#fff4c2' : '#777777')
    const blink = Math.floor(performance.now() / 380) % 2 === 0
    indMatL.color.set(lightsRef.current.left && blink ? '#ffb000' : '#5a3a00')
    indMatR.color.set(lightsRef.current.right && blink ? '#ffb000' : '#5a3a00')
    for (const sp of [spotL.current, spotR.current]) {
      if (!sp) continue
      sp.intensity = headOn ? 1400 : 0
      sp.visible = headOn // an off light still costs every lit pixel, so take it out of the lighting pass
    }

    // damage: sudden deceleration hurts, wrecks go grey
    damageCooldown.current -= dt
    const drop = prevSpeed.current - speed
    if (drop > 4 && damageCooldown.current <= 0 && st.vehicleHealth > 0) {
      damageCooldown.current = 0.25
      st.set({ vehicleHealth: Math.max(0, st.vehicleHealth - Math.round(drop * 1.8 * (1400 / spec.mass) ** 0.4)) })
      reportCrash(drop)
    }
    prevSpeed.current = speed
    if (damagePaint) {
      const d = 1 - useGame.getState().vehicleHealth / 100
      prep.paint.forEach((m, i) => m.color.copy(paintBase[i]).lerp(new THREE.Color('#3a3a3a'), d * 0.7))
    }

    if (st.inVehicle) {
      const kmh = Math.round(Math.abs(forwardSpeed) * 3.6)
      if (kmh !== st.speedKmh) st.set({ speedKmh: kmh })
    } else if (st.speedKmh !== 0) st.set({ speedKmh: 0 })
  })

  const halfW = prep.halfW * 0.92
  const bottom = prep.bottom
  const hh = (prep.top - bottom) / 2
  // spawn: garage exit / mission teleports override, otherwise the starting spot
  const sp = rt.vehicleSpawn ?? { x: SPAWN.car.x, z: SPAWN.car.z, yaw: Math.PI / 2 }
  rt.vehicleSpawn = null
  const lightY = prep.lightY
  const lamp = prep.isBike ? 0.15 : 0.62
  return (
    <RigidBody
      ref={body}
      colliders={false}
      position={[sp.x, -prep.wheelCy + prep.radius + 0.35, sp.z]}
      rotation={[0, sp.yaw, 0]}
      linearDamping={0.05}
      angularDamping={prep.isBike ? 1.2 : 0.6}
      canSleep={false}
      ccd
    >
      <CuboidCollider args={[halfW, hh, prep.halfL * 0.96]} position={[0, bottom + hh, 0]} mass={spec.mass * 0.64} />
      <CuboidCollider args={[Math.min(0.5, halfW), 0.1, 0.9]} position={[0, bottom + 0.1, 0]} mass={spec.mass * 0.36} />
      <primitive object={prep.root} />
      {quality === 'low' && !prep.isBike && (
        <mesh position={[0, prep.wheelCy - prep.radius + 0.04, 0]} rotation-x={-Math.PI / 2} material={blobMaterial()} renderOrder={1}>
          <planeGeometry args={[prep.halfW * 2.6, prep.halfL * 2.5]} />
        </mesh>
      )}
      <Dashboard prep={prep} />
      <group>
        {[-lamp, lamp].map((x) => (
          <mesh key={'b' + x} position={[x, lightY, -prep.halfL * 0.985]} material={brakeMat}>
            <boxGeometry args={[prep.isBike ? 0.12 : 0.5, 0.14, 0.06]} />
          </mesh>
        ))}
        {[-lamp, lamp].map((x) => (
          <mesh key={'h' + x} position={[x, lightY, prep.halfL * 0.985]} material={headMat}>
            <boxGeometry args={[prep.isBike ? 0.12 : 0.4, 0.14, 0.06]} />
          </mesh>
        ))}
        {[-1, 1].map((sz) =>
          [-1, 1].map((sx) => (
            <mesh key={'i' + sx + sz} position={[sx * (halfW + 0.01), lightY, sz * (prep.halfL * 0.9)]} material={sx > 0 ? indMatL : indMatR}>
              <boxGeometry args={[0.06, 0.12, 0.25]} />
            </mesh>
          )),
        )}
        <primitive object={targetL} position={[-0.7, -0.4, 30]} />
        <primitive object={targetR} position={[0.7, -0.4, 30]} />
        <spotLight ref={spotL} visible={false} position={[-0.66 * (prep.isBike ? 0.2 : 1), lightY + 0.03, prep.halfL]} angle={0.5} penumbra={0.6} distance={70} decay={1.6} color="#fff2c4" target={targetL} />
        <spotLight ref={spotR} visible={false} position={[0.66 * (prep.isBike ? 0.2 : 1), lightY + 0.03, prep.halfL]} angle={0.5} penumbra={0.6} distance={70} decay={1.6} color="#fff2c4" target={targetR} />
      </group>
    </RigidBody>
  )
}

function GlbVehicle({ spec, cfg }: { spec: VehicleSpec; cfg: GlbConfig }) {
  const gltf = useGLTF(glbUrl(cfg), false, true)
  const prep = useMemo(() => prepareGLB(gltf.scene, cfg), [gltf.scene, cfg])
  return <Vehicle prep={prep} spec={spec} damagePaint={false} />
}

function ProceduralVehicle({ spec, color }: { spec: VehicleSpec; color: string }) {
  const prep = useMemo(() => buildProcedural(spec.id, color)!, [spec, color])
  return <Vehicle prep={prep} spec={spec} damagePaint />
}

/** Smoke from a damaged engine. */
function Smoke() {
  const puffs = useRef<THREE.Mesh[]>([])
  const ages = useRef<number[]>(Array.from({ length: 14 }, (_, i) => i / 14))
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#555', transparent: true, opacity: 0.4, depthWrite: false, fog: true }), [])
  useFrame((_, dt) => {
    const st = useGame.getState()
    const hp = st.vehicleHealth
    const on = hp < 45 && st.phase === 'playing'
    const fx = Math.sin(rt.vehicleYaw)
    const fz = Math.cos(rt.vehicleYaw)
    puffs.current.forEach((m, i) => {
      if (!m) return
      m.visible = on
      if (!on) return
      ages.current[i] = (ages.current[i] + dt * (hp <= 0 ? 0.7 : 0.45)) % 1
      const a = ages.current[i]
      m.position.set(rt.vehiclePos.x + fx * 1.6 + Math.sin(i * 7 + a * 5) * 0.4, rt.vehiclePos.y + 0.7 + a * 2.6, rt.vehiclePos.z + fz * 1.6 + Math.cos(i * 5) * 0.3)
      m.scale.setScalar(0.3 + a * 1.1)
    })
    mat.opacity = hp <= 0 ? 0.65 : 0.4
    mat.color.set(hp <= 0 ? '#111' : '#666')
  })
  return (
    <>
      {Array.from({ length: 14 }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            if (m) puffs.current[i] = m
          }}
          material={mat}
          visible={false}
        >
          <sphereGeometry args={[1, 8, 6]} />
        </mesh>
      ))}
    </>
  )
}

export default function Car() {
  const id = useGame((s) => s.currentVehicle)
  const paint = useGame((s) => s.paint)
  const sp = specOf(id)
  const color = paint[id] ?? sp.defaultColor
  return (
    <>
      {sp.glb ? (
        <Suspense fallback={null}>
          <GlbVehicle key={sp.id} spec={sp} cfg={sp.glb} />
        </Suspense>
      ) : (
        <ProceduralVehicle key={id + color} spec={sp} color={color} />
      )}
      <Smoke />
    </>
  )
}

// start fetching the starter model and the saved vehicle's model at load, so the first mount does not wait on the network
for (const id of new Set(['subaru', useGame.getState().currentVehicle])) {
  const cfg = specOf(id).glb
  if (cfg) useGLTF.preload(glbUrl(cfg), false, true)
}
