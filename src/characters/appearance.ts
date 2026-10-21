export type HairStyle = 'original' | 'mohawk' | 'long' | 'bun' | 'afro'
export type BaseModel = 'meshy-a' | 'meshy-b' | 'custom'

export interface Appearance {
  name: string
  base: BaseModel
  /** '' keeps the texture's original colour for that region */
  skin: string
  hairColor: string
  hairStyle: HairStyle
  /** 0.9 – 1.1 */
  height: number
  /** head scale, 0.92 – 1.12 */
  headSize: number
  topColor: string
  pantsColor: string
  shoesColor: string
  glasses: boolean
  cap: boolean
  headphones: boolean
  backpack: boolean
}

export const DEFAULT_APPEARANCE: Appearance = {
  name: 'Player',
  base: 'meshy-a',
  skin: '',
  hairColor: '',
  hairStyle: 'original',
  height: 1,
  headSize: 1,
  topColor: '',
  pantsColor: '',
  shoesColor: '',
  glasses: false,
  cap: false,
  headphones: false,
  backpack: false,
}

export const SKIN_TONES = ['', '#f3d3b5', '#e0ac82', '#c68642', '#8d5524', '#5c3a21', '#3a2415']
export const HAIR_COLORS = ['', '#1a1410', '#4a3020', '#8a5a2b', '#d9b36c', '#b8321f', '#9aa0aa', '#3b5bdb']
export const CLOTH_COLORS = ['', '#111827', '#e5e7eb', '#b91c1c', '#1d4ed8', '#15803d', '#d97706', '#7c3aed', '#6b7280']

export interface OutfitPreset {
  id: string
  label: string
  top: string
  pants: string
  shoes: string
}
export const OUTFITS: OutfitPreset[] = [
  { id: 'original', label: 'Original', top: '', pants: '', shoes: '' },
  { id: 'street', label: 'Street', top: '#111827', pants: '#374151', shoes: '#e5e7eb' },
  { id: 'sport', label: 'Sport', top: '#b91c1c', pants: '#111827', shoes: '#f3f4f6' },
  { id: 'smart', label: 'Smart', top: '#1e3a8a', pants: '#1f2937', shoes: '#3b2a1c' },
  { id: 'summer', label: 'Summer', top: '#f59e0b', pants: '#d6c7a1', shoes: '#ffffff' },
  { id: 'night', label: 'Night Out', top: '#581c87', pants: '#0b0b0f', shoes: '#0b0b0f' },
]

const KEY = 'ul3d.character.v1'

export function loadAppearance(): { appearance: Appearance; saved: boolean } {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { appearance: { ...DEFAULT_APPEARANCE, ...JSON.parse(raw) }, saved: true }
  } catch {
    /* storage unavailable or corrupt */
  }
  return { appearance: { ...DEFAULT_APPEARANCE }, saved: false }
}

export function saveAppearance(a: Appearance) {
  try {
    localStorage.setItem(KEY, JSON.stringify(a))
  } catch {
    /* storage unavailable */
  }
}
