import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGame } from '../store/game'
import { getRun } from './manager'

/** World objects for the active driver job: the waiting passenger / parcel and the parking bay outline. */
export default function DriverScene3D() {
  const job = useGame((s) => s.djJob)
  const phase = useGame((s) => s.phase)
  const wave = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (wave.current) wave.current.position.y = Math.abs(Math.sin(clock.elapsedTime * 2.2)) * 0.06
  })
  const run = getRun()
  if (!job || !run || phase === 'creator') return null
  const stage = run.job.stages[run.stage]
  const bay = run.job.bay
  const waiting = stage.kind === 'pickup'

  return (
    <>
      {waiting && (run.job.type === 'taxi' || (run.job.type === 'emergency' && stage.text.includes('patient') )) && (
        <group position={[stage.at.x, 0, stage.at.z]} ref={wave}>
          {/* a simple waiting figure on the kerb */}
          <mesh position={[0, 0.9, 0]}>
            <capsuleGeometry args={[0.26, 0.9, 4, 10]} />
            <meshStandardMaterial color={run.job.type === 'taxi' ? '#e7b84a' : '#f0f3f8'} roughness={0.7} />
          </mesh>
          <mesh position={[0, 1.62, 0]}>
            <sphereGeometry args={[0.2, 12, 10]} />
            <meshStandardMaterial color="#c8a07c" roughness={0.8} />
          </mesh>
          {run.job.type === 'taxi' && (
            <mesh position={[0.35, 1.5, 0]} rotation={[0, 0, -0.9]}>
              <capsuleGeometry args={[0.05, 0.5, 3, 6]} />
              <meshStandardMaterial color="#e7b84a" />
            </mesh>
          )}
        </group>
      )}
      {waiting && (run.job.type === 'delivery' || (run.job.type === 'emergency' && run.job.title.startsWith('Emergency'))) && (
        <group position={[stage.at.x, 0, stage.at.z]}>
          <mesh position={[0, 0.4, 0]}>
            <boxGeometry args={[0.9, 0.8, 0.9]} />
            <meshStandardMaterial color="#b98a52" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.81, 0]}>
            <boxGeometry args={[0.92, 0.04, 0.2]} />
            <meshStandardMaterial color="#ead6a8" />
          </mesh>
        </group>
      )}
      {bay && (
        <group position={[bay.x, 0.16, bay.z]} rotation={[0, bay.yaw, 0]}>
          <mesh rotation-x={-Math.PI / 2}>
            <planeGeometry args={[bay.wid, bay.len]} />
            <meshBasicMaterial color="#35e08a" transparent opacity={0.28} depthWrite={false} />
          </mesh>
          {[
            [0, bay.len / 2, bay.wid, 0.12],
            [0, -bay.len / 2, bay.wid, 0.12],
            [bay.wid / 2, 0, 0.12, bay.len],
            [-bay.wid / 2, 0, 0.12, bay.len],
          ].map(([x, z, w, l], i) => (
            <mesh key={i} position={[x, 0.01, z]} rotation-x={-Math.PI / 2}>
              <planeGeometry args={[w, l]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
          ))}
        </group>
      )}
    </>
  )
}
