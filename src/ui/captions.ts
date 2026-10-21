import { useGame } from '../store/game'

let timer = 0

/** Shows a short sound caption (if the player enabled captions). */
export function caption(text: string, ms = 2600) {
  const st = useGame.getState()
  if (!st.captions) return
  st.set({ caption: text })
  window.clearTimeout(timer)
  timer = window.setTimeout(() => useGame.getState().set({ caption: '' }), ms)
}
