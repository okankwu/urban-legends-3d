/** Deterministic procedural city layout. All units are meters. */
export const CELL = 80
export const ROAD_W = 16
export const BLOCK = CELL - ROAD_W // 64
export const SIDEWALK = 4
export const CURB = 0.1
export const ROAD_MIN = -4 // road indices k in [ROAD_MIN, ROAD_MAX]
export const ROAD_MAX = 4
export const HALF_WORLD = ROAD_MAX * CELL + ROAD_W // outer edge incl. outer roads

export type District = 'downtown' | 'commercial' | 'residential' | 'park'

export interface Building {
  x: number
  z: number
  w: number
  d: number
  h: number
  color: [number, number, number]
  district: District
}
export interface Block {
  cx: number
  cz: number
  district: District
}
export interface Pt {
  x: number
  z: number
}

function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rnd = mulberry32(20240607)
function pick<T>(a: T[]): T {
  return a[Math.floor(rnd() * a.length)]
}
const range = (a: number, b: number) => a + rnd() * (b - a)

const PALETTES: Record<District, [number, number, number][]> = {
  downtown: [
    [0.45, 0.52, 0.6],
    [0.3, 0.36, 0.45],
    [0.62, 0.66, 0.7],
    [0.2, 0.25, 0.32],
  ],
  commercial: [
    [0.75, 0.55, 0.4],
    [0.55, 0.6, 0.65],
    [0.8, 0.72, 0.55],
    [0.5, 0.4, 0.38],
  ],
  residential: [
    [0.85, 0.78, 0.65],
    [0.7, 0.45, 0.4],
    [0.6, 0.7, 0.75],
    [0.9, 0.88, 0.82],
    [0.55, 0.62, 0.45],
  ],
  park: [[0.5, 0.5, 0.5]],
}

export const buildings: Building[] = []
export const blocks: Block[] = []
export const trees: Pt[] = []
export const lamps: (Pt & { rot: number })[] = []

for (let i = ROAD_MIN; i < ROAD_MAX; i++) {
  for (let j = ROAD_MIN; j < ROAD_MAX; j++) {
    const cx = (i + 0.5) * CELL
    const cz = (j + 0.5) * CELL
    const dist = Math.max(Math.abs(i + 0.5), Math.abs(j + 0.5))
    let district: District
    if (dist <= 1.6) district = 'downtown'
    else if (dist <= 2.6) district = 'commercial'
    else district = 'residential'
    if (rnd() < 0.1 && dist > 1.6) district = 'park'
    blocks.push({ cx, cz, district })

    const lot = BLOCK - SIDEWALK * 2 // 56
    const x0 = cx - lot / 2
    const z0 = cz - lot / 2

    if (district === 'park') {
      for (let t = 0; t < 26; t++) trees.push({ x: cx + range(-26, 26), z: cz + range(-26, 26) })
      continue
    }

    if (district === 'downtown') {
      const split = rnd() < 0.5 ? 1 : 2
      const s = lot / split
      for (let a = 0; a < split; a++)
        for (let b = 0; b < split; b++) {
          buildings.push({
            x: x0 + s * (a + 0.5),
            z: z0 + s * (b + 0.5),
            w: s - range(4, 8),
            d: s - range(4, 8),
            h: range(45, 140) * (split === 1 ? 1.1 : 0.85),
            color: pick(PALETTES.downtown),
            district,
          })
        }
    } else if (district === 'commercial') {
      const n = 2
      const s = lot / n
      for (let a = 0; a < n; a++)
        for (let b = 0; b < n; b++)
          buildings.push({
            x: x0 + s * (a + 0.5),
            z: z0 + s * (b + 0.5),
            w: s - range(3, 6),
            d: s - range(3, 6),
            h: range(12, 32),
            color: pick(PALETTES.commercial),
            district,
          })
    } else {
      const n = 3
      const s = lot / n
      for (let a = 0; a < n; a++)
        for (let b = 0; b < n; b++) {
          if (rnd() < 0.12) {
            trees.push({ x: x0 + s * (a + 0.5), z: z0 + s * (b + 0.5) })
            continue
          }
          buildings.push({
            x: x0 + s * (a + 0.5) + range(-1.5, 1.5),
            z: z0 + s * (b + 0.5) + range(-1.5, 1.5),
            w: s - range(5, 8),
            d: s - range(5, 8),
            h: range(6, 11),
            color: pick(PALETTES.residential),
            district,
          })
        }
    }

    // streetlights along the block perimeter, trees on the sidewalk
    for (let t = -1; t <= 1; t += 1) {
      const off = t * 20
      lamps.push({ x: cx + off, z: cz - BLOCK / 2 + 1, rot: Math.PI / 2 })
      lamps.push({ x: cx + off, z: cz + BLOCK / 2 - 1, rot: -Math.PI / 2 })
      lamps.push({ x: cx - BLOCK / 2 + 1, z: cz + off, rot: 0 })
      lamps.push({ x: cx + BLOCK / 2 - 1, z: cz + off, rot: Math.PI })
    }
    for (let t = -2; t <= 2; t++) {
      if (rnd() < 0.5) trees.push({ x: cx + t * 12 + 6, z: cz - BLOCK / 2 + 2.2 })
      if (rnd() < 0.5) trees.push({ x: cx + t * 12 + 6, z: cz + BLOCK / 2 - 2.2 })
    }
  }
}

export const SPAWN = { player: { x: 0, z: 5 }, car: { x: 12, z: -3 } }
