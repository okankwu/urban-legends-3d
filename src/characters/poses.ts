import * as THREE from 'three'

type Euler3 = [number, number, number]
/** Additive local rotations (radians) on top of the bind pose, keyed by Mixamo bone name without prefix. */
export type Pose = Record<string, Euler3>

// Bone frames are mirrored left/right for the arms (verified visually): +Z lowers the right arm, -Z the left.
const ARMS_DOWN: Pose = {
  LeftArm: [0, 0, -0.45],
  RightArm: [0, 0, 0.45],
  // the model's bind-pose elbows are bent forward; -X straightens them so the arms hang naturally
  LeftForeArm: [-0.25, 0, 0],
  RightForeArm: [-0.25, 0, 0],
}

export const POSES: Record<string, Pose> = {
  idle: { ...ARMS_DOWN },
  crouch: {
    ...ARMS_DOWN,
    Spine: [0.25, 0, 0],
    Spine1: [0.15, 0, 0],
    LeftUpLeg: [-1.0, 0, 0],
    RightUpLeg: [-1.0, 0, 0],
    LeftLeg: [1.7, 0, 0],
    RightLeg: [1.7, 0, 0],
  },
  jump: {
    LeftArm: [0, 0, 1.3],
    RightArm: [0, 0, -1.3],
    LeftUpLeg: [-0.9, 0, 0],
    RightUpLeg: [-0.3, 0, 0],
    LeftLeg: [1.2, 0, 0],
    RightLeg: [0.5, 0, 0],
  },
  seated: {
    LeftArm: [0.6, 0, -0.7],
    RightArm: [0.6, 0, 0.7],
    LeftForeArm: [0.2, 0, 0],
    RightForeArm: [0.2, 0, 0],
    LeftUpLeg: [-1.5, 0, 0],
    RightUpLeg: [-1.5, 0, 0],
    LeftLeg: [1.5, 0, 0],
    RightLeg: [1.5, 0, 0],
  },
}

export const shortBone = (n: string) => n.replace(/^mixamorig:?/, '')

export function boneBy(root: THREE.Object3D, suffix: string): THREE.Bone | undefined {
  let found: THREE.Bone | undefined
  root.traverse((o) => {
    if (!found && (o as THREE.Bone).isBone && shortBone(o.name) === suffix) found = o as THREE.Bone
  })
  return found
}

/** Builds a looping pose clip against the bind pose of the given Mixamo skeleton instance. */
export function makePoseClip(name: string, root: THREE.Object3D, pose: Pose, breathe = 0): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = []
  const dur = 3
  root.traverse((o) => {
    if (!(o as THREE.Bone).isBone) return
    const suffix = shortBone(o.name)
    const base = o.quaternion.clone()
    const make = (off: Euler3) => base.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...off)))
    const off = pose[suffix]
    const amp = breathe && (suffix === 'Spine1' || suffix === 'Spine2') ? breathe : 0
    const a = off ? make(off) : base
    const b = amp ? make([(off?.[0] ?? 0) + amp, off?.[1] ?? 0, off?.[2] ?? 0]) : a
    tracks.push(
      new THREE.QuaternionKeyframeTrack(
        `${o.name}.quaternion`,
        [0, dur / 2, dur],
        [...a.toArray(), ...b.toArray(), ...a.toArray()],
      ),
    )
  })
  return new THREE.AnimationClip(name, dur, tracks)
}

/** Idle/Crouch/Jump/Seated clips for a Mixamo-skeleton scene (the built-in model). */
export function makePoseClips(root: THREE.Object3D): THREE.AnimationClip[] {
  root.updateMatrixWorld(true)
  return [
    makePoseClip('Idle', root, POSES.idle, 0.05),
    makePoseClip('Crouch', root, POSES.crouch, 0.03),
    makePoseClip('Jump', root, POSES.jump),
    makePoseClip('Seated', root, POSES.seated),
  ]
}
