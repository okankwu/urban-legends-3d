export interface ActionDef {
  id: string
  label: string
  /** the physical key the rest of the game reads (default binding) */
  def: string
}

export const ACTIONS: ActionDef[] = [
  { id: 'forward', label: 'Move forward / accelerate', def: 'KeyW' },
  { id: 'back', label: 'Move back / brake', def: 'KeyS' },
  { id: 'left', label: 'Move / steer left', def: 'KeyA' },
  { id: 'right', label: 'Move / steer right', def: 'KeyD' },
  { id: 'sprint', label: 'Sprint', def: 'ShiftLeft' },
  { id: 'jump', label: 'Jump / handbrake', def: 'Space' },
  { id: 'crouch', label: 'Crouch', def: 'KeyC' },
  { id: 'interact', label: 'Interact / enter vehicle', def: 'KeyE' },
  { id: 'exit', label: 'Exit vehicle', def: 'KeyF' },
  { id: 'garage', label: 'Open garage', def: 'KeyG' },
  { id: 'horn', label: 'Horn', def: 'KeyH' },
  { id: 'lights', label: 'Headlights', def: 'KeyL' },
  { id: 'reset', label: 'Reset flipped vehicle', def: 'KeyR' },
  { id: 'map', label: 'Map', def: 'KeyM' },
  { id: 'journal', label: 'Journal', def: 'Tab' },
]

export function codeLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  const names: Record<string, string> = { Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'R-Shift', ControlLeft: 'Ctrl', AltLeft: 'Alt', Tab: 'Tab', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }
  return names[code] ?? code
}

export const bindingOf = (bindings: Record<string, string>, a: ActionDef) => bindings[a.id] ?? a.def

/**
 * The game reads the default key codes everywhere. A rebinding is applied by translating the physical key the
 * player pressed into the default code of its action, and swallowing default keys that were given away.
 */
export function buildRemap(bindings: Record<string, string>) {
  const map: Record<string, string> = {}
  const blocked = new Set<string>()
  const used = new Set<string>()
  for (const a of ACTIONS) used.add(bindingOf(bindings, a))
  for (const a of ACTIONS) {
    const b = bindingOf(bindings, a)
    if (b !== a.def) {
      map[b] = a.def
      if (!used.has(a.def)) blocked.add(a.def)
    }
  }
  return { map, blocked }
}
