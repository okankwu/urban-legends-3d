import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Sky } from '@react-three/drei'
import * as THREE from 'three'
import { useGame } from '../store/game'
import { rt } from '../engine/runtime'
import { nightFactor } from './City'

const DAY_FOG = new THREE.Color('#bcd0e6')
const NIGHT_FOG = new THREE.Color('#070a14')
const SUN_NIGHT = new THREE.Color('#5a6fa8')
const SUN_DAY = new THREE.Color('#fff2dd')
const GRAY_FOG = new THREE.Color('#7b8591')
const SUN_DUSK = new THREE.Color('#ff9a55')

/** Day/night cycle: advances the clock, moves the sun, dims lights and fades fog. */
export default function World() {
  const sun = useRef<THREE.DirectionalLight>(null!)
  const hemi = useRef<THREE.HemisphereLight>(null!)
  const sky = useRef<{ material: THREE.ShaderMaterial } | null>(null)
  const { scene } = useThree()
  const sunPos = useRef(new THREE.Vector3(100, 100, 50))
  const lastMinute = useRef(-1)
  const lastSet = useRef(useGame.getState().hour)
  const clock = useRef(useGame.getState().hour)
  const quality = useGame((s) => s.quality)

  useFrame((state, rawDt) => {
    const st = useGame.getState()
    if (st.phase === 'playing') clock.current = (clock.current + (rawDt * 24) / 1440) % 24 // a full 24h day lasts 24 real minutes
    // allow the hour to be set externally (debug / future time-skip)
    if (Math.abs(st.hour - lastSet.current) > 0.2 && Math.abs(st.hour - clock.current) > 0.2) clock.current = st.hour
    const hour = clock.current
    const minute = Math.floor(hour * 60)
    if (minute !== lastMinute.current) {
      lastMinute.current = minute
      lastSet.current = hour
      st.set({ hour })
    }
    const n = nightFactor(hour)
    const ang = ((hour - 6) / 12) * Math.PI
    const dir = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0.35).normalize()
    sunPos.current.copy(dir).multiplyScalar(400)
    if (sky.current) sky.current.material.uniforms.sunPosition.value.copy(sunPos.current)

    const L = sun.current
    const focus = rt.playerPos
    // light comes from the moon at night (below-horizon sun mirrored up)
    const lightDir = dir.clone()
    if (lightDir.y < 0.15) {
      lightDir.set(-dir.x, Math.max(0.35, -dir.y), dir.z).normalize()
    }
    L.position.set(focus.x + lightDir.x * 120, focus.y + lightDir.y * 120, focus.z + lightDir.z * 120)
    L.target.position.set(focus.x, focus.y, focus.z)
    L.target.updateMatrixWorld()
    const warm = THREE.MathUtils.smoothstep(Math.abs(hour - 12), 4.2, 5.6) * (1 - n)
    L.color.copy(SUN_DAY).lerp(SUN_DUSK, warm).lerp(SUN_NIGHT, n)
    L.intensity = THREE.MathUtils.lerp(2.6, 0.35, n)
    L.castShadow = quality !== 'low'
    const gray = rt.gray
    L.intensity *= 1 - 0.55 * gray
    L.intensity += rt.flash * 6
    hemi.current.intensity = THREE.MathUtils.lerp(1.5, 0.3, n) * (1 - 0.25 * gray) + rt.flash * 2
    if (st.phase === 'creator') {
      L.intensity = 0
      hemi.current.intensity = 0
    }

    const fog = scene.fog as THREE.Fog
    fog.color.copy(DAY_FOG).lerp(GRAY_FOG, gray * 0.8 * (1 - n)).lerp(NIGHT_FOG, n)
    const far = quality === 'low' ? 260 : quality === 'medium' ? 420 : 650
    fog.near = 60
    fog.far = THREE.MathUtils.lerp(far, far * 0.55, n) * (1 - 0.35 * rt.rain)
    if (st.weather === 'fog') {
      fog.near = 10
      fog.far = Math.min(fog.far, 110)
    }
    if (st.phase === 'creator') fog.far = 1e6
    void state
  })

  const shadowSize = quality === 'high' ? 4096 : 2048
  return (
    <>
      <fog attach="fog" args={['#bcd0e6', 60, 500]} />
      <Sky
        ref={sky as never}
        distance={4500}
        sunPosition={[100, 100, 50]}
        turbidity={6}
        rayleigh={1.5}
        mieCoefficient={0.004}
        mieDirectionalG={0.8}
      />
      <hemisphereLight ref={hemi} args={['#cfe4ff', '#4a4a40', 0.9]} />
      <directionalLight
        ref={sun}
        castShadow
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-camera-near={10}
        shadow-camera-far={320}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
      />
    </>
  )
}
