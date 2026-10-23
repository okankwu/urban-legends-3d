import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { loadAppearance } from '../characters/appearance'
import type { Appearance } from '../characters/appearance'
import { loadProgress } from '../missions/progress'
import type { ActiveMission, Banner, Marker, RaceHud } from '../missions/types'
import { defaultDriver, normalizeDriver } from '../driver/rewards'
import type { DriverData } from '../driver/rewards'
import type { JobHud, JobResult } from '../driver/types'

export type Quality = 'low' | 'medium' | 'high'
export type Weather = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog'
export type Phase = 'menu' | 'creator' | 'playing' | 'paused' | 'shop' | 'map' | 'journal' | 'garage' | 'jobs'

export interface GameState {
  phase: Phase
  panel: 'none' | 'controls' | 'settings' | 'access'
  health: number
  stamina: number
  money: number
  speedKmh: number
  vehicleHealth: number
  inVehicle: boolean
  nearVehicle: boolean
  hour: number
  wanted: number
  objective: string
  sensitivity: number
  camDistance: number
  quality: Quality
  appearance: Appearance
  hasSavedCharacter: boolean
  /** bumps when an uploaded model is (re)loaded so the character remounts */
  customVersion: number
  creatorReturn: 'menu' | 'paused'
  /** id of the shop the player is inside, or null */
  inShop: string | null
  /** contextual interaction prompt (shops, pedestrians) */
  prompt: string
  dialogue: { name: string; text: string } | null
  toast: string
  volume: number
  music: boolean
  mission: ActiveMission | null
  /** markers for the current objective (3D beams, minimap, map) */
  markers: Marker[]
  /** where the next mission / job can be started */
  startMarkers: Marker[]
  completed: string[]
  earnedTotal: number
  jobsDone: number
  reputation: number
  unlocks: string[]
  carrying: string
  race: RaceHud | null
  banner: Banner | null
  waypoint: { x: number; z: number } | null
  mprompt: string
  hasProgress: boolean
  currentVehicle: string
  ownedVehicles: string[]
  paint: Record<string, string>
  weather: Weather
  /** 0 dry .. 1 soaked: drives wet roads, tyre grip and rain audio */
  wetness: number
  creatorCost: number
  busted: string
  searching: boolean
  garageId: string
  showFps: boolean
  captions: boolean
  caption: string
  autoQuality: boolean
  reduceMotion: boolean
  highContrast: boolean
  colorblind: boolean
  uiScale: number
  touch: 'auto' | 'on' | 'off'
  bindings: Record<string, string>
  /** persistent driver progression (points, xp, history, achievements) */
  driver: DriverData
  /** the active driver job as shown on the HUD */
  djJob: JobHud | null
  /** 3D / GPS markers for the active driver job */
  djMarkers: Marker[]
  djPrompt: string
  /** set when a job finishes; shows the completion panel */
  djResult: JobResult | null
  camMode: 'chase' | 'cockpit'
  /** dashboard navigation screen powered on */
  gpsOn: boolean
  /** dashboard screen shows the live map (true) or the home page (false) */
  gpsView: 'map' | 'home'
  gpsExpanded: boolean
  /** floating GPS overlay in the chase camera */
  gpsOverlay: boolean
  /** label of the dashboard button under the crosshair/cursor */
  dashHover: string
  set: (p: Partial<GameState>) => void
}

const SETTINGS_KEY = 'ul3d.settings.v1'

function loadSettings(): Partial<GameState> {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
  } catch {
    return {}
  }
}

export function saveSettings() {
  const s = useGame.getState()
  try {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ sensitivity: s.sensitivity, camDistance: s.camDistance, quality: s.quality, volume: s.volume, music: s.music, showFps: s.showFps, captions: s.captions, autoQuality: s.autoQuality, reduceMotion: s.reduceMotion, highContrast: s.highContrast, colorblind: s.colorblind, uiScale: s.uiScale, touch: s.touch, bindings: s.bindings, gpsOverlay: s.gpsOverlay, gpsOn: s.gpsOn, camMode: s.camMode }),
    )
  } catch {
    /* storage unavailable */
  }
}

if (import.meta.env.DEV) {
  queueMicrotask(() => ((window as unknown as Record<string, unknown>).__game = useGame))
}

function progressDefaults(): Partial<GameState> {
  const p = loadProgress()
  if (!p) return {}
  return { driver: normalizeDriver(p.driver), money: p.money, health: p.health, completed: p.completed, earnedTotal: p.earnedTotal, jobsDone: p.jobsDone, reputation: p.reputation, unlocks: p.unlocks, hour: p.hour, ownedVehicles: p.ownedVehicles ?? ['subaru'], currentVehicle: p.currentVehicle ?? 'subaru', paint: p.paint ?? {} }
}

export const useGame = create<GameState>((set) => ({
  phase: 'menu',
  panel: 'none',
  health: 100,
  stamina: 100,
  money: 500,
  speedKmh: 0,
  vehicleHealth: 100,
  inVehicle: false,
  nearVehicle: false,
  hour: 9,
  wanted: 0,
  objective: 'Explore the neighborhood. Find the blue Subaru (red dot on the minimap) and press E to drive.',
  sensitivity: 1,
  camDistance: 5.5,
  quality: 'medium',
  appearance: loadAppearance().appearance,
  hasSavedCharacter: loadAppearance().saved,
  customVersion: 0,
  creatorReturn: 'menu',
  inShop: null,
  prompt: '',
  dialogue: null,
  toast: '',
  volume: 0.6,
  music: false,
  mission: null,
  markers: [],
  startMarkers: [],
  completed: [],
  earnedTotal: 0,
  jobsDone: 0,
  reputation: 0,
  unlocks: [],
  carrying: '',
  race: null,
  banner: null,
  waypoint: null,
  mprompt: '',
  hasProgress: !!loadProgress(),
  currentVehicle: 'subaru',
  ownedVehicles: ['subaru'],
  paint: {},
  weather: 'clear',
  wetness: 0,
  creatorCost: 0,
  busted: '',
  searching: false,
  garageId: '',
  showFps: false,
  captions: false,
  caption: '',
  autoQuality: true,
  reduceMotion: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  highContrast: typeof matchMedia !== 'undefined' && matchMedia('(prefers-contrast: more)').matches,
  colorblind: false,
  uiScale: 1,
  touch: 'auto',
  bindings: {},
  driver: defaultDriver(),
  djJob: null,
  djMarkers: [],
  djPrompt: '',
  djResult: null,
  camMode: 'chase',
  gpsOn: true,
  gpsView: 'map',
  gpsExpanded: false,
  gpsOverlay: true,
  dashHover: '',
  ...progressDefaults(),
  ...loadSettings(),
  set: (p) => set(p),
}))

/** Subscribe to only the listed fields (re-renders when one of them changes, not on every store update). */
export function useGameFields<K extends keyof GameState>(keys: readonly K[]): Pick<GameState, K> {
  return useGame(
    useShallow((s) => {
      const out = {} as Pick<GameState, K>
      for (const k of keys) out[k] = s[k]
      return out
    }),
  )
}
