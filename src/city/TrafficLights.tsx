import { useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CELL, ROAD_MAX, ROAD_MIN, ROAD_W } from './layout'
import { lightState } from './roadnet'
import { signalColors } from '../ui/palette'
import type { LightColor } from './roadnet'

const COLORS: Record<LightColor, THREE.Color> = {
  green: new THREE.Color('#3dff6a'),
  yellow: new THREE.Color('#ffc928'),
  red: new THREE.Color('#ff3030'),
}
const N = ROAD_MAX - ROAD_MIN + 1
const POLE = ROAD_W / 2 + 0.7

/** Signal poles at every intersection corner; lamp colours follow the shared signal cycle. */
export default function TrafficLights() {
  const poles = useRef<THREE.InstancedMesh>(null!)
  const lamps = useRef<THREE.InstancedMesh>(null!)
  const acc = useRef(0)

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    let p = 0
    let l = 0
    for (let a = ROAD_MIN; a <= ROAD_MAX; a++)
      for (let b = ROAD_MIN; b <= ROAD_MAX; b++)
        for (const sx of [-1, 1])
          for (const sz of [-1, 1]) {
            const x = a * CELL + sx * POLE
            const z = b * CELL + sz * POLE
            m.compose(new THREE.Vector3(x, 2.6, z), q, new THREE.Vector3(1, 1, 1))
            poles.current.setMatrixAt(p++, m)
            // x-axis lamp (thin along x) then z-axis lamp (thin along z); both on the road side of the pole
            m.compose(new THREE.Vector3(x - sx * 0.35, 4.9, z), q, new THREE.Vector3(0.25, 0.7, 0.7))
            lamps.current.setMatrixAt(l++, m)
            m.compose(new THREE.Vector3(x, 4.9, z - sz * 0.35), q, new THREE.Vector3(0.7, 0.7, 0.25))
            lamps.current.setMatrixAt(l++, m)
          }
    poles.current.instanceMatrix.needsUpdate = true
    lamps.current.instanceMatrix.needsUpdate = true
    paint()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function paint() {
    const sc = signalColors()
    COLORS.green.set(sc.green)
    COLORS.yellow.set(sc.yellow)
    COLORS.red.set(sc.red)
    let l = 0
    for (let a = ROAD_MIN; a <= ROAD_MAX; a++)
      for (let b = ROAD_MIN; b <= ROAD_MAX; b++) {
        const cx = COLORS[lightState('x', a, b)]
        const cz = COLORS[lightState('z', a, b)]
        for (let k = 0; k < 4; k++) {
          lamps.current.setColorAt(l++, cx)
          lamps.current.setColorAt(l++, cz)
        }
      }
    lamps.current.instanceColor!.needsUpdate = true
  }

  useFrame((_, dt) => {
    acc.current += dt
    if (acc.current > 0.2) {
      acc.current = 0
      paint()
    }
  })

  return (
    <>
      <instancedMesh ref={poles} args={[undefined, undefined, N * N * 4]} frustumCulled={false} castShadow>
        <cylinderGeometry args={[0.1, 0.14, 5.2, 6]} />
        <meshStandardMaterial color="#2f3238" metalness={0.5} roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={lamps} args={[undefined, undefined, N * N * 8]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </>
  )
}
