import { Suspense, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { useGame } from '../store/game'
import { STAGE_Y } from '../characters/CreatorStage'
import { buildProcedural, spec as specOf } from './specs'
import type { Prepared, VehicleSpec } from './specs'
import { glbUrl, prepareGLB } from './Car'

/** Turntable state shared with the selection screen (drag to spin). */
export const turntable = { yaw: 0.6, drag: false }

function Showcase({ prep }: { prep: Prepared }) {
  const turn = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (!turn.current) return
    if (!turntable.drag) turntable.yaw += dt * 0.4
    turn.current.rotation.y = THREE.MathUtils.damp(turn.current.rotation.y, turntable.yaw, 12, dt)
  })
  const ground = prep.wheelCy - prep.radius
  return (
    <group ref={turn}>
      <group position={[0, -ground, 0]}>
        <primitive object={prep.root} />
      </group>
    </group>
  )
}

const cache = new Map<string, Prepared>()

function GlbShowcase({ spec }: { spec: VehicleSpec }) {
  const cfg = spec.glb!
  const gltf = useGLTF(glbUrl(cfg), false, true)
  const prep = useMemo(() => {
    let p = cache.get(spec.id)
    if (!p) {
      p = prepareGLB(gltf.scene, cfg)
      cache.set(spec.id, p)
    }
    return p
  }, [gltf.scene, cfg, spec.id])
  return <Showcase prep={prep} />
}

function ProceduralShowcase({ spec }: { spec: VehicleSpec }) {
  const paint = useGame((s) => s.paint[spec.id])
  const color = paint ?? spec.defaultColor
  const prep = useMemo(() => buildProcedural(spec.id, color)!, [spec.id, color])
  return <Showcase prep={prep} />
}

/** Showroom floor and lights far above the city, with the vehicle being considered on a turntable. */
export default function VehicleStage() {
  const id = useGame((s) => s.previewVehicle)
  const sp = specOf(id)
  return (
    <group position={[0, STAGE_Y, 0]}>
      <mesh>
        <sphereGeometry args={[40, 24, 16]} />
        <meshBasicMaterial color="#0d1018" side={THREE.BackSide} fog={false} />
      </mesh>
      <mesh position={[0, 0.005, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[3.6, 64]} />
        <meshStandardMaterial color="#1c2230" roughness={0.45} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.006, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[3.5, 3.6, 64]} />
        <meshBasicMaterial color="#ffd24a" />
      </mesh>
      <ambientLight intensity={0.8} />
      <directionalLight position={[4, 6, 5]} intensity={2.6} />
      <directionalLight position={[-5, 3, -4]} intensity={1.4} color="#7aa7ff" />
      <pointLight position={[0, 2.5, 0]} intensity={8} distance={12} color="#ffcf8a" />
      <group position={[0, 0, 0]}>
        <Suspense fallback={null}>
          {sp.glb ? <GlbShowcase key={sp.id} spec={sp} /> : <ProceduralShowcase key={sp.id} spec={sp} />}
        </Suspense>
      </group>
    </group>
  )
}
