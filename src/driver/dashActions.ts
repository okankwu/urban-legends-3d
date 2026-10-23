import { sfx } from '../engine/audio'
import { useGame } from '../store/game'

/** What the dashboard buttons, the keyboard shortcuts and the on-screen buttons all do. */
export type DashButton = 'gps' | 'map' | 'expand' | 'jobs'

function relock() {
  const c = document.querySelector('canvas') as HTMLCanvasElement | null
  try {
    const p = c?.requestPointerLock() as unknown as Promise<void> | undefined
    p?.catch?.(() => {})
  } catch {
    /* pointer lock can be refused; clicking the view locks it again */
  }
}

export function setExpanded(on: boolean) {
  const s = useGame.getState()
  if (s.gpsExpanded === on) return
  s.set({ gpsExpanded: on, ...(on && !s.gpsOn ? { gpsOn: true, gpsView: 'map' as const } : {}) })
  // the expanded map is clicked with the mouse, so free the cursor while it is open
  if (on) document.exitPointerLock?.()
  else if (s.phase === 'playing' && useGame.getState().touch !== 'on') relock()
}

export function toggleGps() {
  const s = useGame.getState()
  s.set({ gpsOn: !s.gpsOn, gpsView: 'map' })
  sfx('click')
}

export function pressDash(b: DashButton) {
  const s = useGame.getState()
  if (s.phase !== 'playing') return
  switch (b) {
    case 'gps':
      toggleGps()
      break
    case 'map':
      if (!s.gpsOn) s.set({ gpsOn: true, gpsView: 'map' })
      else s.set({ gpsView: s.gpsView === 'map' ? 'home' : 'map' })
      sfx('click')
      break
    case 'expand':
      setExpanded(!s.gpsExpanded)
      sfx('click')
      break
    case 'jobs':
      s.set({ phase: 'jobs', gpsExpanded: false })
      document.exitPointerLock?.()
      sfx('click')
      break
  }
}
