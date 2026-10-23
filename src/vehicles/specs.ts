import * as THREE from 'three'

export type VehicleId = 'subaru' | 'apex' | 'sedan' | 'suv' | 'pickup' | 'van' | 'bike'

export interface Prepared {
  root: THREE.Group
  wheels: { hub: THREE.Group; steer: THREE.Group; spin: THREE.Group; front: boolean; cx: number; cy: number; cz: number }[]
  radius: number
  halfW: number
  halfL: number
  /** collider bottom/top in chassis space */
  bottom: number
  top: number
  /** wheel-centre height in chassis space */
  wheelCy: number
  /** materials recoloured by the paint shop */
  paint: THREE.MeshStandardMaterial[]
  /** brake/head/indicator light positions (chassis space) */
  lightY: number
  isBike?: boolean
  /** driver's eye position and dash geometry in chassis space (cockpit camera + dashboard) */
  cockpit?: { eye: [number, number, number]; belt: number; zFront: number; /** rear of the cabin; when set the dash module lays a dark interior floor over the body's top face */ zBack?: number; noDash?: boolean }
}

export interface VehicleSpec {
  id: VehicleId
  name: string
  cls: string
  price: number
  /** unlock needed before it can be bought */
  locked?: string
  mass: number
  engine: number
  maxSpeed: number
  reverseMax: number
  steer: number
  grip: number
  defaultColor: string
  blurb: string
}

export const SPECS: VehicleSpec[] = [
  { id: 'subaru', name: 'Impreza STi', cls: 'Rally coupe', price: 0, mass: 1400, engine: 4200, maxSpeed: 52, reverseMax: 12, steer: 0.55, grip: 11, defaultColor: '#1f3f9a', blurb: 'The blue Subaru you started with. Quick and grippy.' },
  { id: 'sedan', name: 'Civic Sedan', cls: 'Sedan', price: 4500, mass: 1500, engine: 3700, maxSpeed: 42, reverseMax: 11, steer: 0.55, grip: 10, defaultColor: '#b3201f', blurb: 'Reliable family sedan.' },
  { id: 'suv', name: 'Ranger SUV', cls: 'SUV', price: 9000, mass: 2000, engine: 4600, maxSpeed: 40, reverseMax: 11, steer: 0.5, grip: 10, defaultColor: '#2f5d3a', blurb: 'Tall, heavy and hard to stop.' },
  { id: 'pickup', name: 'Bison Pickup', cls: 'Pickup truck', price: 8000, mass: 2100, engine: 4700, maxSpeed: 40, reverseMax: 11, steer: 0.5, grip: 9.5, defaultColor: '#d8a31b', blurb: 'Open bed, big engine.' },
  { id: 'van', name: 'Carrier Van', cls: 'Delivery van', price: 7000, mass: 2400, engine: 4300, maxSpeed: 34, reverseMax: 10, steer: 0.48, grip: 9, defaultColor: '#e8e8e8', blurb: 'Slow, roomy delivery van.' },
  { id: 'bike', name: 'Falcon 600', cls: 'Motorcycle', price: 6000, mass: 300, engine: 1200, maxSpeed: 55, reverseMax: 6, steer: 0.5, grip: 9, defaultColor: '#c0392b', blurb: 'Light and fast. Hard to keep upright.' },
  { id: 'apex', name: 'Apex GT', cls: 'Sports car', price: 28000, locked: 'sports-vehicles', mass: 1300, engine: 5400, maxSpeed: 66, reverseMax: 12, steer: 0.5, grip: 13, defaultColor: '#e8a31b', blurb: 'Low, wide and very fast.' },
]
export const spec = (id: string) => SPECS.find((s) => s.id === id) ?? SPECS[0]

export const PAINTS = ['#b3201f', '#e8e8e8', '#202226', '#2c5aa8', '#d8a31b', '#3a7d44', '#7a7f87', '#e86f1c', '#6a2c91', '#e0558f']

const dark = () => new THREE.MeshStandardMaterial({ color: '#12151a', roughness: 0.2, metalness: 0.6 })
const rubber = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.9 })
const rim = new THREE.MeshStandardMaterial({ color: '#b9bec7', roughness: 0.3, metalness: 0.8 })

function box(w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, parent: THREE.Object3D) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  parent.add(mesh)
  return mesh
}

function addWheel(root: THREE.Group, out: Prepared['wheels'], x: number, y: number, z: number, r: number, w: number, front: boolean) {
  const hub = new THREE.Group()
  hub.position.set(x, y, z)
  const steer = new THREE.Group()
  const spin = new THREE.Group()
  hub.add(steer)
  steer.add(spin)
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 16), rubber)
  tyre.rotation.z = Math.PI / 2
  tyre.castShadow = true
  spin.add(tyre)
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.6, w + 0.02, 10), rim)
  cap.rotation.z = Math.PI / 2
  spin.add(cap)
  // a spoke bar so rotation is visible
  const spoke = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, r * 1.2, 0.05), rubber)
  spin.add(spoke)
  root.add(hub)
  out.push({ hub, steer, spin, front, cx: x, cy: y, cz: z })
}

interface CarDims {
  L: number
  W: number
  r: number
  zF: number
  zR: number
  track: number
  cy: number
  clearance: number
  hBody: number
  cabinH: number
  cabinL: number
  cabinZ: number
}

/** Driver eye and dash placement derived from the body dimensions (left-hand drive: the driver is on +x). */
function cockpitFor(d: CarDims, kind: string, belt: number): NonNullable<Prepared['cockpit']> {
  const zFront = kind === 'van' ? d.L / 2 - 0.4 : d.cabinZ + d.cabinL / 2
  const zBack = kind === 'van' ? -d.L / 2 + 0.1 : d.cabinZ - d.cabinL / 2
  return { eye: [Math.min(0.38, d.W * 0.2), belt + (kind === 'apex' ? 0.36 : 0.3), zFront - 1.05], belt, zFront, zBack }
}

function carShell(d: CarDims, color: string, kind: 'sedan' | 'suv' | 'pickup' | 'van' | 'apex'): Prepared {
  const root = new THREE.Group()
  const paintMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 })
  const glass = dark()
  const ground = d.cy - d.r
  const yBodyBottom = ground + d.clearance
  const yBody = yBodyBottom + d.hBody / 2
  const wheels: Prepared['wheels'] = []

  if (kind === 'van') {
    box(d.W, d.hBody + d.cabinH, d.L, 0, yBodyBottom + (d.hBody + d.cabinH) / 2, 0, paintMat, root)
    // windscreen: a one-sided plane facing forward, so it is dark from outside but see-through from the driver's seat
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(d.W - 0.1, d.cabinH * 0.55), glass)
    ws.position.set(0, yBodyBottom + d.hBody + d.cabinH * 0.35, d.L / 2 - 0.4 + 0.035)
    root.add(ws)
    box(d.W + 0.01, 0.1, d.L * 0.98, 0, yBodyBottom + 0.1, 0, glass, root)
  } else if (kind === 'pickup') {
    box(d.W, d.hBody, d.L, 0, yBody, 0, paintMat, root)
    box(d.W - 0.1, d.cabinH, d.cabinL, 0, yBodyBottom + d.hBody + d.cabinH / 2, d.cabinZ, paintMat, root)
    box(d.W - 0.05, d.cabinH * 0.55, d.cabinL - 0.05, 0, yBodyBottom + d.hBody + d.cabinH * 0.55, d.cabinZ, glass, root)
    // open bed: darker floor + walls
    const bed = new THREE.MeshStandardMaterial({ color: '#2a2d33', roughness: 0.8 })
    box(d.W - 0.2, 0.05, 1.9, 0, yBodyBottom + d.hBody + 0.03, -d.L / 2 + 1.1, bed, root)
    box(0.08, 0.35, 1.9, d.W / 2 - 0.05, yBodyBottom + d.hBody + 0.2, -d.L / 2 + 1.1, paintMat, root)
    box(0.08, 0.35, 1.9, -d.W / 2 + 0.05, yBodyBottom + d.hBody + 0.2, -d.L / 2 + 1.1, paintMat, root)
    box(d.W - 0.1, 0.35, 0.08, 0, yBodyBottom + d.hBody + 0.2, -d.L / 2 + 0.1, paintMat, root)
  } else {
    box(d.W, d.hBody, d.L, 0, yBody, 0, paintMat, root)
    box(d.W - 0.14, d.cabinH, d.cabinL, 0, yBodyBottom + d.hBody + d.cabinH / 2, d.cabinZ, paintMat, root)
    box(d.W - 0.1, d.cabinH * 0.6, d.cabinL - 0.04, 0, yBodyBottom + d.hBody + d.cabinH * 0.55, d.cabinZ, glass, root)
    if (kind === 'apex') box(d.W * 0.95, 0.06, 0.5, 0, yBodyBottom + d.hBody + 0.35, -d.L / 2 + 0.15, paintMat, root) // wing
  }
  const x = d.track
  for (const sx of [-1, 1]) {
    addWheel(root, wheels, sx * x, d.cy, d.zF, d.r, 0.26, true)
  }
  for (const sx of [-1, 1]) addWheel(root, wheels, sx * x, d.cy, d.zR, d.r, 0.28, false)
  // wheels array order: front-left? (x=-track first) fronts then rears
  const top = yBodyBottom + d.hBody + (kind === 'van' ? d.cabinH : d.cabinH)
  return {
    root,
    wheels,
    radius: d.r,
    halfW: d.W / 2,
    halfL: d.L / 2,
    bottom: yBodyBottom + 0.05,
    top,
    wheelCy: d.cy,
    paint: [paintMat],
    lightY: yBodyBottom + d.hBody * 0.65,
    cockpit: cockpitFor(d, kind, yBodyBottom + d.hBody),
  }
}

function bike(color: string): Prepared {
  const root = new THREE.Group()
  const paintMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 })
  const metal = new THREE.MeshStandardMaterial({ color: '#2b2d33', roughness: 0.5, metalness: 0.6 })
  const cy = -0.1
  const r = 0.32
  const wheels: Prepared['wheels'] = []
  // each physical wheel pair forms one visible wheel (two thin halves)
  for (const z of [0.72, -0.72]) for (const sx of [-1, 1]) addWheel(root, wheels, sx * 0.07, cy, z, r, 0.1, z > 0)
  box(0.22, 0.28, 0.9, 0, cy + 0.45, 0.05, paintMat, root) // tank
  box(0.2, 0.12, 0.8, 0, cy + 0.38, -0.55, metal, root) // seat base
  box(0.22, 0.08, 0.55, 0, cy + 0.55, -0.5, new THREE.MeshStandardMaterial({ color: '#111' }), root) // seat
  box(0.1, 0.55, 0.1, 0, cy + 0.4, 0.62, metal, root) // fork
  box(0.7, 0.05, 0.05, 0, cy + 0.72, 0.58, metal, root) // handlebar
  box(0.26, 0.3, 0.3, 0, cy + 0.2, 0.0, metal, root) // engine
  return {
    root,
    wheels,
    radius: r,
    halfW: 0.25,
    halfL: 1.1,
    bottom: cy - r + 0.2,
    top: cy + 0.9,
    wheelCy: cy,
    paint: [paintMat],
    lightY: cy + 0.45,
    isBike: true,
    cockpit: { eye: [0, cy + 1.2, -0.35], belt: cy + 0.7, zFront: 0.4, noDash: true },
  }
}

export function buildProcedural(id: VehicleId, color: string): Prepared | null {
  switch (id) {
    case 'sedan':
      return carShell({ L: 4.6, W: 1.82, r: 0.34, zF: 1.4, zR: -1.4, track: 0.82, cy: -0.3, clearance: 0.3, hBody: 0.62, cabinH: 0.55, cabinL: 2.2, cabinZ: -0.2 }, color, 'sedan')
    case 'suv':
      return carShell({ L: 4.8, W: 1.95, r: 0.42, zF: 1.5, zR: -1.45, track: 0.9, cy: -0.4, clearance: 0.45, hBody: 0.85, cabinH: 0.7, cabinL: 2.9, cabinZ: -0.35 }, color, 'suv')
    case 'pickup':
      return carShell({ L: 5.3, W: 1.95, r: 0.42, zF: 1.7, zR: -1.65, track: 0.9, cy: -0.4, clearance: 0.45, hBody: 0.8, cabinH: 0.7, cabinL: 1.8, cabinZ: 0.55 }, color, 'pickup')
    case 'van':
      return carShell({ L: 5.2, W: 2.0, r: 0.4, zF: 1.7, zR: -1.65, track: 0.92, cy: -0.55, clearance: 0.4, hBody: 1.0, cabinH: 0.9, cabinL: 5.0, cabinZ: 0 }, color, 'van')
    case 'apex':
      return carShell({ L: 4.5, W: 1.95, r: 0.33, zF: 1.35, zR: -1.35, track: 0.9, cy: -0.25, clearance: 0.16, hBody: 0.5, cabinH: 0.42, cabinL: 1.7, cabinZ: -0.15 }, color, 'apex')
    case 'bike':
      return bike(color)
    default:
      return null
  }
}
