import { Quaternion, Vector3 } from 'three'
import type { RapierRigidBody } from '@react-three/rapier'

/** Mutable per-frame state shared between systems without triggering React renders. */
export const rt = {
  playerPos: new Vector3(0, 1, 0),
  playerYaw: 0,
  camYaw: 0,
  camPitch: 0.25,
  lastMouse: 0,
  vehiclePos: new Vector3(),
  vehicleYaw: 0,
  vehicleSpeed: 0,
  playerBody: null as RapierRigidBody | null,
  carBody: null as RapierRigidBody | null,
  simTime: 0,
  perf: { fps: 0, calls: 0, tris: 0, scale: 1 },
  stick: { x: 0, y: 0, active: false },
  rain: 0,
  gray: 0,
  flash: 0,
  /** applied once when a saved game is continued */
  pendingSpawn: null as null | { player: { x: number; y: number; z: number } | null; car: { x: number; y: number; z: number; yaw: number } | null },
  freezeCar: false,
  /** where the next spawned player vehicle appears (set by garages) */
  vehicleSpawn: null as null | { x: number; z: number; yaw: number },
  raceActive: false,
  walkSpeed: 0,
  grounded: true,
  hornTime: -10,
  /** chassis orientation, steering angle and size of the player's vehicle (cockpit camera + dashboard) */
  vehicleQuat: new Quaternion(),
  steer: 0,
  cockpit: null as null | { eye: [number, number, number]; belt: number; zFront: number; noDash?: boolean },
  vehicleDims: { l: 2.2, w: 0.95 },
  /** head look angles in the cockpit camera */
  /** the cockpit camera's pose in the chassis frame (stabilised eye + head look); dashboard picking uses it */
  camRel: { pos: new Vector3(), quat: new Quaternion() },
  headYaw: 0,
  headPitch: 0,
  /** a driver-job prompt is using the E key (so E does not also exit the car) */
  driverInteract: false,
  /** true while the player stands at a garage pad (G opens the garage instead of toggling GPS) */
  nearGarage: false,
  creatorYaw: 0.4,
  creatorZoom: 3.4,
  keys: {} as Record<string, boolean>,
  pressed: {} as Record<string, number>,
}

if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__rt = rt

/** A key press is valid for a short window so unused presses do not trigger actions later. */
export function consumePressed(code: string): boolean {
  const t = rt.pressed[code]
  rt.pressed[code] = 0
  return !!t && performance.now() - t < 250
}
