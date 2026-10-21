import * as THREE from 'three'

export interface Rig {
  root: THREE.Group | null
  body: THREE.Group | null
  legL: THREE.Group | null
  legR: THREE.Group | null
  armL: THREE.Group | null
  armR: THREE.Group | null
}
export const newRig = (): Rig => ({ root: null, body: null, legL: null, legR: null, armL: null, armR: null })

/** Low-poly stylised person (used for pedestrians and shopkeepers). Faces +Z, feet at y=0. */
export function Person({ rig, skin, shirt, pants, hair, shadows }: { rig: Rig; skin: string; shirt: string; pants: string; hair: string; shadows?: boolean }) {
  const cs = !!shadows
  return (
    <group ref={(g) => (rig.root = g)}>
      <group ref={(g) => (rig.body = g)}>
        <mesh position={[0, 1.25, 0]} castShadow={cs}>
          <boxGeometry args={[0.46, 0.62, 0.26]} />
          <meshStandardMaterial color={shirt} roughness={0.8} />
        </mesh>
        <mesh position={[0, 1.7, 0]} castShadow={cs}>
          <sphereGeometry args={[0.13, 10, 8]} />
          <meshStandardMaterial color={skin} roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.76, -0.02]}>
          <sphereGeometry args={[0.135, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
          <meshStandardMaterial color={hair} roughness={0.9} />
        </mesh>
        <group ref={(g) => (rig.armL = g)} position={[0.3, 1.52, 0]}>
          <mesh position={[0, -0.28, 0]} castShadow={cs}>
            <boxGeometry args={[0.11, 0.56, 0.12]} />
            <meshStandardMaterial color={shirt} roughness={0.8} />
          </mesh>
        </group>
        <group ref={(g) => (rig.armR = g)} position={[-0.3, 1.52, 0]}>
          <mesh position={[0, -0.28, 0]} castShadow={cs}>
            <boxGeometry args={[0.11, 0.56, 0.12]} />
            <meshStandardMaterial color={shirt} roughness={0.8} />
          </mesh>
        </group>
      </group>
      <group ref={(g) => (rig.legL = g)} position={[0.12, 0.95, 0]}>
        <mesh position={[0, -0.46, 0]} castShadow={cs}>
          <boxGeometry args={[0.16, 0.92, 0.18]} />
          <meshStandardMaterial color={pants} roughness={0.8} />
        </mesh>
      </group>
      <group ref={(g) => (rig.legR = g)} position={[-0.12, 0.95, 0]}>
        <mesh position={[0, -0.46, 0]} castShadow={cs}>
          <boxGeometry args={[0.16, 0.92, 0.18]} />
          <meshStandardMaterial color={pants} roughness={0.8} />
        </mesh>
      </group>
    </group>
  )
}

/** Swing limbs for a walk cycle. phase in radians, amount 0..1 */
export function animateWalk(r: Rig, phase: number, amount: number) {
  const s = Math.sin(phase) * 0.7 * amount
  if (r.legL) r.legL.rotation.x = s
  if (r.legR) r.legR.rotation.x = -s
  if (r.armL) r.armL.rotation.x = -s * 0.8
  if (r.armR) r.armR.rotation.x = s * 0.8
}
