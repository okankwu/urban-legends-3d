import * as THREE from 'three'
import type { Appearance } from './appearance'
import { boneBy } from './poses'

export interface RestInfo {
  q: THREE.Quaternion // bone world rotation at bind pose
  s: number // bone world scale
  headHeight: number // head base -> top, meters
}
export type RestMap = { Head?: RestInfo; Spine2?: RestInfo }

/** Capture bind-pose bone frames. Call before any animation is applied. */
export function captureRest(scene: THREE.Object3D): RestMap {
  scene.updateMatrixWorld(true)
  const out: RestMap = {}
  const grab = (name: 'Head' | 'Spine2', headHeight = 0.23) => {
    const b = boneBy(scene, name)
    if (!b) return
    const q = new THREE.Quaternion()
    const s = new THREE.Vector3()
    b.matrixWorld.decompose(new THREE.Vector3(), q, s)
    out[name] = { q, s: s.y || 1, headHeight }
  }
  const head = boneBy(scene, 'Head')
  const top = boneBy(scene, 'HeadTop_End')
  let hh = 0.23
  if (head && top) {
    const a = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld)
    const b = new THREE.Vector3().setFromMatrixPosition(top.matrixWorld)
    hh = Math.max(0.12, a.distanceTo(b))
  }
  grab('Head', hh)
  grab('Spine2', hh)
  return out
}

const mat = (color: string, rough = 0.6, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })

/** Places `obj` so its axes match the scene axes at bind pose, offset (scene-space meters) from the bone origin. */
function attach(bone: THREE.Bone, rest: RestInfo, obj: THREE.Object3D, off: [number, number, number]) {
  const inv = rest.q.clone().invert()
  obj.quaternion.copy(inv)
  obj.scale.setScalar(1 / rest.s)
  obj.position.set(...off).applyQuaternion(inv).multiplyScalar(1 / rest.s)
  bone.add(obj)
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material) {
  const o = new THREE.Mesh(g, m)
  o.castShadow = true
  return o
}

/** Hair-style props, glasses, cap, headphones, backpack. Returns a disposer that removes them. */
export function applyAccessories(scene: THREE.Object3D, rest: RestMap, a: Appearance): () => void {
  const added: THREE.Object3D[] = []
  const head = boneBy(scene, 'Head')
  const spine = boneBy(scene, 'Spine2') ?? boneBy(scene, 'Spine1')
  const hr = rest.Head
  const sr = rest.Spine2
  const k = hr ? hr.headHeight / 0.23 : 1 // head size factor
  const add = (bone: THREE.Bone | undefined, r: RestInfo | undefined, o: THREE.Object3D, off: [number, number, number]) => {
    if (!bone || !r) return
    attach(bone, r, o, off)
    added.push(o)
  }

  const hairCol = a.hairColor || '#2a1d14'
  if (head && hr) {
    if (a.hairStyle === 'mohawk') {
      const g = new THREE.Group()
      for (let i = 0; i < 7; i++) {
        const t = i / 6
        const b = mesh(new THREE.BoxGeometry(0.022, 0.07 + 0.03 * Math.sin(t * Math.PI), 0.04), mat(hairCol, 0.9))
        b.position.set(0, 0.175 + 0.03 * Math.sin(t * Math.PI), 0.07 - t * 0.17)
        g.add(b)
      }
      g.scale.setScalar(k)
      add(head, hr, g, [0, 0, 0])
    } else if (a.hairStyle === 'long') {
      const g = new THREE.Group()
      const back = mesh(new THREE.CylinderGeometry(0.1, 0.075, 0.42, 14, 1, true, Math.PI * 0.35, Math.PI * 1.3), mat(hairCol, 0.9))
      back.material.side = THREE.DoubleSide
      back.position.set(0, -0.02, -0.02)
      g.add(back)
      const cap = mesh(new THREE.SphereGeometry(0.108, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(hairCol, 0.9))
      cap.position.set(0, 0.1, -0.005)
      g.add(cap)
      g.scale.setScalar(k)
      add(head, hr, g, [0, 0.03, 0])
    } else if (a.hairStyle === 'bun') {
      const g = new THREE.Group()
      const cap = mesh(new THREE.SphereGeometry(0.105, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(hairCol, 0.9))
      cap.position.set(0, 0.105, 0)
      g.add(cap)
      const bun = mesh(new THREE.SphereGeometry(0.055, 14, 12), mat(hairCol, 0.9))
      bun.position.set(0, 0.22, -0.07)
      g.add(bun)
      g.scale.setScalar(k)
      add(head, hr, g, [0, 0.03, 0])
    } else if (a.hairStyle === 'afro') {
      const g = new THREE.Group()
      const af = mesh(new THREE.SphereGeometry(0.17, 18, 14), mat(hairCol, 1))
      af.scale.set(1, 0.9, 1)
      af.position.set(0, 0.15, -0.015)
      g.add(af)
      g.scale.setScalar(k)
      add(head, hr, g, [0, 0.02, 0])
    }

    if (a.glasses) {
      const g = new THREE.Group()
      const frame = mat('#0c0c10', 0.3, 0.4)
      for (const sx of [-1, 1]) {
        const ring = mesh(new THREE.TorusGeometry(0.032, 0.004, 8, 20), frame)
        ring.position.set(sx * 0.04, 0.085, 0.098)
        g.add(ring)
        const lens = new THREE.Mesh(
          new THREE.CircleGeometry(0.031, 20),
          new THREE.MeshStandardMaterial({ color: '#223', transparent: true, opacity: 0.35, roughness: 0.1 }),
        )
        lens.position.set(sx * 0.04, 0.085, 0.098)
        g.add(lens)
        const arm = mesh(new THREE.BoxGeometry(0.004, 0.004, 0.17), frame)
        arm.position.set(sx * 0.073, 0.085, 0.012)
        g.add(arm)
      }
      const bridge = mesh(new THREE.BoxGeometry(0.02, 0.004, 0.004), frame)
      bridge.position.set(0, 0.088, 0.098)
      g.add(bridge)
      g.scale.setScalar(k)
      add(head, hr, g, [0, 0, 0])
    }

    if (a.cap) {
      const g = new THREE.Group()
      const col = a.topColor || '#1f2937'
      const crown = mesh(new THREE.SphereGeometry(0.113, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(col, 0.8))
      crown.position.set(0, 0.145, -0.004)
      g.add(crown)
      const brim = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.008, 18, 1, false, -Math.PI * 0.5, Math.PI), mat(col, 0.8))
      brim.scale.set(1, 1, 1.15)
      brim.position.set(0, 0.147, 0.075)
      brim.rotation.y = Math.PI * 0.0
      brim.rotation.x = -0.1
      g.add(brim)
      g.scale.setScalar(k)
      add(head, hr, g, [0, 0, 0])
    }

    if (a.headphones) {
      const g = new THREE.Group()
      const m = mat('#16161a', 0.4, 0.3)
      const band = mesh(new THREE.TorusGeometry(0.118, 0.008, 8, 24, Math.PI), m)
      band.position.set(0, 0.105, -0.005)
      g.add(band)
      for (const sx of [-1, 1]) {
        const cup = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 16), mat('#2b2d33', 0.5, 0.2))
        cup.rotation.z = Math.PI / 2
        cup.position.set(sx * 0.12, 0.105, -0.005)
        g.add(cup)
      }
      g.scale.setScalar(k)
      add(head, hr, g, [0, 0, 0])
    }
  }

  if (a.backpack && spine && sr) {
    const g = new THREE.Group()
    const body = mesh(new THREE.BoxGeometry(0.28, 0.38, 0.14), mat('#334155', 0.8))
    body.position.set(0, 0.02, -0.17)
    g.add(body)
    const pocket = mesh(new THREE.BoxGeometry(0.2, 0.14, 0.05), mat('#1e293b', 0.8))
    pocket.position.set(0, -0.08, -0.265)
    g.add(pocket)
    add(spine, sr, g, [0, 0.0, 0])
  }

  return () => {
    for (const o of added) {
      o.removeFromParent()
      o.traverse((c) => {
        const m = c as THREE.Mesh
        if (m.isMesh) {
          m.geometry.dispose()
          ;(m.material as THREE.Material).dispose()
        }
      })
    }
  }
}
