import { useEffect, useState } from 'react'
import { saveSettings, useGame, useGameFields } from '../store/game'
import { ACTIONS, bindingOf, codeLabel } from '../engine/bindings'
import type { Quality } from '../store/game'
import { lockPointer } from '../engine/input'
import { continueGame, newGame, saveGame } from '../missions/manager'
import { enterFullscreen, fullscreenSupported, isCoarsePointer } from '../engine/mobile'
import { FullscreenButton } from './MobileExtras'

function ControlsPanel() {
  const bindings = useGame((s) => s.bindings)
  const set = useGame((s) => s.set)
  const [listening, setListening] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!listening) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.code === 'Escape') {
        setListening(null)
        return
      }
      const act = ACTIONS.find((x) => x.id === listening)!
      const clash = ACTIONS.find((x) => x.id !== listening && bindingOf(bindings, x) === e.code)
      if (clash) {
        setMsg(`${codeLabel(e.code)} is already used for "${clash.label}".`)
        return
      }
      const next = { ...bindings }
      if (e.code === act.def) delete next[act.id]
      else next[act.id] = e.code
      set({ bindings: next })
      saveSettings()
      setMsg('')
      setListening(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [listening, bindings, set])

  return (
    <div className="panel">
      <h2>Controls</h2>
      <table>
        <tbody>
          <tr>
            <td><kbd>Mouse</kbd></td>
            <td>Rotate camera (touch: drag the right side)</td>
          </tr>
          {ACTIONS.map((a) => (
            <tr key={a.id}>
              <td>{a.label}</td>
              <td style={{ textAlign: 'right' }}>
                <button className="rebind" onClick={() => { setMsg(''); setListening(a.id) }} aria-label={`Rebind ${a.label}, currently ${codeLabel(bindingOf(bindings, a))}`}>
                  {listening === a.id ? 'Press a key…' : codeLabel(bindingOf(bindings, a))}
                </button>
              </td>
            </tr>
          ))}
          <tr>
            <td>Pause</td>
            <td style={{ textAlign: 'right' }}><kbd>Esc</kbd></td>
          </tr>
          <tr>
            <td>Indicators</td>
            <td style={{ textAlign: 'right' }}><kbd>Z</kbd> <kbd>X</kbd></td>
          </tr>
        </tbody>
      </table>
      {msg && <div className="err" role="alert">{msg}</div>}
      <div className="seg">
        <button onClick={() => { set({ bindings: {} }); saveSettings(); setMsg('') }}>Reset to defaults</button>
        <button onClick={() => set({ panel: 'none' })}>Back</button>
      </div>
    </div>
  )
}

function AccessPanel() {
  const s = useGame()
  const upd = (p: Partial<typeof s>) => {
    s.set(p)
    saveSettings()
  }
  return (
    <div className="panel">
      <h2>Accessibility</h2>
      <label className="check">
        <input type="checkbox" checked={s.reduceMotion} onChange={(e) => upd({ reduceMotion: e.target.checked })} />
        Reduce motion (no lightning flashes, lighter rain, no HUD animation)
      </label>
      <label className="check">
        <input type="checkbox" checked={s.highContrast} onChange={(e) => upd({ highContrast: e.target.checked })} />
        High-contrast HUD
      </label>
      <label className="check">
        <input type="checkbox" checked={s.colorblind} onChange={(e) => upd({ colorblind: e.target.checked })} />
        Colour-blind safe markers and traffic lights
      </label>
      <label className="check">
        <input type="checkbox" checked={s.captions} onChange={(e) => upd({ captions: e.target.checked })} />
        Sound captions (sirens, horn, thunder)
      </label>
      <label>
        Interface size <b>{Math.round(s.uiScale * 100)}%</b>
        <input type="range" min={0.8} max={1.5} step={0.05} value={s.uiScale} onChange={(e) => upd({ uiScale: +e.target.value })} />
      </label>
      <label>
        Touch controls
        <select value={s.touch} onChange={(e) => upd({ touch: e.target.value as 'auto' | 'on' | 'off' })}>
          <option value="auto">Automatic (touch screens)</option>
          <option value="on">Always on</option>
          <option value="off">Off</option>
        </select>
      </label>
      <button onClick={() => s.set({ panel: 'none' })}>Back</button>
    </div>
  )
}

function SettingsPanel() {
  const s = useGame()
  const upd = (p: Partial<typeof s>) => {
    s.set(p)
    saveSettings()
  }
  return (
    <div className="panel">
      <h2>Settings</h2>
      <label>
        Mouse sensitivity <b>{s.sensitivity.toFixed(1)}</b>
        <input type="range" min={0.2} max={3} step={0.1} value={s.sensitivity} onChange={(e) => upd({ sensitivity: +e.target.value })} />
      </label>
      <label>
        Camera distance <b>{s.camDistance.toFixed(1)} m</b>
        <input type="range" min={3} max={10} step={0.5} value={s.camDistance} onChange={(e) => upd({ camDistance: +e.target.value })} />
      </label>
      <label>
        Master volume <b>{Math.round(s.volume * 100)}%</b>
        <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => upd({ volume: +e.target.value })} />
      </label>
      <label className="check">
        <input type="checkbox" checked={s.music} onChange={(e) => upd({ music: e.target.checked })} />
        Background music (generated)
      </label>
      <label className="check">
        <input type="checkbox" checked={s.autoQuality} onChange={(e) => upd({ autoQuality: e.target.checked })} />
        Adaptive resolution (lowers render scale when the frame rate drops)
      </label>
      <label className="check">
        <input type="checkbox" checked={s.showFps} onChange={(e) => upd({ showFps: e.target.checked })} />
        Show FPS / draw calls
      </label>
      <label>
        Graphics quality
        <select value={s.quality} onChange={(e) => upd({ quality: e.target.value as Quality })}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>
      {fullscreenSupported() && (
        <div className="seg">
          <FullscreenButton className="" />
        </div>
      )}
      <button onClick={() => s.set({ panel: 'none' })}>Back</button>
    </div>
  )
}

export default function Menus() {
  const s = useGameFields(['phase', 'panel', 'hasSavedCharacter', 'hasProgress', 'set'] as const)
  if (s.phase !== 'menu' && s.phase !== 'paused') return null

  const openCreator = () => s.set({ phase: 'creator', panel: 'none', creatorCost: 0, creatorReturn: s.phase === 'paused' ? 'paused' : 'menu' })
  const start = () => {
    // first launch: make the player create a character before entering the city
    if (isCoarsePointer()) void enterFullscreen()
    if (s.phase === 'menu' && !s.hasSavedCharacter) return openCreator()
    if (s.phase === 'menu' && s.hasProgress) continueGame()
    s.set({ phase: 'playing', panel: 'none' })
    lockPointer()
  }
  const fresh = () => {
    newGame()
    if (isCoarsePointer()) void enterFullscreen()
    if (!s.hasSavedCharacter) return openCreator()
    s.set({ phase: 'playing', panel: 'none' })
    lockPointer()
  }
  const save = () => {
    s.set({ toast: saveGame() ? 'Game saved' : 'Could not save (storage unavailable)' })
    window.setTimeout(() => useGame.getState().set({ toast: '' }), 2200)
  }

  return (
    <div className={`menu ${s.phase}`}>
      <div className="menu-card">
        <h1>
          URBAN <em>LEGENDS</em> 3D
        </h1>
        <p className="sub">{s.phase === 'paused' ? 'Paused' : 'An original open-world city sandbox'}</p>
        {s.panel === 'controls' ? (
          <ControlsPanel />
        ) : s.panel === 'settings' ? (
          <SettingsPanel />
        ) : s.panel === 'access' ? (
          <AccessPanel />
        ) : (
          <div className="buttons">
            <button className="primary" onClick={start}>
              {s.phase === 'paused' ? 'Resume' : s.hasProgress ? 'Continue Game' : 'Start Game'}
            </button>
            {s.phase === 'menu' && s.hasProgress && <button onClick={fresh}>New Game</button>}
            {s.phase === 'paused' && <button onClick={save}>Save Game</button>}
            {s.phase === 'paused' && <button onClick={() => s.set({ phase: 'jobs' })}>Driver Jobs</button>}
            <button onClick={openCreator}>Character Creator</button>
            <button onClick={() => s.set({ panel: 'controls' })}>Controls</button>
            <button onClick={() => s.set({ panel: 'settings' })}>Settings</button>
            <button onClick={() => s.set({ panel: 'access' })}>Accessibility</button>
            {s.phase === 'paused' && (
              <button onClick={() => { s.set({ phase: 'menu', inVehicle: false }); location.reload() }}>Quit to Menu</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
