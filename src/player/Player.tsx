import { Suspense, useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, useRapier } from '@react-three/rapier'
import type { RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import CharacterModel from './CharacterModel'
import type { AnimState } from './CharacterModel'
import { consumePressed, rt } from '../engine/runtime'
import { useGame } from '../store/game'
import { SPAWN } from '../city/layout'

const WALK = 3.6
const SPRINT = 8.5
const CROUCH = 1.6
const JUMP_V = 7
const CAPSULE_HALF = 0.5
const CAPSULE_R = 0.35
const FOOT_OFFSET = CAPSULE_HALF + CAPSULE_R // capsule center -> feet

function angleLerp(a: number, b: number, t: number) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

export default function Player() {
  const body = useRef<RapierRigidBody>(null)
  const visual = useRef<THREE.Group>(null)
  const { world, rapier } = useRapier()
  const anim = useRef<AnimState>({ speed: 0, sprint: false, crouch: false, grounded: true, seated: false })
  const yaw = useRef(0)
  const sprintLock = useRef(false)
  const wasInVehicle = useRef(false)
  const jumpCooldown = useRef(0)

  useEffect(() => {
    rt.playerBody = body.current
    return () => {
      rt.playerBody = null
    }
  }, [])

  useFrame((_, rawDt) => {
    const b = body.current
    if (!b) return
    const st = useGame.getState()
    if (st.phase !== 'playing') return
    const dt = Math.min(rawDt, 0.05)

    // ---- vehicle enter / exit -------------------------------------------------
    const dxv = rt.vehiclePos.x - rt.playerPos.x
    const dzv = rt.vehiclePos.z - rt.playerPos.z
    const near = !st.inVehicle && dxv * dxv + dzv * dzv < 5.2 * 5.2
    if (near !== st.nearVehicle) st.set({ nearVehicle: near })

    if (!st.inVehicle && near && consumePressed('KeyE')) {
      st.set({ inVehicle: true, nearVehicle: false })
      b.setEnabled(false)
    } else if (st.inVehicle && (consumePressed('KeyF') || (!rt.driverInteract && consumePressed('KeyE'))) && rt.vehicleSpeed < 9) {
      const s = Math.sin(rt.vehicleYaw)
      const c = Math.cos(rt.vehicleYaw)
      // exit on the driver's (left) side of the car; left = +x in chassis space
      const ox = c * 2.4
      const oz = -s * 2.4
      b.setEnabled(true)
      b.setTranslation({ x: rt.vehiclePos.x + ox, y: rt.vehiclePos.y + 1.2, z: rt.vehiclePos.z + oz }, true)
      b.setLinvel({ x: 0, y: 0, z: 0 }, true)
      st.set({ inVehicle: false })
    }
    if (st.inVehicle) {
      wasInVehicle.current = true
      rt.playerPos.copy(rt.vehiclePos)
      anim.current.seated = true
      if (visual.current) visual.current.visible = false
      return
    }
    if (wasInVehicle.current) {
      wasInVehicle.current = false
      anim.current.seated = false
      if (visual.current) visual.current.visible = true
    }

    // ---- ground check -------------------------------------------------------------
    const t = b.translation()
    const ray = new rapier.Ray({ x: t.x, y: t.y, z: t.z }, { x: 0, y: -1, z: 0 })
    const hit = world.castRay(ray, FOOT_OFFSET + 0.2, true, undefined, undefined, undefined, b)
    const lv = b.linvel()
    const grounded = !!hit && lv.y < 0.5
    jumpCooldown.current -= dt

    // ---- movement -------------------------------------------------------------------
    const k = rt.keys
    let ix = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0)
    let iz = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0)
    let analog = 1
    if (rt.stick.active) {
      ix = rt.stick.x
      iz = rt.stick.y
      analog = Math.min(1, Math.hypot(ix, iz))
    }
    const il = Math.hypot(ix, iz)
    if (il > 0) {
      ix /= il
      iz /= il
    }
    const sy = Math.sin(rt.camYaw)
    const cy = Math.cos(rt.camYaw)
    // forward = (-sin, -cos), right = (cos, -sin)
    const wx = ix * cy - iz * sy
    const wz = -ix * sy - iz * cy

    const crouch = !!k.KeyC
    const moving = il > 0
    let stamina = st.stamina
    const wantSprint = !!(k.ShiftLeft || k.ShiftRight) && moving && !crouch
    if (stamina <= 0) sprintLock.current = true
    if (stamina > 20) sprintLock.current = false
    const sprint = wantSprint && !sprintLock.current
    stamina = sprint ? Math.max(0, stamina - 18 * dt) : Math.min(100, stamina + (moving ? 8 : 16) * dt)
    if (Math.abs(stamina - st.stamina) > 0.2) st.set({ stamina })

    const target = crouch ? CROUCH : sprint ? SPRINT : WALK
    const speed = moving ? target * (rt.stick.active ? Math.max(0.4, analog) : 1) : 0
    const accel = grounded ? 14 : 4
    const vx = THREE.MathUtils.damp(lv.x, wx * speed, accel, dt)
    const vz = THREE.MathUtils.damp(lv.z, wz * speed, accel, dt)
    let vy = lv.y
    if (grounded && k.Space && !crouch && jumpCooldown.current <= 0) {
      vy = JUMP_V
      jumpCooldown.current = 0.35
    }
    b.setLinvel({ x: vx, y: vy, z: vz }, true)

    if (moving) {
      yaw.current = angleLerp(yaw.current, Math.atan2(wx, wz), 1 - Math.exp(-14 * dt))
    }
    rt.playerYaw = yaw.current
    if (visual.current) {
      visual.current.rotation.y = yaw.current
      visual.current.position.y = -FOOT_OFFSET
    }

    const a = anim.current
    a.speed = Math.hypot(vx, vz)
    a.sprint = sprint
    a.crouch = crouch
    a.grounded = grounded || jumpCooldown.current > 0.2 ? grounded : false
    a.seated = false
    rt.walkSpeed = a.speed
    rt.grounded = grounded

    rt.playerPos.set(t.x, t.y - FOOT_OFFSET, t.z)
  })

  return (
    <RigidBody
      ref={body}
      colliders={false}
      position={[SPAWN.player.x, FOOT_OFFSET + 0.3, SPAWN.player.z]}
      enabledRotations={[false, false, false]}
      mass={80}
      friction={0}
      linearDamping={0}
      ccd
    >
      <CapsuleCollider args={[CAPSULE_HALF, CAPSULE_R]} friction={0} />
      <group ref={visual}>
        <Suspense fallback={null}>
          <CharacterModel state={anim} />
        </Suspense>
      </group>
    </RigidBody>
  )
}
