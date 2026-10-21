import { rt } from './runtime'
import { useGame } from '../store/game'
import { buildRemap } from './bindings'

let remap = buildRemap({})
export const isTouchUi = () => {
  const t = useGame.getState().touch
  return t === 'on' || (t === 'auto' && typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches)
}

let installed = false

export function installInput(canvasGetter: () => HTMLElement | null) {
  if (installed) return
  installed = true
  remap = buildRemap(useGame.getState().bindings)
  let prevBindings = useGame.getState().bindings
  useGame.subscribe((s) => {
    if (s.bindings !== prevBindings) {
      prevBindings = s.bindings
      remap = buildRemap(s.bindings)
    }
  })

  /** physical key -> canonical (default) key code the game logic reads; null = swallowed */
  const canon = (code: string) => (code === 'Escape' ? code : remap.blocked.has(code) ? null : remap.map[code] ?? code)

  window.addEventListener('keydown', (ev) => {
    if (ev.repeat) return
    const code = canon(ev.code)
    const e = { code: code ?? ev.code, preventDefault: () => ev.preventDefault() }
    if (code === null) return
    if ((ev.target as HTMLElement | null)?.tagName === 'INPUT' && (ev.target as HTMLInputElement).type === 'text') return
    rt.keys[e.code] = true
    rt.pressed[e.code] = performance.now()
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault()
    const ph = useGame.getState().phase
    if ((e.code === 'KeyM' || e.code === 'Tab') && (ph === 'playing' || ph === 'map' || ph === 'journal')) {
      const want = e.code === 'KeyM' ? 'map' : 'journal'
      if (ph === want) {
        useGame.getState().set({ phase: 'playing' })
        lockPointer()
      } else if (ph === 'playing') {
        useGame.getState().set({ phase: want })
        document.exitPointerLock?.()
      }
    }
    if (e.code === 'Escape' && (ph === 'map' || ph === 'journal')) {
      useGame.getState().set({ phase: 'playing' })
      lockPointer()
    }
    if (e.code === 'Escape' && useGame.getState().phase === 'playing') {
      // fallback for when pointer lock is unavailable (the browser handles Esc itself while locked)
      useGame.getState().set({ phase: 'paused' })
      document.exitPointerLock?.()
    }
  })
  window.addEventListener('keyup', (e) => {
    const c = canon(e.code)
    if (c) rt.keys[c] = false
  })
  window.addEventListener('blur', () => {
    for (const k in rt.keys) rt.keys[k] = false
  })

  window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement == null) return
    const s = useGame.getState().sensitivity * 0.0022
    rt.lastMouse = performance.now()
    rt.camYaw -= e.movementX * s
    rt.camPitch = Math.max(-0.35, Math.min(1.2, rt.camPitch + e.movementY * s))
  })

  // Losing pointer lock during play (Esc) pauses the game.
  document.addEventListener('pointerlockchange', () => {
    const st = useGame.getState()
    if (document.pointerLockElement == null && st.phase === 'playing' && !isTouchUi()) st.set({ phase: 'paused' })
  })

  // Clicking the canvas re-acquires the mouse while playing.
  window.addEventListener('mousedown', () => {
    const st = useGame.getState()
    const c = canvasGetter()
    if (st.phase === 'playing' && c && document.pointerLockElement == null && !isTouchUi()) lockPointer()
  })
}

export function lockPointer() {
  const c = document.querySelector('canvas')
  try {
    const p = (c as HTMLCanvasElement | null)?.requestPointerLock() as unknown as Promise<void> | undefined
    p?.catch?.(() => {})
  } catch {
    /* ignored */
  }
}
