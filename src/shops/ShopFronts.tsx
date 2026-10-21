import { useMemo } from 'react'
import * as THREE from 'three'
import { shops } from './shops'
import type { Shop } from './shops'

const KIND_COLOR = { store: '#1fa35c', diner: '#e0702a', clothes: '#7c4ddb' } as const

function signTexture(text: string, color: string) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = color
  g.fillRect(0, 0, 512, 128)
  g.strokeStyle = 'rgba(255,255,255,.85)'
  g.lineWidth = 6
  g.strokeRect(6, 6, 500, 116)
  g.fillStyle = '#fff'
  g.font = 'bold 54px "Segoe UI", Arial, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, 256, 68, 480)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function Front({ shop }: { shop: Shop }) {
  const tex = useMemo(() => signTexture(shop.name, KIND_COLOR[shop.kind]), [shop])
  const rotY = shop.n.x > 0 ? Math.PI / 2 : shop.n.x < 0 ? -Math.PI / 2 : shop.n.z > 0 ? 0 : Math.PI
  return (
    <group position={[shop.door.x, 0, shop.door.z]} rotation-y={rotY}>
      {/* door frame & glass */}
      <mesh position={[0, 1.4, 0.12]}>
        <boxGeometry args={[2.6, 2.8, 0.25]} />
        <meshStandardMaterial color="#20242c" />
      </mesh>
      <mesh position={[0, 1.4, 0.26]}>
        <boxGeometry args={[2.1, 2.5, 0.05]} />
        <meshStandardMaterial color="#9fd6ff" emissive="#ffd9a0" emissiveIntensity={0.35} transparent opacity={0.8} />
      </mesh>
      {/* sign */}
      <mesh position={[0, 3.6, 0.2]}>
        <boxGeometry args={[5, 1.25, 0.3]} />
        <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.5} />
      </mesh>
      {/* awning */}
      <mesh position={[0, 2.95, 0.9]} rotation-x={0.35}>
        <boxGeometry args={[3.6, 0.08, 1.6]} />
        <meshStandardMaterial color={KIND_COLOR[shop.kind]} />
      </mesh>
    </group>
  )
}

export default function ShopFronts() {
  return (
    <>
      {shops.map((s) => (
        <Front key={s.id} shop={s} />
      ))}
    </>
  )
}
