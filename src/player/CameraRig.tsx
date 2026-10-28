import { useFrame, useThree } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import * as THREE from 'three'
import { rt } from '../engine/runtime'
import { useGame } from '../store/game'

const target = new THREE.Vector3()
const desired = new THREE.Vector3()
const smoothed = new THREE.Vector3()
let init = false
const dist = { current: 0 }
const eye = new THREE.Vector3()
const qHead = new THREE.Quaternion()
const eHead = new THREE.Euler(0, 0, 0, 'YXZ')
// cockpit stabiliser: the body's pitch and roll (not its heading) and the eye height are low-passed so suspension buzz,
// frame-time spikes and bumps do not shake the view, while turning and braking still lean the camera a little
const yawQ = new THREE.Quaternion()
const tiltQ = new THREE.Quaternion()
const smoothTilt = new THREE.Quaternion()
const UP = new THREE.Vector3(0, 1, 0)
const invQ = new THREE.Quaternion()
let smoothY = 0
let cockpitWas = false
const TILT_TAU = 0.12
const HEIGHT_TAU = 0.09
import { STAGE_Y } from '../characters/CreatorStage'

export default function CameraRig() {
  const { camera } = useThree()
  const { world, rapier } = useRapier()

  useFrame((_, rawDt) => {
    const st = useGame.getState()
    if (st.phase === 'menu') {
      // slow orbit above the city for the main menu backdrop
      const t = performance.now() / 12000
      camera.position.set(Math.cos(t) * 260, 130, Math.sin(t) * 260)
      camera.lookAt(0, 20, 0)
      init = false
      return
    }
    if (st.phase === 'creator') {
      camera.position.set(-0.55, STAGE_Y + 1.15, rt.creatorZoom)
      camera.lookAt(-0.55, STAGE_Y + 0.95, 0)
      init = false
      return
    }
    if (st.phase === 'vehicles') {
      // vehicle selection: a fixed three-quarter view of the turntable
      // looks a little left of the car so it sits clear of the list panel
      camera.position.set(4.6, STAGE_Y + 2.2, 8.6)
      camera.lookAt(-1.5, STAGE_Y + 0.7, 0)
      init = false
      return
    }
    const dt = Math.min(rawDt, 0.05)
    const inCar = st.inVehicle
    const cam = camera as THREE.PerspectiveCamera

    // first-person cockpit view: the camera sits at the driver's eye and turns with the head
    if (inCar && st.camMode === 'cockpit' && rt.cockpit) {
      if (cam.fov !== 74) {
        cam.fov = 74
        cam.updateProjectionMatrix()
      }
      if (performance.now() - rt.lastMouse > 4000 && rt.vehicleSpeed > 3 && !st.dashHover) {
        rt.headYaw *= Math.exp(-1.4 * dt)
        rt.headPitch *= Math.exp(-1.4 * dt)
      }
      // split the body orientation into its heading and its tilt, and smooth the tilt
      yawQ.setFromAxisAngle(UP, rt.vehicleYaw)
      tiltQ.copy(yawQ).invert().multiply(rt.vehicleQuat)
      if (!cockpitWas) smoothTilt.copy(tiltQ)
      else smoothTilt.slerp(tiltQ, 1 - Math.exp(-dt / TILT_TAU))
      const stable = yawQ.clone().multiply(smoothTilt)
      eye.set(rt.cockpit.eye[0], rt.cockpit.eye[1], rt.cockpit.eye[2]).applyQuaternion(stable).add(rt.vehiclePos)
      smoothY = !cockpitWas ? eye.y : smoothY + (eye.y - smoothY) * (1 - Math.exp(-dt / HEIGHT_TAU))
      eye.y = smoothY
      cockpitWas = true
      camera.position.copy(eye)
      eHead.set(rt.headPitch, Math.PI + rt.headYaw, 0)
      qHead.setFromEuler(eHead)
      camera.quaternion.copy(stable).multiply(qHead)
      // remember where the camera sits relative to the chassis, so dashboard buttons are picked exactly where they are drawn
      invQ.copy(rt.vehicleQuat).invert()
      rt.camRel.pos.copy(eye).sub(rt.vehiclePos).applyQuaternion(invQ)
      rt.camRel.quat.copy(invQ).multiply(camera.quaternion)
      init = false
      return
    }
    cockpitWas = false
    if (cam.fov !== 62) {
      cam.fov = 62
      cam.updateProjectionMatrix()
    }

    if (inCar && rt.vehicleSpeed > 3 && performance.now() - rt.lastMouse > 1500) {
      // ease the camera behind the car when the player is not steering the view
      const want = rt.vehicleYaw + Math.PI
      let d = ((want - rt.camYaw + Math.PI) % (Math.PI * 2)) - Math.PI
      if (d < -Math.PI) d += Math.PI * 2
      rt.camYaw += d * (1 - Math.exp(-1.6 * dt))
    }

    const base = inCar ? rt.vehiclePos : rt.playerPos
    target.set(base.x, base.y + (inCar ? 1.4 : 1.5), base.z)
    const want = st.camDistance * (inCar ? 1.5 : 1)
    const pitch = rt.camPitch
    desired.set(
      target.x + Math.sin(rt.camYaw) * Math.cos(pitch) * want,
      target.y + Math.sin(pitch) * want,
      target.z + Math.cos(rt.camYaw) * Math.cos(pitch) * want,
    )

    // pull the camera in front of walls
    const dir = desired.clone().sub(target)
    const len = dir.length()
    dir.normalize()
    const ray = new rapier.Ray({ x: target.x, y: target.y, z: target.z }, { x: dir.x, y: dir.y, z: dir.z })
    const exclude = inCar ? rt.carBody ?? undefined : rt.playerBody ?? undefined
    const hit = world.castRay(ray, len, true, undefined, undefined, undefined, exclude)
    const free = hit ? Math.max(0.6, hit.timeOfImpact - 0.3) : len
    dist.current = THREE.MathUtils.damp(dist.current || free, Math.min(free, len), free < dist.current ? 30 : 4, dt)
    desired.copy(target).addScaledVector(dir, dist.current)
    desired.y = Math.max(desired.y, 0.4)

    if (!init) {
      smoothed.copy(desired)
      init = true
    }
    smoothed.lerp(desired, 1 - Math.exp(-(inCar ? 12 : 22) * dt))
    camera.position.copy(smoothed)
    camera.lookAt(target)
  })
  return null
}
