import * as THREE from 'three'
import type { Appearance } from './appearance'

/**
 * The Meshy character is a single mesh with one baked texture, so clothes/skin/hair are recoloured
 * in the shader. Regions come from skin weights (which bones drive a vertex) plus the head position.
 * Per-vertex attributes: aRegion = (top, pants, shoes, skin), aHair = hair weight.
 */

const TOP = /^(Spine|Spine1|Spine2|LeftShoulder|RightShoulder|LeftArm|RightArm|LeftForeArm|RightForeArm)$/
const PANTS = /^(Hips|LeftUpLeg|RightUpLeg|LeftLeg|RightLeg)$/
const SHOES = /^(LeftFoot|RightFoot|LeftToeBase|RightToeBase|LeftToe_End|RightToe_End)$/
const SKIN = /^(Head|HeadTop_End|Neck|headfront|(Left|Right)Hand.*)$/

const short = (n: string) => n.replace(/^mixamorig:?/, '')

interface RegionInfo {
  avg: { top: number; pants: number; shoes: number; skin: number; hair: number }
}

const lumOf = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b
const srgbToLin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))

export function isSkinLike(r: number, g: number, b: number) {
  return r > g && g > b && r - b > 0.05 && lumOf(r, g, b) > 0.06
}

export function ensureRegions(mesh: THREE.SkinnedMesh): RegionInfo | null {
  const geo = mesh.geometry
  if (geo.userData.regionInfo) return geo.userData.regionInfo as RegionInfo
  const skinIndex = geo.getAttribute('skinIndex')
  const skinWeight = geo.getAttribute('skinWeight')
  const pos = geo.getAttribute('position')
  if (!skinIndex || !skinWeight) return null
  const bones = mesh.skeleton.bones
  const group: number[] = bones.map((b) => {
    const n = short(b.name)
    if (SKIN.test(n)) return 3
    if (SHOES.test(n)) return 2
    if (PANTS.test(n)) return 1
    if (TOP.test(n)) return 0
    return -1
  })
  const n = pos.count
  const region = new Float32Array(n * 4)
  const hair = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 4; k++) {
      const g = group[skinIndex.getComponent(i, k)]
      if (g >= 0) region[i * 4 + g] += skinWeight.getComponent(i, k)
    }
    // jackets/hoodies hang over the hips: treat anything above the hem as "top" rather than "pants"
    const yy = pos.getY(i)
    const tp = THREE.MathUtils.smoothstep(yy, 0.8, 0.88)
    region[i * 4] += region[i * 4 + 1] * tp
    region[i * 4 + 1] *= 1 - tp
    // hair: head-driven vertices high on the skull; lower threshold toward the back of the head
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const thr = THREE.MathUtils.lerp(1.5, 1.645, THREE.MathUtils.smoothstep(z, -0.02, 0.08))
    hair[i] = region[i * 4 + 3] * THREE.MathUtils.smoothstep(y, thr, thr + 0.03)
  }
  geo.setAttribute('aRegion', new THREE.BufferAttribute(region, 4))
  geo.setAttribute('aHair', new THREE.BufferAttribute(hair, 1))

  // average texel luminance per region so recolouring keeps the original relative shading
  const avg = { top: 0.1, pants: 0.05, shoes: 0.3, skin: 0.3, hair: 0.05 }
  const map = (mesh.material as THREE.MeshStandardMaterial).map
  const uv = geo.getAttribute('uv')
  const img = map?.image as CanvasImageSource & { width: number; height: number }
  if (img && uv) {
    try {
      const W = Math.min(512, img.width)
      const H = Math.min(512, img.height)
      const cv = document.createElement('canvas')
      cv.width = W
      cv.height = H
      const ctx = cv.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0, W, H)
      const data = ctx.getImageData(0, 0, W, H).data
      const sum = { top: 0, pants: 0, shoes: 0, skin: 0, hair: 0 }
      const cnt = { top: 0, pants: 0, shoes: 0, skin: 0, hair: 0 }
      for (let i = 0; i < n; i += 2) {
        const px = Math.min(W - 1, Math.max(0, Math.floor(uv.getX(i) * W)))
        const py = Math.min(H - 1, Math.max(0, Math.floor(uv.getY(i) * H)))
        const o = (py * W + px) * 4
        const r = srgbToLin(data[o] / 255)
        const g = srgbToLin(data[o + 1] / 255)
        const b = srgbToLin(data[o + 2] / 255)
        const l = lumOf(r, g, b)
        const rg = region.subarray(i * 4, i * 4 + 4)
        if (hair[i] > 0.5 && !isSkinLike(r, g, b)) {
          sum.hair += l
          cnt.hair++
        } else if (rg[3] > 0.6 && isSkinLike(r, g, b)) {
          sum.skin += l
          cnt.skin++
        } else if (rg[0] > 0.8) {
          sum.top += l
          cnt.top++
        } else if (rg[1] > 0.8) {
          sum.pants += l
          cnt.pants++
        } else if (rg[2] > 0.8) {
          sum.shoes += l
          cnt.shoes++
        }
      }
      for (const k of Object.keys(sum) as (keyof typeof sum)[]) if (cnt[k] > 5) avg[k] = Math.max(0.01, sum[k] / cnt[k])
    } catch {
      /* tainted or unreadable image: keep defaults */
    }
  }
  const info: RegionInfo = { avg }
  geo.userData.regionInfo = info
  return info
}

export interface TintUniforms {
  uSkin: { value: THREE.Color }
  uHairC: { value: THREE.Color }
  uTopC: { value: THREE.Color }
  uPantsC: { value: THREE.Color }
  uShoesC: { value: THREE.Color }
  uAmt: { value: THREE.Vector4 } // top, pants, shoes, skin
  uHairAmt: { value: number }
  uAvg: { value: THREE.Vector4 } // top, pants, shoes, skin
  uAvgHair: { value: number }
}

/** Clones the mesh material and injects the region recolouring shader. Returns the uniforms. */
export function installTint(mesh: THREE.SkinnedMesh): TintUniforms | null {
  const info = ensureRegions(mesh)
  if (!info) return null
  const mat = (mesh.material as THREE.MeshStandardMaterial).clone()
  mesh.material = mat
  const u: TintUniforms = {
    uSkin: { value: new THREE.Color() },
    uHairC: { value: new THREE.Color() },
    uTopC: { value: new THREE.Color() },
    uPantsC: { value: new THREE.Color() },
    uShoesC: { value: new THREE.Color() },
    uAmt: { value: new THREE.Vector4(0, 0, 0, 0) },
    uHairAmt: { value: 0 },
    uAvg: { value: new THREE.Vector4(info.avg.top, info.avg.pants, info.avg.shoes, info.avg.skin) },
    uAvgHair: { value: info.avg.hair },
  }
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u)
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec4 aRegion;\nattribute float aHair;\nvarying vec4 vRegion;\nvarying float vHair;',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRegion = aRegion;\nvHair = aHair;')
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec4 vRegion;
        varying float vHair;
        uniform vec3 uSkin, uHairC, uTopC, uPantsC, uShoesC;
        uniform vec4 uAmt, uAvg;
        uniform float uHairAmt, uAvgHair;
        float lumA(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
        vec3 recolor(vec3 c, vec3 tint, float avg){
          float shade = clamp(lumA(c) / max(avg, 0.01), 0.35, 1.9);
          return tint * shade;
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec3 c = diffuseColor.rgb;
          float skinLike = step(c.g, c.r) * step(c.b, c.g) * step(0.05, c.r - c.b) * step(0.06, lumA(c));
          float wTop = clamp(vRegion.x, 0.0, 1.0) * uAmt.x;
          float wPants = clamp(vRegion.y, 0.0, 1.0) * uAmt.y;
          float wShoes = clamp(vRegion.z, 0.0, 1.0) * uAmt.z;
          float wSkin = clamp(vRegion.w, 0.0, 1.0) * uAmt.w * skinLike;
          float wHair = clamp(vHair, 0.0, 1.0) * uHairAmt * (1.0 - skinLike);
          vec3 o = c;
          o = mix(o, recolor(c, uTopC, uAvg.x), wTop);
          o = mix(o, recolor(c, uPantsC, uAvg.y), wPants);
          o = mix(o, recolor(c, uShoesC, uAvg.z), wShoes);
          o = mix(o, recolor(c, uSkin, uAvg.w), wSkin);
          o = mix(o, recolor(c, uHairC, uAvgHair), wHair);
          diffuseColor.rgb = o;
        }`,
      )
  }
  mat.customProgramCacheKey = () => 'appearance-tint'
  mat.needsUpdate = true
  return u
}

export function applyTint(u: TintUniforms, a: Appearance) {
  const set = (col: THREE.Color, hex: string) => hex && col.set(hex)
  set(u.uSkin.value, a.skin)
  set(u.uHairC.value, a.hairColor)
  set(u.uTopC.value, a.topColor)
  set(u.uPantsC.value, a.pantsColor)
  set(u.uShoesC.value, a.shoesColor)
  u.uAmt.value.set(a.topColor ? 1 : 0, a.pantsColor ? 1 : 0, a.shoesColor ? 1 : 0, a.skin ? 1 : 0)
  u.uHairAmt.value = a.hairColor ? 1 : 0
}
