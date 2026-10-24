import { useEffect, useState } from 'react'
import { useGame } from '../store/game'
import { enterFullscreen, exitFullscreen, fullscreenSupported, isFullscreen } from '../engine/mobile'
import { isTouchUi } from '../engine/input'

/** Asks phone players to turn the device sideways (the game plays much better in landscape). Can be dismissed. */
export function RotateHint() {
  const phase = useGame((s) => s.phase)
  const touch = useGame((s) => s.touch)
  const [portrait, setPortrait] = useState(() => window.innerHeight > window.innerWidth)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('ul3d.rotate') === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    const on = () => setPortrait(window.innerHeight > window.innerWidth)
    window.addEventListener('resize', on)
    window.addEventListener('orientationchange', on)
    return () => {
      window.removeEventListener('resize', on)
      window.removeEventListener('orientationchange', on)
    }
  }, [])
  void touch
  if (!isTouchUi() || !portrait || dismissed || window.innerWidth > 700 || phase === 'creator') return null
  return (
    <div className="rotate-hint" role="dialog" aria-label="Rotate your device">
      <div className="rotate-card">
        <div className="rotate-icon" aria-hidden="true">
          ↻
        </div>
        <h2>Turn your phone sideways</h2>
        <p>Urban Legends 3D is built for landscape: the controls, map and dashboard need the width.</p>
        <button
          className="primary"
          onClick={() => {
            try {
              sessionStorage.setItem('ul3d.rotate', '1')
            } catch {
              /* ignore */
            }
            setDismissed(true)
          }}
        >
          Play in portrait anyway
        </button>
      </div>
    </div>
  )
}

/** A fullscreen toggle for touch devices that support it (Android Chrome and most tablets; not iPhone Safari). */
export function FullscreenButton({ className = 'tbtn small' }: { className?: string }) {
  const [full, setFull] = useState(isFullscreen())
  useEffect(() => {
    const on = () => setFull(isFullscreen())
    document.addEventListener('fullscreenchange', on)
    document.addEventListener('webkitfullscreenchange', on)
    return () => {
      document.removeEventListener('fullscreenchange', on)
      document.removeEventListener('webkitfullscreenchange', on)
    }
  }, [])
  if (!fullscreenSupported()) return null
  return (
    <button className={className} aria-label={full ? 'Exit fullscreen' : 'Enter fullscreen'} onClick={() => (full ? exitFullscreen() : enterFullscreen())}>
      {full ? 'Window' : 'Full'}
    </button>
  )
}
