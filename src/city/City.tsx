import { useLayoutEffect, useMemo, useRef } from 'react'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import {
  BLOCK,
  CELL,
  CURB,
  HALF_WORLD,
  ROAD_MAX,
  ROAD_MIN,
  ROAD_W,
  blocks,
  buildings,
  lamps,
  trees,
} from './layout'
import { useGame } from '../store/game'

const EXTENT = HALF_WORLD + 10

/** Shared by every road mesh so the weather system can wet it. */
export const roadMat = new THREE.MeshStandardMaterial({ color: '#4a4d55', roughness: 0.9 })

export function nightFactor(hour: number) {
  const d = Math.abs(hour - 12)
  return THREE.MathUtils.smoothstep(d, 5.5, 7.5)
}

/** Standard material patched with a procedural window grid (from world coords), lit at night. */
function useBuildingMaterial() {
  return useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.05 })
    const uNight = { value: 0 }
    mat.userData.uNight = uNight
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = uNight
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nvarying vec3 vWN;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
          vWN = normalize(mat3(instanceMatrix) * normal);`,
        )
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vWP;
          varying vec3 vWN;
          uniform float uNight;
          float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            vec3 n = normalize(vWN);
            float side = step(abs(n.y), 0.5);
            float u = abs(n.x) > 0.5 ? vWP.z : vWP.x;
            vec2 g = vec2(u / 3.2, vWP.y / 3.6);
            vec2 f = fract(g);
            float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.25, f.y) * step(f.y, 0.78) * side * step(2.2, vWP.y);
            float lit = step(0.5, h21(floor(g) + floor(vWP.xz * 0.37)));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.12, 0.18), win);
            totalEmissiveRadiance += win * lit * uNight * vec3(1.0, 0.82, 0.5) * 1.4;
          }`,
        )
    }
    return mat
  }, [])
}

function Buildings() {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const mat = useBuildingMaterial()
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const c = new THREE.Color()
    const q = new THREE.Quaternion()
    buildings.forEach((b, i) => {
      m.compose(new THREE.Vector3(b.x, b.h / 2 + CURB, b.z), q, new THREE.Vector3(b.w, b.h, b.d))
      ref.current.setMatrixAt(i, m)
      c.setRGB(...b.color)
      ref.current.setColorAt(i, c)
    })
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
  }, [])
  useFrame(() => {
    mat.userData.uNight.value = nightFactor(useGame.getState().hour)
  })
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, buildings.length]}
      material={mat}
      castShadow
      receiveShadow
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  )
}

function Roads() {
  const dashes = useRef<THREE.InstancedMesh>(null!)
  const cross = useRef<THREE.InstancedMesh>(null!)
  const dashMax = (ROAD_MAX - ROAD_MIN + 1) * 2 * Math.ceil((2 * EXTENT) / 8)
  const crossMax = (ROAD_MAX - ROAD_MIN + 1) ** 2 * 4 * 7
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q0 = new THREE.Quaternion()
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
    let i = 0
    for (let k = ROAD_MIN; k <= ROAD_MAX; k++) {
      for (let p = -EXTENT + 4; p < EXTENT - 4; p += 8) {
        const r = (((p % CELL) + CELL) % CELL) // 0..80, intersections at 0/80
        if (r < ROAD_W / 2 + 2 || r > CELL - ROAD_W / 2 - 2) continue
        m.compose(new THREE.Vector3(p, 0.04, k * CELL), q0, new THREE.Vector3(3, 0.02, 0.25))
        dashes.current.setMatrixAt(i++, m)
        m.compose(new THREE.Vector3(k * CELL, 0.04, p), qy, new THREE.Vector3(3, 0.02, 0.25))
        dashes.current.setMatrixAt(i++, m)
      }
    }
    dashes.current.count = i
    dashes.current.instanceMatrix.needsUpdate = true

    let c = 0
    const off = ROAD_W / 2 + 2
    for (let a = ROAD_MIN; a <= ROAD_MAX; a++)
      for (let b = ROAD_MIN; b <= ROAD_MAX; b++) {
        const cx = a * CELL
        const cz = b * CELL
        for (let s = -3; s <= 3; s++) {
          const o = s * 2
          for (const side of [-1, 1]) {
            m.compose(new THREE.Vector3(cx + o, 0.045, cz + side * off), q0, new THREE.Vector3(0.9, 0.02, 3))
            cross.current.setMatrixAt(c++, m)
            m.compose(new THREE.Vector3(cx + side * off, 0.045, cz + o), q0, new THREE.Vector3(3, 0.02, 0.9))
            cross.current.setMatrixAt(c++, m)
          }
        }
      }
    cross.current.count = c
    cross.current.instanceMatrix.needsUpdate = true
  }, [])

  const roadLen = (ROAD_MAX - ROAD_MIN) * CELL + ROAD_W
  const roads = []
  for (let k = ROAD_MIN; k <= ROAD_MAX; k++) {
    roads.push(
      <mesh key={'h' + k} position={[0, 0.02, k * CELL]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[roadLen, ROAD_W]} />
        <primitive object={roadMat} attach="material" />
      </mesh>,
      <mesh key={'v' + k} position={[k * CELL, 0.021, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[ROAD_W, roadLen]} />
        <primitive object={roadMat} attach="material" />
      </mesh>,
    )
  }
  return (
    <group>
      {roads}
      <instancedMesh ref={dashes} args={[undefined, undefined, dashMax]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#e8d36a" roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={cross} args={[undefined, undefined, crossMax]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#e6e6e6" roughness={0.8} />
      </instancedMesh>
    </group>
  )
}

function Blocks() {
  const ref = useRef<THREE.InstancedMesh>(null!)
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const c = new THREE.Color()
    const q = new THREE.Quaternion()
    blocks.forEach((b, i) => {
      m.compose(new THREE.Vector3(b.cx, CURB / 2, b.cz), q, new THREE.Vector3(BLOCK, CURB, BLOCK))
      ref.current.setMatrixAt(i, m)
      c.set(b.district === 'park' ? '#4f7f3f' : '#9a9a96')
      ref.current.setColorAt(i, c)
    })
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.instanceColor!.needsUpdate = true
  }, [])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, blocks.length]} receiveShadow frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.95} />
    </instancedMesh>
  )
}

function Trees() {
  const trunk = useRef<THREE.InstancedMesh>(null!)
  const crown = useRef<THREE.InstancedMesh>(null!)
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const c = new THREE.Color()
    const q = new THREE.Quaternion()
    trees.forEach((t, i) => {
      const s = 0.8 + ((i * 37) % 10) / 20
      m.compose(new THREE.Vector3(t.x, 1.2 * s, t.z), q, new THREE.Vector3(s, s, s))
      trunk.current.setMatrixAt(i, m)
      m.compose(new THREE.Vector3(t.x, 3.6 * s, t.z), q, new THREE.Vector3(s, s, s))
      crown.current.setMatrixAt(i, m)
      c.setHSL(0.27 + ((i * 13) % 10) / 100, 0.5, 0.28 + ((i * 7) % 10) / 80)
      crown.current.setColorAt(i, c)
    })
    trunk.current.instanceMatrix.needsUpdate = true
    crown.current.instanceMatrix.needsUpdate = true
    crown.current.instanceColor!.needsUpdate = true
  }, [])
  return (
    <>
      <instancedMesh ref={trunk} args={[undefined, undefined, trees.length]} castShadow frustumCulled={false}>
        <cylinderGeometry args={[0.18, 0.28, 2.4, 6]} />
        <meshStandardMaterial color="#5a3d26" />
      </instancedMesh>
      <instancedMesh ref={crown} args={[undefined, undefined, trees.length]} castShadow frustumCulled={false}>
        <icosahedronGeometry args={[1.9, 1]} />
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
    </>
  )
}

function Streetlights() {
  const pole = useRef<THREE.InstancedMesh>(null!)
  const head = useRef<THREE.InstancedMesh>(null!)
  const headMat = useRef<THREE.MeshStandardMaterial>(null!)
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const one = new THREE.Vector3(1, 1, 1)
    lamps.forEach((l, i) => {
      m.compose(new THREE.Vector3(l.x, 3.5, l.z), q, one)
      pole.current.setMatrixAt(i, m)
      const dx = Math.cos(l.rot) * 0.9
      const dz = -Math.sin(l.rot) * 0.9
      m.compose(new THREE.Vector3(l.x + dx, 7.05, l.z + dz), q, new THREE.Vector3(1.4, 0.15, 0.6))
      head.current.setMatrixAt(i, m)
    })
    pole.current.instanceMatrix.needsUpdate = true
    head.current.instanceMatrix.needsUpdate = true
  }, [])
  useFrame(() => {
    headMat.current.emissiveIntensity = nightFactor(useGame.getState().hour) * 3
  })
  return (
    <>
      <instancedMesh ref={pole} args={[undefined, undefined, lamps.length]} castShadow frustumCulled={false}>
        <cylinderGeometry args={[0.08, 0.12, 7, 6]} />
        <meshStandardMaterial color="#3a3d42" metalness={0.5} roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={head} args={[undefined, undefined, lamps.length]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial ref={headMat} color="#dddddd" emissive="#ffd9a0" emissiveIntensity={0} />
      </instancedMesh>
    </>
  )
}

export default function City() {
  const colliders = useMemo(
    () =>
      buildings.map((b, i) => (
        <CuboidCollider key={i} args={[b.w / 2, b.h / 2, b.d / 2]} position={[b.x, b.h / 2, b.z]} />
      )),
    [],
  )
  const treeColliders = useMemo(
    () => trees.map((t, i) => <CuboidCollider key={'t' + i} args={[0.25, 2, 0.25]} position={[t.x, 2, t.z]} />),
    [],
  )
  const wall = EXTENT
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[EXTENT * 2 + 400, EXTENT * 2 + 400]} />
        <meshStandardMaterial color="#58704a" roughness={1} />
      </mesh>
      <Roads />
      <Blocks />
      <Buildings />
      <Trees />
      <Streetlights />
      <RigidBody type="fixed" colliders={false} friction={0.8}>
        <CuboidCollider args={[EXTENT + 200, 1, EXTENT + 200]} position={[0, -1, 0]} />
        {colliders}
        {treeColliders}
        <CuboidCollider args={[1, 20, wall]} position={[wall, 20, 0]} />
        <CuboidCollider args={[1, 20, wall]} position={[-wall, 20, 0]} />
        <CuboidCollider args={[wall, 20, 1]} position={[0, 20, wall]} />
        <CuboidCollider args={[wall, 20, 1]} position={[0, 20, -wall]} />
      </RigidBody>
    </>
  )
}
