import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { rt } from '../engine/runtime'
import { useGame } from '../store/game'
import { setRoadLimit } from './roadnet'
import { toast } from '../shops/ShopUI'

/** Edge of the starting district: the far side of the 7th road line (x or z = ±240). */
export const BOUND = 248
const SPAN = 345

export const outerUnlocked = (unlocks: string[], completed: string[]) => unlocks.includes('outer-districts') || completed.includes('delivery')

function signTexture() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#b3201f'
  g.fillRect(0, 0, 512, 128)
  g.fillStyle = '#fff'
  g.fillRect(0, 0, 512, 10)
  g.fillRect(0, 118, 512, 10)
  g.font = 'bold 44px "Segoe UI", Arial, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('DISTRICT CLOSED', 256, 56)
  g.font = '600 24px "Segoe UI", Arial, sans-serif'
  g.fillText('Complete "First Delivery" to open', 256, 98)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Barricades and invisible walls around the starting district until it is unlocked. */
export default function Districts() {
  const unlocks = useGame((s) => s.unlocks)
  const completed = useGame((s) => s.completed)
  const open = outerUnlocked(unlocks, completed)
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const tex = useMemo(() => signTexture(), [])
  const warned = useRef(0)

  useEffect(() => {
    setRoadLimit(open ? 4 : 3)
  }, [open])

  const blocks = useMemo(() => {
    const out: { x: number; z: number; rot: number; c: number }[] = []
    for (let s = -SPAN; s <= SPAN; s += 5) {
      const c = Math.round((s + SPAN) / 5) % 2
      out.push({ x: BOUND, z: s, rot: Math.PI / 2, c }, { x: -BOUND, z: s, rot: Math.PI / 2, c }, { x: s, z: BOUND, rot: 0, c }, { x: s, z: -BOUND, rot: 0, c })
    }
    return out
  }, [])

  useLayoutEffect(() => {
    if (!mesh.current) return
    const m = new THREE.Matrix4()
    const col = new THREE.Color()
    blocks.forEach((b, i) => {
      m.compose(new THREE.Vector3(b.x, 0.55, b.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.rot), new THREE.Vector3(4.6, 1.1, 0.5))
      mesh.current.setMatrixAt(i, m)
      mesh.current.setColorAt(i, col.set(b.c ? '#d9d9d9' : '#c0392b'))
    })
    mesh.current.instanceMatrix.needsUpdate = true
    mesh.current.instanceColor!.needsUpdate = true
  }, [blocks, open])

  useFrame(() => {
    if (open) return
    const st = useGame.getState()
    if (st.phase !== 'playing' || st.inShop) return
    const p = st.inVehicle ? rt.vehiclePos : rt.playerPos
    const edge = BOUND - Math.max(Math.abs(p.x), Math.abs(p.z))
    if (edge < 14 && performance.now() - warned.current > 6000) {
      warned.current = performance.now()
      toast('This district is closed. Finish "First Delivery" to open it.')
    }
  })

  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        {!open && (
          <>
            <CuboidCollider args={[SPAN, 4, 1]} position={[0, 4, BOUND + 0.5]} />
            <CuboidCollider args={[SPAN, 4, 1]} position={[0, 4, -BOUND - 0.5]} />
            <CuboidCollider args={[1, 4, SPAN]} position={[BOUND + 0.5, 4, 0]} />
            <CuboidCollider args={[1, 4, SPAN]} position={[-BOUND - 0.5, 4, 0]} />
          </>
        )}
      </RigidBody>
      <instancedMesh ref={mesh} visible={!open} args={[undefined, undefined, blocks.length]} frustumCulled={false} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>
      {!open && [-4, -2, 0, 2, 4].flatMap((k) => [
        { x: BOUND - 0.4, z: k * 80, r: -Math.PI / 2 },
        { x: -BOUND + 0.4, z: k * 80, r: Math.PI / 2 },
        { x: k * 80, z: BOUND - 0.4, r: Math.PI },
        { x: k * 80, z: -BOUND + 0.4, r: 0 },
      ]).map((s, i) => (
        <mesh key={i} position={[s.x, 2.2, s.z]} rotation-y={s.r}>
          <boxGeometry args={[6, 1.5, 0.15]} />
          <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.35} />
        </mesh>
      ))}
    </>
  )
}
