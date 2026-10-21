import { Suspense, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import CharacterModel from '../player/CharacterModel'
import type { AnimState } from '../player/CharacterModel'
import { rt } from '../engine/runtime'

/** Far above the city so the preview never overlaps the world. */
export const STAGE_Y = 900

const IDLE: AnimState = { speed: 0, sprint: false, crouch: false, grounded: true, seated: false }

export default function CreatorStage() {
  const anim = useRef(IDLE)
  const turn = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (!turn.current) return
    turn.current.rotation.y = THREE.MathUtils.damp(turn.current.rotation.y, rt.creatorYaw, 10, dt)
  })
  return (
    <group position={[0, STAGE_Y, 0]}>
      <mesh>
        <sphereGeometry args={[30, 24, 16]} />
        <meshBasicMaterial color="#10131c" side={THREE.BackSide} fog={false} />
      </mesh>
      <mesh position={[-0.55, 0.005, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[1.3, 48]} />
        <meshStandardMaterial color="#222836" roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh position={[-0.55, 0.006, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[1.25, 1.3, 48]} />
        <meshBasicMaterial color="#ffd24a" />
      </mesh>
      <ambientLight intensity={0.9} />
      <directionalLight position={[2, 4, 3]} intensity={2.4} />
      <directionalLight position={[-3, 2, -2]} intensity={1.2} color="#7aa7ff" />
      <group position={[-0.55, 0, 0]}>
        <group ref={turn}>
          <Suspense fallback={null}>
            <CharacterModel state={anim} />
          </Suspense>
        </group>
      </group>
    </group>
  )
}
