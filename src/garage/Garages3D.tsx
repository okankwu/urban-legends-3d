import { useMemo } from 'react'
import * as THREE from 'three'
import { useGame } from '../store/game'
import { activeGarages } from './garages'

function signTexture(text: string) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#16384a'
  g.fillRect(0, 0, 512, 128)
  g.strokeStyle = '#5ec8ff'
  g.lineWidth = 8
  g.strokeRect(6, 6, 500, 116)
  g.fillStyle = '#e8f6ff'
  g.font = 'bold 50px "Segoe UI", Arial, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, 256, 66, 470)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function Pad({ name, x, z }: { name: string; x: number; z: number }) {
  const tex = useMemo(() => signTexture(name), [name])
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.16, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[2.6, 3.2, 32]} />
        <meshBasicMaterial color="#5ec8ff" transparent opacity={0.9} />
      </mesh>
      <mesh position={[0, 12, 0]}>
        <cylinderGeometry args={[1.9, 1.9, 24, 20, 1, true]} />
        <meshBasicMaterial color="#5ec8ff" transparent opacity={0.16} depthWrite={false} side={THREE.DoubleSide} fog={false} blending={THREE.AdditiveBlending} />
      </mesh>
      {/* signboard on two posts */}
      {[-2.4, 2.4].map((px) => (
        <mesh key={px} position={[px, 1.9, -1.1]}>
          <cylinderGeometry args={[0.08, 0.08, 3.8, 8]} />
          <meshStandardMaterial color="#555b66" />
        </mesh>
      ))}
      <mesh position={[0, 3.6, -1.1]}>
        <boxGeometry args={[5.4, 1.3, 0.2]} />
        <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.5} />
      </mesh>
    </group>
  )
}

export default function Garages3D() {
  const unlocks = useGame((s) => s.unlocks)
  const inShop = useGame((s) => s.inShop)
  if (inShop) return null
  return (
    <>
      {activeGarages(unlocks).map((g) => (
        <Pad key={g.id} name={g.name} x={g.x} z={g.z} />
      ))}
    </>
  )
}
