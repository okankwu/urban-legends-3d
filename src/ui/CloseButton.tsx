import { lockPointer } from '../engine/input'
import { useGame } from '../store/game'

/** A close button for full-screen overlays (map, journal) so touch players, who have no M / Tab / Esc key, can leave them. */
export default function CloseButton({ label }: { label: string }) {
  return (
    <button
      className="overlay-close"
      aria-label={`Close ${label}`}
      onClick={() => {
        useGame.getState().set({ phase: 'playing' })
        lockPointer()
      }}
    >
      ✕ Close
    </button>
  )
}
