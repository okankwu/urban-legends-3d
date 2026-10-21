import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { clone as cloneSkinned, retargetClip } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { makePoseClips } from './poses'

export const MAX_UPLOAD_MB = 60
export const TARGET_HEIGHT = 1.7

export class RigError extends Error {}

export interface CustomRig {
  scene: THREE.Group
  clips: THREE.AnimationClip[]
  fileName: string
  /** human-readable notes shown after a successful upload */
  report: string[]
  hipsName: string
}

/** Canonical (Mixamo-style) bone names the app animates. */
const REQUIRED = [
  'Hips', 'Spine', 'Neck', 'Head',
  'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm',
  'LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg',
]
const OPTIONAL = ['Spine1', 'Spine2', 'LeftShoulder', 'RightShoulder', 'LeftHand', 'RightHand', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase']

const VRM0: Record<string, string> = {
  hips: 'Hips', spine: 'Spine', chest: 'Spine1', upperChest: 'Spine2', neck: 'Neck', head: 'Head',
  leftShoulder: 'LeftShoulder', rightShoulder: 'RightShoulder',
  leftUpperArm: 'LeftArm', rightUpperArm: 'RightArm', leftLowerArm: 'LeftForeArm', rightLowerArm: 'RightForeArm',
  leftHand: 'LeftHand', rightHand: 'RightHand',
  leftUpperLeg: 'LeftUpLeg', rightUpperLeg: 'RightUpLeg', leftLowerLeg: 'LeftLeg', rightLowerLeg: 'RightLeg',
  leftFoot: 'LeftFoot', rightFoot: 'RightFoot', leftToes: 'LeftToeBase', rightToes: 'RightToeBase',
}

function sideOf(n: string): 'Left' | 'Right' | null {
  if (/left|(^|[^a-z])l([^a-z]|$)|_l_|\.l$|^l[_.\-]/i.test(n)) return 'Left'
  if (/right|(^|[^a-z])r([^a-z]|$)|_r_|\.r$|^r[_.\-]/i.test(n)) return 'Right'
  return null
}

/** Best-effort mapping of an arbitrary skeleton's bone name to a canonical humanoid bone. */
function canonicalFromName(raw: string): string | null {
  const n = raw.replace(/^(mixamorig:?|bip01|j_bip_[clr]_|cc_base_|def-?|c_)/i, '')
  const l = n.toLowerCase().replace(/[^a-z0-9._\-]/g, '')
  if (/thumb|index|middle|ring|pinky|finger|twist|end$|_end|helper|jaw|eye|tongue|hair|skirt|cloth|tail/.test(l)) {
    if (!/toe/.test(l)) return null
  }
  const side = sideOf(raw.replace(/^(mixamorig:?)/i, ''))
  if (/toe/.test(l)) return side ? `${side}ToeBase` : null
  if (/foot|ankle/.test(l)) return side ? `${side}Foot` : null
  if (/forearm|lowerarm|elbow/.test(l)) return side ? `${side}ForeArm` : null
  if (/upperarm|^arm|[._\-]arm$|^arm[._\-]|shoulderarm/.test(l) || (/arm/.test(l) && !/forearm|lowerarm|hand|shoulder|armor/.test(l)))
    return side ? `${side}Arm` : null
  if (/shoulder|clavicle/.test(l)) return side ? `${side}Shoulder` : null
  if (/hand|wrist/.test(l)) return side ? `${side}Hand` : null
  if (/upleg|upperleg|thigh/.test(l)) return side ? `${side}UpLeg` : null
  if (/lowerleg|calf|shin|^leg|[._\-]leg$|^leg[._\-]/.test(l) || /leg/.test(l)) return side ? `${side}Leg` : null
  if (/hips?$|pelvis|^root$/.test(l) || /hips?/.test(l)) return 'Hips'
  if (/neck/.test(l)) return 'Neck'
  if (/^head$|head$|^head/.test(l) && !/top|end/.test(l)) return 'Head'
  if (/spine|chest|torso/.test(l)) return 'SpineAny'
  return null
}

function mapBones(skeleton: THREE.Skeleton, json: Record<string, unknown>): { map: Record<string, THREE.Bone>; vrm: boolean } {
  const map: Record<string, THREE.Bone> = {}
  const bones = skeleton.bones
  const ext = (json.extensions ?? {}) as Record<string, any>
  let vrm = false
  // VRM 0.x declares humanoid bones by node *name* via the glTF node index
  const nodes = (json.nodes ?? []) as { name?: string }[]
  const humanBones0: { bone: string; node: number }[] | undefined = ext.VRM?.humanoid?.humanBones
  if (humanBones0) {
    vrm = true
    for (const hb of humanBones0) {
      const canon = VRM0[hb.bone]
      const nm = nodes[hb.node]?.name
      const bone = bones.find((b) => b.name === THREE.PropertyBinding.sanitizeNodeName(nm ?? ''))
      if (canon && bone) map[canon] = bone
    }
  }
  const hb1: Record<string, { node: number }> | undefined = ext.VRMC_vrm?.humanoid?.humanBones
  if (hb1) {
    vrm = true
    for (const [k, v] of Object.entries(hb1)) {
      const canon = VRM0[k]
      const nm = nodes[v.node]?.name
      const bone = bones.find((b) => b.name === THREE.PropertyBinding.sanitizeNodeName(nm ?? ''))
      if (canon && bone) map[canon] = bone
    }
  }
  if (Object.keys(map).length >= REQUIRED.length) return { map, vrm }

  // fall back to name heuristics
  const spines: THREE.Bone[] = []
  for (const b of bones) {
    const c = canonicalFromName(b.name)
    if (!c) continue
    if (c === 'SpineAny') spines.push(b)
    else if (!map[c]) map[c] = b
  }
  const depth = (o: THREE.Object3D) => {
    let d = 0
    for (let p = o.parent; p; p = p.parent) d++
    return d
  }
  spines.sort((a, b) => depth(a) - depth(b))
  ;['Spine', 'Spine1', 'Spine2'].forEach((k, i) => {
    if (!map[k] && spines[i]) map[k] = spines[i]
  })
  return { map, vrm }
}

let sourcePromise: Promise<{ scene: THREE.Group; clips: THREE.AnimationClip[] }> | null = null

/** The built-in Mixamo character (with generated pose clips) that clips are retargeted from. */
function loadSource() {
  sourcePromise ??= new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/player.glb').then((g) => {
    const scene = cloneSkinned(g.scene) as THREE.Group
    scene.updateMatrixWorld(true)
    const clips = [...g.animations, ...makePoseClips(scene)]
    return { scene, clips }
  })
  return sourcePromise
}

export async function buildCustomRig(buffer: ArrayBuffer, fileName: string): Promise<CustomRig> {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (!ext || !['glb', 'gltf', 'vrm'].includes(ext)) throw new RigError('Unsupported file type. Use .glb, .gltf (self-contained) or .vrm.')
  if (buffer.byteLength > MAX_UPLOAD_MB * 1024 * 1024) throw new RigError(`File is larger than ${MAX_UPLOAD_MB} MB. Decimate the mesh or compress textures first.`)

  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  const draco = new DRACOLoader().setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
  loader.setDRACOLoader(draco)
  let gltf
  try {
    gltf = await loader.parseAsync(buffer, '')
    draco.dispose()
  } catch (e) {
    draco.dispose()
    throw new RigError(
      `Could not read the model (${(e as Error).message || 'invalid file'}). .gltf files must embed their buffers and textures — export as .glb instead.`,
    )
  }

  const skinned: THREE.SkinnedMesh[] = []
  gltf.scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh)
  })
  if (!skinned.length) {
    throw new RigError(
      'This model has no skeleton (it is a static mesh). It must be a rigged humanoid: rig and skin it (e.g. Mixamo auto-rigger, Blender, or export from VRoid/Ready Player Me), then upload again. The game cannot animate an unrigged model.',
    )
  }
  const skeleton = skinned[0].skeleton
  const json = (gltf.parser.json ?? {}) as Record<string, unknown>
  const { map, vrm } = mapBones(skeleton, json)

  const missing = REQUIRED.filter((k) => !map[k])
  if (missing.length) {
    throw new RigError(
      `The skeleton is not a recognisable humanoid. Missing bones: ${missing.join(', ')}. Expected standard humanoid naming (Mixamo, VRM, Ready Player Me, Unreal/Blender "Rigify" style) with ${skeleton.bones.length} bones found.`,
    )
  }
  const report: string[] = [`${skeleton.bones.length} bones, ${skinned.length} skinned mesh(es), ${vrm ? 'VRM' : 'glTF'} humanoid detected.`]
  const optMissing = OPTIONAL.filter((k) => !map[k])
  if (optMissing.length) report.push(`Optional bones not found (animation still works): ${optMissing.join(', ')}.`)

  // normalise: face +Z, ~1.7 m tall, feet at y=0
  const scene = new THREE.Group()
  const model = gltf.scene
  const holder = new THREE.Group()
  holder.add(model)
  if (json.extensions && (json.extensions as Record<string, unknown>).VRM) holder.rotation.y = Math.PI // VRM 0.x faces -Z
  scene.add(holder)
  scene.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(scene, true)
  const height = box.max.y - box.min.y
  if (!(height > 0.05) || !isFinite(height)) throw new RigError('Model bounds are empty or invalid.')
  const s = TARGET_HEIGHT / height
  report.push(`Scaled ${height.toFixed(2)} m → ${TARGET_HEIGHT} m.`)
  holder.scale.setScalar(s)
  holder.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s)
  scene.updateMatrixWorld(true)

  // animations
  const src = await loadSource()
  const srcRoot = cloneSkinned(src.scene) as THREE.Group & { skeleton?: THREE.Skeleton }
  let srcMesh: THREE.SkinnedMesh | undefined
  srcRoot.traverse((o) => {
    if (!srcMesh && (o as THREE.SkinnedMesh).isSkinnedMesh) srcMesh = o as THREE.SkinnedMesh
  })
  srcRoot.skeleton = srcMesh!.skeleton
  srcRoot.updateMatrixWorld(true)

  const names: Record<string, string> = {}
  for (const [canon, bone] of Object.entries(map)) names[bone.name] = `mixamorig${canon}`
  const hipsName = map.Hips.name
  const srcHips = srcMesh!.skeleton.bones.find((b) => b.name === 'mixamorigHips')!
  const tgtHipsY = new THREE.Vector3().setFromMatrixPosition(map.Hips.matrixWorld).y
  const srcHipsY = new THREE.Vector3().setFromMatrixPosition(srcHips.matrixWorld).y
  const posScale = srcHipsY > 0 ? tgtHipsY / srcHipsY : 1

  const out: THREE.AnimationClip[] = []
  const own = gltf.animations
  if (own.length) report.push(`Model's own clips ignored in favour of the built-in set (${own.map((a) => a.name).join(', ')}).`)
  const target = skinned[0]
  for (const clip of src.clips) {
    try {
      const rc = retargetClip(target as unknown as THREE.Object3D, srcRoot, clip, {
        names,
        hip: 'mixamorigHips',
        scale: posScale,
        fps: 30,
        useFirstFramePosition: false,
      } as never)
      // convert ".bones[Name].prop" tracks into "Name.prop" so they bind from the scene root
      for (const t of rc.tracks) t.name = t.name.replace(/^\.bones\[(.+?)\]\./, '$1.')
      rc.name = clip.name
      out.push(rc)
    } catch (e) {
      report.push(`Could not retarget "${clip.name}": ${(e as Error).message}`)
    }
  }
  if (!out.length) throw new RigError('Animation retargeting failed for every clip; this rig cannot be animated.')
  const needed = ['Idle', 'Walking', 'Running']
  const lacking = needed.filter((n) => !out.find((c) => c.name === n))
  if (lacking.length) throw new RigError(`Retargeting failed for: ${lacking.join(', ')}.`)
  report.push(`Animations retargeted from the built-in Mixamo set: ${out.map((c) => c.name).join(', ')}.`)
  report.push('Retargeting assumes a T-pose or similar bind pose; A-pose models may show slightly raised/lowered arms.')

  scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) {
      m.castShadow = true
      m.frustumCulled = false
    }
  })
  return { scene, clips: out, fileName, report, hipsName }
}

// ---------- IndexedDB persistence of the uploaded file ----------
const DB = 'ul3d'
const STORE = 'files'

function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}

export async function saveCustomFile(buffer: ArrayBuffer, fileName: string) {
  const db = await openDb()
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put({ buffer, fileName }, 'character')
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
}

export async function loadCustomFile(): Promise<{ buffer: ArrayBuffer; fileName: string } | null> {
  try {
    const db = await openDb()
    return await new Promise((res, rej) => {
      const r = db.transaction(STORE).objectStore(STORE).get('character')
      r.onsuccess = () => res((r.result as { buffer: ArrayBuffer; fileName: string }) ?? null)
      r.onerror = () => rej(r.error)
    })
  } catch {
    return null
  }
}

// ---------- active custom rig ----------
let active: CustomRig | null = null
export const getCustomRig = () => active
export const setCustomRig = (r: CustomRig | null) => {
  active = r
}
