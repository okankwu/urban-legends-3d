import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGame } from '../store/game'
import { nightFactor } from './City'
import { lamps } from './layout'
import { rt } from '../engine/runtime'
import { RNG } from './roadnet'

/** Stars, moon, drifting clouds and a pool of point lights that follow the player at night. */
export default function SkyDetails() {
  const stars = useRef<THREE.Points>(null!)
  const moon = useRef<THREE.Mesh>(null!)
  const clouds = useRef<THREE.Group>(null!)
  const lampLights = useRef<(THREE.PointLight | null)[]>([])
  const { camera } = useThree()
  const acc = useRef(0)

  const starGeo = useMemo(() => {
    const r = RNG(99)
    const pos = new Float32Array(1600 * 3)
    for (let i = 0; i < 1600; i++) {
      const u = r() * 2 - 1
      const t = r() * Math.PI * 2
      const s = Math.sqrt(1 - u * u)
      const y = Math.abs(u) * 0.9 + 0.1 // upper hemisphere
      pos.set([Math.cos(t) * s * 2800, y * 2800, Math.sin(t) * s * 2800], i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [])

  const cloudData = useMemo(() => {
    const r = RNG(31)
    return Array.from({ length: 16 }, () => ({
      x: (r() - 0.5) * 1400,
      z: (r() - 0.5) * 1400,
      y: 260 + r() * 90,
      s: 0.8 + r() * 1.2,
      puffs: Array.from({ length: 5 }, () => ({ x: (r() - 0.5) * 70, y: (r() - 0.5) * 8, z: (r() - 0.5) * 40, s: 22 + r() * 24 })),
    }))
  }, [])
  const cloudMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, fog: false, depthWrite: false }), [])

  useFrame((_, dt) => {
    const st = useGame.getState()
    const n = nightFactor(st.hour)
    // keep sky furniture centred on the camera
    stars.current.position.copy(camera.position)
    ;(stars.current.material as THREE.PointsMaterial).opacity = Math.max(0, n * 1.1 - 0.1)
    const ang = ((st.hour - 6) / 12) * Math.PI
    // moon opposite the sun
    moon.current.position.set(camera.position.x - Math.cos(ang) * 2400, camera.position.y - Math.sin(ang) * 2400 + 200, camera.position.z - 300)
    moon.current.visible = n > 0.25
    ;(moon.current.material as THREE.MeshBasicMaterial).opacity = Math.min(1, n * 1.3)

    // clouds drift and darken at night
    if (st.phase === 'playing') clouds.current.position.x += dt * 4
    if (clouds.current.position.x > 700) clouds.current.position.x = -700
    cloudMat.color.set('#ffffff').lerp(new THREE.Color('#5d6470'), rt.gray).lerp(new THREE.Color('#1d2233'), n)
    cloudMat.opacity = Math.min(0.97, 0.85 - n * 0.35 + rt.gray * 0.2)

    // streetlight glow: nearest lamps get real lights at night
    acc.current += dt
    if (acc.current > 0.4) {
      acc.current = 0
      const p = st.inVehicle ? rt.vehiclePos : rt.playerPos
      const near = lamps
        .map((l) => ({ l, d: (l.x - p.x) ** 2 + (l.z - p.z) ** 2 }))
        .sort((a, b) => a.d - b.d)
        .slice(0, lampLights.current.length)
      near.forEach((q, i) => lampLights.current[i]?.position.set(q.l.x, 6.6, q.l.z))
    }
    for (const L of lampLights.current) if (L) L.intensity = n * 55

  })

  return (
    <>
      <points ref={stars} geometry={starGeo} frustumCulled={false}>
        <pointsMaterial color="#ffffff" size={2} sizeAttenuation={false} transparent opacity={0} depthWrite={false} fog={false} />
      </points>
      <mesh ref={moon} visible={false} frustumCulled={false}>
        <sphereGeometry args={[70, 24, 16]} />
        <meshBasicMaterial color="#e9eefc" transparent fog={false} />
      </mesh>
      <group ref={clouds}>
        {cloudData.map((c, i) => (
          <group key={i} position={[c.x, c.y, c.z]} scale={c.s}>
            {c.puffs.map((p, j) => (
              <mesh key={j} position={[p.x, p.y, p.z]} scale={[p.s, p.s * 0.35, p.s * 0.7]} material={cloudMat}>
                <sphereGeometry args={[1, 10, 8]} />
              </mesh>
            ))}
          </group>
        ))}
      </group>
      {Array.from({ length: 6 }, (_, i) => (
        <pointLight
          key={i}
          ref={(l) => {
            lampLights.current[i] = l
          }}
          color="#ffcf8a"
          intensity={0}
          distance={26}
          decay={1.6}
        />
      ))}
    </>
  )
}
