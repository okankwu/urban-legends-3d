import { useMemo } from 'react'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { INTERIOR, shops } from './shops'
import { Person, newRig } from '../npc/Person'
import { useGame } from '../store/game'

const { x: X, z: Z, w: W, d: D, h: H } = INTERIOR
const THEME = {
  store: { floor: '#c9ccd2', wall: '#e9ecef', accent: '#1fa35c' },
  diner: { floor: '#4a3a30', wall: '#f3d9b8', accent: '#e0702a' },
  clothes: { floor: '#2b2d38', wall: '#d9d4e8', accent: '#7c4ddb' },
}

function Shelf({ x, z, rot = 0, color }: { x: number; z: number; rot?: number; color: string }) {
  const items = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({ y: 0.5 + (i % 3) * 0.55, x: -1.3 + Math.floor(i / 3) * 0.85, c: ['#e04f4f', '#4f8fe0', '#e0c24f', '#4fe08a'][(i * 3) % 4] })),
    [],
  )
  return (
    <group position={[x, 0, z]} rotation-y={rot}>
      <mesh position={[0, 1, 0]}>
        <boxGeometry args={[3.2, 2, 0.5]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {items.map((it, i) => (
        <mesh key={i} position={[it.x, it.y + 0.1, 0.3]}>
          <boxGeometry args={[0.5, 0.35, 0.2]} />
          <meshStandardMaterial color={it.c} />
        </mesh>
      ))}
    </group>
  )
}

/** One shared room far from the city; theme follows the shop the player entered. */
export default function Interior() {
  const id = useGame((s) => s.inShop)
  const shop = shops.find((s) => s.id === id)
  const t = THEME[shop?.kind ?? 'store']
  const keeper = useMemo(() => newRig(), [])
  return (
    <group position={[X, 0, Z]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[W / 2, 0.5, D / 2]} position={[0, -0.5, 0]} />
        <CuboidCollider args={[W / 2, H / 2, 0.3]} position={[0, H / 2, -D / 2]} />
        <CuboidCollider args={[W / 2, H / 2, 0.3]} position={[0, H / 2, D / 2]} />
        <CuboidCollider args={[0.3, H / 2, D / 2]} position={[-W / 2, H / 2, 0]} />
        <CuboidCollider args={[0.3, H / 2, D / 2]} position={[W / 2, H / 2, 0]} />
        <CuboidCollider args={[W / 2, 0.3, D / 2]} position={[0, H + 0.3, 0]} />
        <CuboidCollider args={[3.4, 0.6, 0.45]} position={[0, 0.6, -2]} /> {/* counter */}
      </RigidBody>
      <mesh position={[0, 0, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color={t.floor} roughness={0.6} />
      </mesh>
      <mesh position={[0, H, 0]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#f5f5f5" side={THREE.DoubleSide} />
      </mesh>
      {[
        [0, H / 2, -D / 2, W, H, 0.2],
        [0, H / 2, D / 2, W, H, 0.2],
        [-W / 2, H / 2, 0, 0.2, H, D],
        [W / 2, H / 2, 0, 0.2, H, D],
      ].map((w, i) => (
        <mesh key={i} position={[w[0], w[1], w[2]]}>
          <boxGeometry args={[w[3], w[4], w[5]]} />
          <meshStandardMaterial color={t.wall} />
        </mesh>
      ))}
      {/* accent stripe + counter */}
      <mesh position={[0, 1.2, -D / 2 + 0.12]}>
        <boxGeometry args={[W - 0.4, 0.3, 0.05]} />
        <meshStandardMaterial color={t.accent} emissive={t.accent} emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0, 0.6, -2]}>
        <boxGeometry args={[6.8, 1.2, 0.9]} />
        <meshStandardMaterial color={t.accent} roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.22, -2]}>
        <boxGeometry args={[7, 0.1, 1.05]} />
        <meshStandardMaterial color="#2a2a2e" />
      </mesh>
      <Shelf x={-5} z={-D / 2 + 1} color="#8a8f98" />
      <Shelf x={5} z={-D / 2 + 1} color="#8a8f98" />
      <Shelf x={-W / 2 + 1} z={1} rot={Math.PI / 2} color="#8a8f98" />
      {/* door marker on the front wall */}
      <mesh position={[0, 1.2, D / 2 - 0.12]}>
        <boxGeometry args={[2.2, 2.4, 0.1]} />
        <meshStandardMaterial color="#9fd6ff" emissive="#ffe6b0" emissiveIntensity={0.8} transparent opacity={0.85} />
      </mesh>
      <group position={[0, 0, -3.1]}>
        <Person rig={keeper} skin="#c68642" shirt={t.accent} pants="#222" hair="#222" />
      </group>
      <group position={[0, 0, -3.1]} rotation-y={0} />
      {shop && (
        <>
          <pointLight position={[-4, 3.3, 0]} intensity={90} distance={20} color="#fff3dd" />
          <pointLight position={[4, 3.3, 0]} intensity={90} distance={20} color="#fff3dd" />
        </>
      )}
    </group>
  )
}
