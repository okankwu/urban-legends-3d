import { saveSettings, useGame } from '../store/game'
import { isTouchUi } from './input'

/** Phone / tablet helpers: first-run defaults, fullscreen + landscape lock, wake lock, auto-pause, zoom guards. */
export const isCoarsePointer = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
export const isPhoneSized = () => Math.min(window.innerWidth, window.innerHeight) < 600

const SETTINGS_KEY = 'ul3d.settings.v1'

export function fullscreenSupported(): boolean {
  const d = document as Document & { webkitFullscreenEnabled?: boolean }
  return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled)
}
export const isFullscreen = () => !!(document.fullscreenElement || (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement)

/** Must run inside a tap/click handler. Fullscreen + landscape lock work on Android Chrome; iOS Safari has neither. */
export async function enterFullscreen() {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }
  try {
    if (!isFullscreen()) {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions)
      else await el.webkitRequestFullscreen?.()
    }
  } catch {
    /* refused: the game still works in the normal browser view */
  }
  try {
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
    await o.lock?.('landscape')
  } catch {
    /* orientation lock is not available everywhere */
  }
}

export async function exitFullscreen() {
  try {
    if (isFullscreen()) await document.exitFullscreen?.()
    ;(screen.orientation as ScreenOrientation | undefined)?.unlock?.()
  } catch {
    /* ignore */
  }
}

let started = false
export function initMobile() {
  if (started) return
  started = true

  // keep CSS in step with the real visible height (mobile browser toolbars change it)
  const setVh = () => document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`)
  setVh()
  window.addEventListener('resize', setVh)
  window.addEventListener('orientationchange', () => window.setTimeout(setVh, 250))

  const coarse = isCoarsePointer()
  // the touch layout follows the Accessibility > Touch controls setting (automatic, always on, off)
  const flag = () => (document.documentElement.dataset.touch = isTouchUi() ? 'yes' : 'no')
  flag()
  useGame.subscribe((s, prev) => {
    if (s.touch !== prev.touch) flag()
  })

  // first run on a touch device: start light (low quality, adaptive resolution on)
  let hasSaved = false
  try {
    hasSaved = localStorage.getItem(SETTINGS_KEY) !== null
  } catch {
    /* storage unavailable */
  }
  if (coarse && !hasSaved) {
    useGame.getState().set({ quality: 'low', autoQuality: true })
    saveSettings()
  }

  // no pinch / double-tap zoom while playing, no long-press menus on the game surface
  const stop = (e: Event) => e.preventDefault()
  document.addEventListener('gesturestart', stop)
  document.addEventListener('gesturechange', stop)
  document.addEventListener(
    'contextmenu',
    (e) => {
      if (coarse || (e.target as HTMLElement | null)?.closest?.('.touch, canvas')) e.preventDefault()
    },
    { capture: true },
  )
  document.addEventListener('touchmove', (e) => (e.touches.length > 1 ? e.preventDefault() : undefined), { passive: false })

  // pause when the app is sent to the background
  document.addEventListener('visibilitychange', () => {
    const s = useGame.getState()
    if (document.hidden && s.phase === 'playing') s.set({ phase: 'paused' })
  })

  // keep the screen awake while playing (where the Wake Lock API exists)
  type Sentinel = { release: () => Promise<void> }
  let lock: Sentinel | null = null
  const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } }).wakeLock
  const sync = async () => {
    const playing = useGame.getState().phase === 'playing' && !document.hidden
    try {
      if (playing && !lock && wl) lock = await wl.request('screen')
      else if (!playing && lock) {
        const l = lock
        lock = null
        await l.release()
      }
    } catch {
      lock = null
    }
  }
  useGame.subscribe((s, prev) => {
    if (s.phase !== prev.phase) void sync()
  })
  document.addEventListener('visibilitychange', () => void sync())
}
