import { blocks, buildings, BLOCK } from '../city/layout'

export type ShopKind = 'store' | 'diner' | 'clothes'

export interface Shop {
  id: string
  name: string
  kind: ShopKind
  /** facade centre of the door (world) */
  door: { x: number; z: number }
  /** outward unit normal of the facade */
  n: { x: number; z: number }
  /** sidewalk point in front of the door where people stop/appear */
  out: { x: number; z: number }
  /** building footprint, for signage */
  bw: number
  bh: number
  blockIndex: number
}

const DEFS: [string, ShopKind][] = [
  ['QuickMart', 'store'],
  ['Luna Diner', 'diner'],
  ['Thread & Co', 'clothes'],
  ['Corner Grocer', 'store'],
  ['Burger Barn', 'diner'],
  ['Style Lab', 'clothes'],
  ['Night Owl Mart', 'store'],
  ['Pasta Palace', 'diner'],
  ['Urban Threads', 'clothes'],
  ['Bean There Cafe', 'diner'],
]

export const shops: Shop[] = []

;(() => {
  const cands = buildings.filter((b) => b.district === 'commercial')
  const step = Math.max(1, Math.floor(cands.length / DEFS.length))
  for (let n = 0; n < DEFS.length; n++) {
    const b = cands[(n * step + 1) % cands.length]
    if (!b) break
    let bi = 0
    for (let i = 0; i < blocks.length; i++) {
      if (Math.abs(blocks[i].cx - b.x) < BLOCK / 2 && Math.abs(blocks[i].cz - b.z) < BLOCK / 2) bi = i
    }
    const blk = blocks[bi]
    const dx = b.x - blk.cx
    const dz = b.z - blk.cz
    const nx = Math.abs(dx) > Math.abs(dz) ? Math.sign(dx) : 0
    const nz = nx === 0 ? Math.sign(dz) || 1 : 0
    const door = { x: b.x + nx * (b.w / 2), z: b.z + nz * (b.d / 2) }
    const [name, kind] = DEFS[n]
    shops.push({
      id: 'shop' + n,
      name,
      kind,
      door,
      n: { x: nx, z: nz },
      out: { x: door.x + nx * 1.8, z: door.z + nz * 1.8 },
      bw: nx === 0 ? b.w : b.d,
      bh: b.h,
      blockIndex: bi,
    })
  }
})()

export interface Product {
  id: string
  label: string
  price: number
  health?: number
  stamina?: boolean
}

export const MENUS: Record<ShopKind, { title: string; lines: Product[] }> = {
  store: {
    title: 'Convenience store',
    lines: [
      { id: 'bandage', label: 'Bandages  (+30 health)', price: 15, health: 30 },
      { id: 'medkit', label: 'Medkit  (full health)', price: 45, health: 100 },
      { id: 'energy', label: 'Energy drink  (refill stamina)', price: 8, stamina: true },
    ],
  },
  diner: {
    title: 'Diner',
    lines: [
      { id: 'burger', label: 'Burger & fries  (+35 health)', price: 18, health: 35 },
      { id: 'slice', label: 'Pizza slice  (+15 health)', price: 9, health: 15 },
      { id: 'coffee', label: 'Large coffee  (refill stamina)', price: 4, stamina: true },
    ],
  },
  clothes: {
    title: 'Clothing store',
    lines: [],
  },
}

/** Interior is a single shared room far from the city. */
export const INTERIOR = { x: 3000, z: 0, w: 16, d: 12, h: 4 }
