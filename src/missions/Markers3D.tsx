import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGame } from '../store/game'
import type { Marker } from './types'
import { markerColor } from '../ui/palette'


function Beam({ m }: { m: Marker }) {
  const ring = useRef<THREE.Mesh>(null)
  useFrame((_, dt) => {
    if (ring.current) ring.current.rotation.z += dt * 1.2
  })
  if (m.kind === 'search') return null
  const c = markerColor(m.kind)
  const r = Math.max(1.6, Math.min(m.r ?? 3, 12))
  return (
    <group position={[m.x, 0, m.z]}>
      <mesh position={[0, 30, 0]}>
        <cylinderGeometry args={[r * 0.55, r * 0.55, 60, 20, 1, true]} />
        <meshBasicMaterial color={c} transparent opacity={0.22} depthWrite={false} side={THREE.DoubleSide} fog={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={ring} position={[0, 0.25, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[r * 0.8, r, 32]} />
        <meshBasicMaterial color={c} transparent opacity={0.85} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

/** Light beams + ground rings for the current objective and the next available mission. */
export default function Markers3D() {
  const markers = useGame((s) => s.markers)
  const starts = useGame((s) => s.startMarkers)
  const phase = useGame((s) => s.phase)
  const inShop = useGame((s) => s.inShop)
  if (inShop || phase === 'creator') return null
  return (
    <>
      {markers.map((m, i) => (
        <Beam key={'m' + i + m.kind} m={m} />
      ))}
      {starts.map((m, i) => (
        <Beam key={'s' + i + m.kind} m={m} />
      ))}
    </>
  )
}
