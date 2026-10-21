import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { rt } from '../engine/runtime'
import { useGame } from '../store/game'
import type { Weather as W } from '../store/game'
import { roadMat } from './City'
import { thunder } from '../engine/audio'
import { caption } from '../ui/captions'

const TARGET: Record<W, { rain: number; gray: number; wet: number }> = {
  clear: { rain: 0, gray: 0, wet: 0 },
  cloudy: { rain: 0, gray: 0.5, wet: 0 },
  rain: { rain: 0.8, gray: 0.8, wet: 0.9 },
  storm: { rain: 1, gray: 1, wet: 1 },
  fog: { rain: 0, gray: 0.6, wet: 0.25 },
}
const NEXT: [W, number][] = [
  ['clear', 45],
  ['cloudy', 25],
  ['rain', 15],
  ['fog', 8],
  ['storm', 7],
]
const DROPS = 3200
const BOX = 60
const HEIGHT = 40

const ROAD_DRY = new THREE.Color('#4a4d55')
const ROAD_WET = new THREE.Color('#25282e')

/** Weather state machine, wet roads, rain particles and lightning. */
export default function Weather() {
  const { camera } = useThree()
  const mat = useRef<THREE.ShaderMaterial>(null!)
  const timer = useRef(120 + Math.random() * 120)
  const lightning = useRef(8)
  const last = useRef<W>('clear')
  const wetNow = useRef(0)

  const geo = useMemo(() => {
    const pos = new Float32Array(DROPS * 2 * 3)
    const end = new Float32Array(DROPS * 2)
    const seed = new Float32Array(DROPS * 2)
    for (let i = 0; i < DROPS; i++) {
      const x = Math.random() * BOX
      const y = Math.random() * HEIGHT
      const z = Math.random() * BOX
      const s = Math.random()
      pos.set([x, y, z, x, y, z], i * 6)
      end.set([0, 1], i * 2)
      seed.set([s, s], i * 2)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    return g
  }, [])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uAmount: { value: 0 } },
        vertexShader: `
          attribute float aEnd; attribute float aSeed;
          uniform float uTime; uniform vec3 uCenter; uniform float uAmount;
          varying float vA;
          void main(){
            vec3 p = position;
            float speed = 26.0 + aSeed * 10.0;
            p.y = mod(p.y - uTime * speed, ${HEIGHT.toFixed(1)});
            p.x += (${HEIGHT.toFixed(1)} - p.y) * 0.08;      // light wind slant
            vec2 rel = mod(p.xz - uCenter.xz + ${(BOX / 2).toFixed(1)}, ${BOX.toFixed(1)}) - ${(BOX / 2).toFixed(1)};
            vec3 w = vec3(uCenter.x + rel.x, uCenter.y - 10.0 + p.y, uCenter.z + rel.y);
            w.y += aEnd * 0.9;
            w.x += aEnd * 0.07;
            vA = step(aSeed, uAmount) * (0.55 - aEnd * 0.4);
            gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
          }`,
        fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(0.78, 0.85, 0.95, vA); }`,
      }),
    [],
  )

  useFrame((state, dt) => {
    const st = useGame.getState()
    if (st.phase === 'creator') return
    const d = Math.min(dt, 0.1)
    // schedule weather changes while playing
    if (st.phase === 'playing') {
      timer.current -= d
      if (timer.current <= 0) {
        timer.current = 150 + Math.random() * 200
        const total = NEXT.reduce((a, n) => a + n[1], 0)
        let r = Math.random() * total
        let pick: W = 'clear'
        for (const [w, wt] of NEXT) {
          r -= wt
          if (r <= 0) {
            pick = w
            break
          }
        }
        st.set({ weather: pick })
      }
    }
    const tgt = TARGET[st.weather]
    const ease = (a: number, b: number, up: number, down: number) => a + THREE.MathUtils.clamp(b - a, -down * d, up * d)
    rt.rain = ease(rt.rain, tgt.rain, 0.15, 0.2)
    rt.gray = ease(rt.gray, tgt.gray, 0.1, 0.1)
    wetNow.current = ease(wetNow.current, tgt.wet, 0.06, 0.012)
    const wet = wetNow.current
    if (Math.abs(wet - st.wetness) > 0.02 || (wet === 0 && st.wetness !== 0)) st.set({ wetness: wet })

    // wet asphalt
    roadMat.roughness = THREE.MathUtils.lerp(0.9, 0.2, wet)
    roadMat.metalness = wet * 0.3
    roadMat.color.copy(ROAD_DRY).lerp(ROAD_WET, wet)

    // lightning in storms
    rt.flash = Math.max(0, rt.flash - d * 4)
    if (st.weather === 'storm' && st.phase === 'playing') {
      lightning.current -= d
      if (lightning.current <= 0) {
        lightning.current = 5 + Math.random() * 9
        rt.flash = st.reduceMotion ? 0 : 1
        const delay = 0.8 + Math.random() * 2.2
        thunder(delay)
        window.setTimeout(() => caption('[Thunder]', 2200), delay * 1000)
      }
    }
    if (last.current !== st.weather) last.current = st.weather

    mat.current.uniforms.uTime.value = state.clock.elapsedTime
    mat.current.uniforms.uCenter.value.copy(camera.position)
    mat.current.uniforms.uAmount.value = st.reduceMotion ? rt.rain * 0.35 : rt.rain
    mat.current.visible = rt.rain > 0.02 && !st.inShop
  })

  return (
    <lineSegments geometry={geo} frustumCulled={false} renderOrder={5}>
      <primitive object={material} ref={mat} attach="material" />
    </lineSegments>
  )
}
