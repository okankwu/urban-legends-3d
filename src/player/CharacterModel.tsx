import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { useGame } from '../store/game'
import { applyAccessories, captureRest } from '../characters/accessories'
import { applyTint, installTint } from '../characters/skinTint'
import type { TintUniforms } from '../characters/skinTint'
import { getCustomRig } from '../characters/customRig'
import { boneBy, makePoseClips } from '../characters/poses'

export interface AnimState {
  speed: number // horizontal m/s
  sprint: boolean
  crouch: boolean
  grounded: boolean
  seated: boolean
}

const MODEL_URLS = { 'meshy-a': import.meta.env.BASE_URL + 'models/player.glb', 'meshy-b': import.meta.env.BASE_URL + 'models/player2.glb' } as const
export const PLAYER_MODEL = MODEL_URLS['meshy-a']

export default function CharacterModel({ state }: { state: React.MutableRefObject<AnimState> }) {
  const appearance = useGame((s) => s.appearance)
  const customVersion = useGame((s) => s.customVersion)
  const custom = appearance.base === 'custom' ? getCustomRig() : null
  const url = appearance.base === 'meshy-b' ? MODEL_URLS['meshy-b'] : MODEL_URLS['meshy-a']
  const gltf = useGLTF(url)

  const scene = useMemo(() => {
    const s = cloneSkinned(custom ? custom.scene : gltf.scene) as THREE.Object3D
    s.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.castShadow = true
        m.frustumCulled = false
      }
    })
    return s
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltf.scene, custom, customVersion])

  const rest = useMemo(() => (custom ? null : captureRest(scene)), [scene, custom])
  const tints = useMemo<TintUniforms[]>(() => {
    if (custom) return []
    const out: TintUniforms[] = []
    scene.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
        const u = installTint(o as THREE.SkinnedMesh)
        if (u) out.push(u)
      }
    })
    return out
  }, [scene, custom])

  useEffect(
    () => () => {
      // the tint shader clones the material per instance; textures are shared, so only the materials are freed
      if (!custom) scene.traverse((o) => ((o as THREE.SkinnedMesh).isSkinnedMesh ? ((o as THREE.SkinnedMesh).material as THREE.Material).dispose() : undefined))
    },
    [scene, custom],
  )

  const mixer = useMemo(() => new THREE.AnimationMixer(scene), [scene])
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__char = { scene, mixer }
  const actions = useRef<Record<string, THREE.AnimationAction>>({})
  const current = useRef('')
  const hips = useMemo(() => (custom ? scene.getObjectByName(custom.hipsName) : boneBy(scene, 'Hips')), [scene, custom])
  const hipsBase = useMemo(() => hips?.position.clone(), [hips])
  const head = useMemo(() => (custom ? null : boneBy(scene, 'Head')), [scene, custom])

  useEffect(() => {
    const clips: Record<string, THREE.AnimationClip> = {}
    if (custom) for (const c of custom.clips) clips[c.name] = c
    else {
      for (const c of gltf.animations) clips[c.name] = c
      for (const c of makePoseClips(scene)) clips[c.name] = c
    }
    const acts: Record<string, THREE.AnimationAction> = {}
    for (const k of Object.keys(clips)) acts[k] = mixer.clipAction(clips[k])
    actions.current = acts
    current.current = ''
    play('Idle')
    return () => {
      mixer.stopAllAction()
      mixer.uncacheRoot(scene)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mixer, gltf.animations, scene, custom])

  // colours
  useEffect(() => {
    for (const u of tints) applyTint(u, appearance)
  }, [tints, appearance])

  // hair style props, glasses, cap, headphones, backpack (built-in models only)
  const accKey = [appearance.hairStyle, appearance.hairColor, appearance.glasses, appearance.cap, appearance.headphones, appearance.backpack, appearance.topColor].join('|')
  useEffect(() => {
    if (custom || !rest) return
    return applyAccessories(scene, rest, appearance)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, rest, custom, accKey])

  function play(name: string, fade = 0.2, timeScale = 1) {
    const next = actions.current[name]
    if (!next) return
    next.timeScale = timeScale
    if (current.current === name) return
    const prev = actions.current[current.current]
    next.reset().fadeIn(fade).play()
    prev?.fadeOut(fade)
    current.current = name
  }

  useFrame((_, dt) => {
    const s = state.current
    let name = 'Idle'
    let ts = 1
    if (s.seated) name = 'Seated'
    else if (!s.grounded) name = 'Jump'
    else if (s.crouch) name = 'Crouch'
    else if (s.speed > 6) {
      name = 'Running'
      ts = THREE.MathUtils.clamp(s.speed / 6.5, 0.8, 1.5)
    } else if (s.speed > 0.4) {
      name = 'Walking'
      ts = THREE.MathUtils.clamp(s.speed / 2.2, 0.6, 1.8)
    }
    play(name, name === 'Jump' ? 0.1 : 0.2, ts)
    mixer.update(dt)
    if (hips && hipsBase) {
      const drop = s.seated ? 0.45 : s.crouch ? 0.32 : 0
      if (drop > 0) hips.position.y = hipsBase.y - drop / (hips.parent ? hips.parent.getWorldScale(new THREE.Vector3()).y || 1 : 1)
    }
    if (head) head.scale.setScalar(appearance.headSize)
  })

  const h = appearance.height
  return (
    <group scale={[h, h, h]}>
      <primitive object={scene} />
    </group>
  )
}

useGLTF.preload(PLAYER_MODEL)
