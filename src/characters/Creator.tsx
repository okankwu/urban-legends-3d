import { useEffect, useRef, useState } from 'react'
import { useGame } from '../store/game'
import { lockPointer } from '../engine/input'
import { rt } from '../engine/runtime'
import { CLOTH_COLORS, HAIR_COLORS, OUTFITS, SKIN_TONES, saveAppearance } from './appearance'
import type { Appearance, HairStyle } from './appearance'
import { RigError, buildCustomRig, getCustomRig, saveCustomFile, setCustomRig, MAX_UPLOAD_MB } from './customRig'

type Tab = 'body' | 'face' | 'outfit' | 'extras' | 'upload'
const TABS: [Tab, string][] = [
  ['body', 'Body'],
  ['face', 'Face & Hair'],
  ['outfit', 'Outfit'],
  ['extras', 'Extras'],
  ['upload', 'Upload'],
]
const HAIR: [HairStyle, string][] = [
  ['original', 'Original'],
  ['mohawk', 'Mohawk'],
  ['long', 'Long'],
  ['bun', 'Bun'],
  ['afro', 'Afro'],
]
const ANGLES: [string, number][] = [
  ['Front', 0.4],
  ['Left', Math.PI / 2],
  ['Back', Math.PI],
  ['Right', -Math.PI / 2],
]

function Swatches({ colors, value, onPick, label }: { colors: string[]; value: string; onPick: (c: string) => void; label: string }) {
  return (
    <div className="swatches" role="group" aria-label={label}>
      {colors.map((c) => (
        <button
          key={c || 'orig'}
          className={'swatch' + (c === value ? ' on' : '')}
          style={c ? { background: c } : undefined}
          onClick={() => onPick(c)}
          aria-label={c || 'Original'}
          aria-pressed={c === value}
          title={c || 'Original colour'}
        >
          {c ? '' : '⟲'}
        </button>
      ))}
    </div>
  )
}

export default function Creator() {
  const s = useGame()
  const a = s.appearance
  const [tab, setTab] = useState<Tab>('body')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [report, setReport] = useState<string[]>([])
  const backup = useRef<Appearance>(a)
  const dragging = useRef<number | null>(null)
  const custom = a.base === 'custom'

  const upd = (p: Partial<Appearance>) => s.set({ appearance: { ...useGame.getState().appearance, ...p } })

  useEffect(() => {
    backup.current = useGame.getState().appearance
    rt.creatorYaw = 0.4
    rt.creatorZoom = 3.4
    // touch: one finger turns the character, two fingers pinch to zoom
    const touches = new Map<number, { x: number; y: number }>()
    let pinch = 0
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('.creator-panel, .creator-bar')) return
      if (e.pointerType === 'touch') {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (touches.size === 2) {
          const [p, q] = [...touches.values()]
          pinch = Math.hypot(p.x - q.x, p.y - q.y)
        }
      }
      dragging.current = e.clientX
    }
    const move = (e: PointerEvent) => {
      if (touches.has(e.pointerId)) {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (touches.size === 2) {
          const [p, q] = [...touches.values()]
          const d = Math.hypot(p.x - q.x, p.y - q.y)
          rt.creatorZoom = Math.max(1.6, Math.min(6, rt.creatorZoom - (d - pinch) * 0.01))
          pinch = d
          return
        }
      }
      if (dragging.current == null) return
      rt.creatorYaw += (e.clientX - dragging.current) * 0.01
      dragging.current = e.clientX
    }
    const up = (e: PointerEvent) => {
      touches.delete(e.pointerId)
      dragging.current = null
    }
    const wheel = (e: WheelEvent) => {
      rt.creatorZoom = Math.max(1.6, Math.min(6, rt.creatorZoom + e.deltaY * 0.002))
    }
    window.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('wheel', wheel, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('wheel', wheel)
    }
  }, [])

  const close = (play: boolean) => {
    if (play) {
      const st = useGame.getState()
      const cur = st.appearance
      const cost = st.creatorCost
      const changed = JSON.stringify(cur) !== JSON.stringify(backup.current)
      if (cost > 0 && changed) {
        if (st.money < cost) {
          setErr(`Not enough money: the new look costs ${cost}.`)
          setTab('upload')
          return
        }
        st.set({ money: st.money - cost })
      }
      saveAppearance(cur)
      s.set({ hasSavedCharacter: true, phase: 'playing', panel: 'none', creatorCost: 0 })
      lockPointer()
    } else {
      s.set({ appearance: backup.current, phase: s.creatorReturn, creatorCost: 0 })
      if (backup.current.base !== 'custom' || getCustomRig()) s.set({ customVersion: s.customVersion + 1 })
    }
  }

  const onFile = async (file?: File | null) => {
    if (!file) return
    setBusy(true)
    setErr('')
    setReport([])
    try {
      const buf = await file.arrayBuffer()
      const rig = await buildCustomRig(buf, file.name)
      setCustomRig(rig)
      try {
        await saveCustomFile(buf, file.name)
      } catch {
        rig.report.push('Could not store the file in this browser, so it will not persist after a refresh.')
      }
      setReport(rig.report)
      s.set({ customVersion: useGame.getState().customVersion + 1 })
      upd({ base: 'custom' })
    } catch (e) {
      setErr(e instanceof RigError ? e.message : `Unexpected error while loading the model: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="creator-panel" role="form" aria-label="Character creator">
        <h2>Create your character</h2>
        <label className="field">
          Name
          <input
            value={a.name}
            maxLength={18}
            onChange={(e) => upd({ name: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Your name"
          />
        </label>
        <div className="tabs" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>

        <div className="tabbody">
          {tab === 'body' && (
            <>
              <div className="field">
                Base model
                <div className="seg">
                  <button className={a.base === 'meshy-a' ? 'on' : ''} onClick={() => upd({ base: 'meshy-a' })}>Model A</button>
                  <button className={a.base === 'meshy-b' ? 'on' : ''} onClick={() => upd({ base: 'meshy-b' })}>Model B</button>
                  <button className={custom ? 'on' : ''} disabled={!getCustomRig()} onClick={() => upd({ base: 'custom' })}>
                    Uploaded
                  </button>
                </div>
                <small>Both built-in models are the male Urban Explorer rig supplied with the project. Use Upload for a different body.</small>
              </div>
              <label className="field">
                Height <b>{(a.height * 1.7).toFixed(2)} m</b>
                <input type="range" min={0.9} max={1.1} step={0.01} value={a.height} onChange={(e) => upd({ height: +e.target.value })} />
              </label>
              <div className="field">
                Skin tone
                <Swatches colors={SKIN_TONES} value={a.skin} onPick={(c) => upd({ skin: c })} label="Skin tone" />
                {custom && <small>Colour options apply to the built-in models only.</small>}
              </div>
            </>
          )}
          {tab === 'face' && (
            <>
              <label className="field">
                Head size <b>{a.headSize.toFixed(2)}×</b>
                <input type="range" min={0.92} max={1.12} step={0.01} value={a.headSize} onChange={(e) => upd({ headSize: +e.target.value })} />
                <small>The face itself is part of the model's texture; head size and hair are adjustable.</small>
              </label>
              <div className="field">
                Hairstyle
                <div className="seg wrap">
                  {HAIR.map(([id, label]) => (
                    <button key={id} className={a.hairStyle === id ? 'on' : ''} onClick={() => upd({ hairStyle: id })}>{label}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                Hair colour
                <Swatches colors={HAIR_COLORS} value={a.hairColor} onPick={(c) => upd({ hairColor: c })} label="Hair colour" />
              </div>
            </>
          )}
          {tab === 'outfit' && (
            <>
              <div className="field">
                Presets
                <div className="seg wrap">
                  {OUTFITS.map((o) => (
                    <button
                      key={o.id}
                      className={a.topColor === o.top && a.pantsColor === o.pants && a.shoesColor === o.shoes ? 'on' : ''}
                      onClick={() => upd({ topColor: o.top, pantsColor: o.pants, shoesColor: o.shoes })}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">Jacket &amp; top<Swatches colors={CLOTH_COLORS} value={a.topColor} onPick={(c) => upd({ topColor: c })} label="Top colour" /></div>
              <div className="field">Trousers<Swatches colors={CLOTH_COLORS} value={a.pantsColor} onPick={(c) => upd({ pantsColor: c })} label="Trousers colour" /></div>
              <div className="field">Shoes<Swatches colors={CLOTH_COLORS} value={a.shoesColor} onPick={(c) => upd({ shoesColor: c })} label="Shoes colour" /></div>
            </>
          )}
          {tab === 'extras' && (
            <div className="field">
              Accessories
              {(
                [
                  ['glasses', 'Glasses'],
                  ['cap', 'Cap'],
                  ['headphones', 'Headphones'],
                  ['backpack', 'Backpack'],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="check">
                  <input type="checkbox" checked={a[k]} onChange={(e) => upd({ [k]: e.target.checked })} />
                  {label}
                </label>
              ))}
              {custom && <small>Accessories are only available on the built-in models.</small>}
            </div>
          )}
          {tab === 'upload' && (
            <div className="field">
              Upload your own character
              <label className={'drop' + (busy ? ' busy' : '')}>
                <input
                  type="file"
                  accept=".glb,.gltf,.vrm"
                  onChange={(e) => {
                    onFile(e.target.files?.[0])
                    e.target.value = ''
                  }}
                  disabled={busy}
                />
                {busy ? 'Validating & retargeting animations…' : 'Choose a .glb / .gltf / .vrm file'}
              </label>
              <small>
                Requirements: a <b>rigged humanoid</b> (skinned mesh with a standard skeleton — Mixamo, VRM, Ready Player Me, Rigify or Unreal naming), facing +Z, ideally in a T-pose. Max {MAX_UPLOAD_MB} MB. .gltf files must embed their data.
                The built-in walk, run, idle, crouch and jump animations are retargeted onto your skeleton. Static (unrigged) models cannot be animated and are rejected.
              </small>
              {err && <div className="err" role="alert">{err}</div>}
              {report.length > 0 && (
                <ul className="ok">
                  {report.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
              {getCustomRig() && !err && <small>Loaded: {getCustomRig()!.fileName}</small>}
            </div>
          )}
        </div>
      </div>

      <div className="creator-bar">
        <div className="seg">
          {ANGLES.map(([label, y]) => (
            <button key={label} onClick={() => (rt.creatorYaw = y)}>{label}</button>
          ))}
        </div>
        <span className="hint">Drag to rotate · scroll or pinch to zoom{s.creatorCost > 0 ? ` · New look costs ${s.creatorCost} (you have ${s.money})` : ''}</span>
        <div className="seg">
          <button onClick={() => close(false)}>Cancel</button>
          <button className="primary" onClick={() => close(true)} disabled={!a.name.trim()}>Save &amp; Play</button>
        </div>
      </div>
    </>
  )
}
