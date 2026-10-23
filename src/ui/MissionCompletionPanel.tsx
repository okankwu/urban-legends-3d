import { useEffect, useState } from 'react'
import type { JobResult } from '../driver/types'
import { fmtEta } from '../driver/gps'

/** Animated "MISSION COMPLETE" summary: base points, each bonus, the total, XP and level progress. */
export default function MissionCompletionPanel({ result, onMore, onClose }: { result: JobResult; onMore: () => void; onClose: () => void }) {
  const [shown, setShown] = useState(0)
  const [count, setCount] = useState(0)
  const lines = [{ label: result.type === 'race' ? 'Race prize' : 'Base points', points: result.base }, ...result.bonuses]

  // reveal the lines one by one, then count the total up
  useEffect(() => {
    let k = 0
    const t = window.setInterval(() => {
      k++
      setShown(k)
      if (k >= lines.length) window.clearInterval(t)
    }, 260)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (shown < lines.length) return
    const start = performance.now()
    let raf = 0
    const step = () => {
      const f = Math.min(1, (performance.now() - start) / 900)
      setCount(Math.round(result.total * (1 - (1 - f) * (1 - f))))
      if (f < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown])

  const pct = result.xpNeed > 0 ? Math.min(100, (result.xpInto / result.xpNeed) * 100) : 100
  const done = shown >= lines.length
  return (
    <div className="overlay" role="dialog" aria-label="Mission complete">
      <div className="dj-complete">
        <small className="dj-kicker">MISSION COMPLETE!</small>
        <h2>{result.subtitle}</h2>
        <p className="dj-sub">{result.title}</p>
        <ul className="dj-lines">
          {lines.map((l, i) => (
            <li key={i} className={i < shown ? 'in' : ''}>
              <span>{l.label}</span>
              <b>+{l.points}</b>
            </li>
          ))}
        </ul>
        <div className={'dj-total' + (done ? ' in' : '')} aria-live="polite">
          TOTAL EARNED: <b>+{count.toLocaleString()} POINTS</b>
        </div>
        <div className="dj-meta">
          <span>Driving score <b>{result.score}</b></span>
          <span>Time <b>{fmtEta(result.seconds)}</b></span>
          <span>XP gained <b>+{result.xp}</b></span>
          <span>Points balance <b>{result.pointsBalance.toLocaleString()}</b></span>
        </div>
        <div className="dj-lvl">
          <div className="dj-lvl-head">
            <b>
              Level {result.level} · {result.levelName}
            </b>
            <small>{result.nextName ? `${result.xpInto} / ${result.xpNeed} XP to ${result.nextName}` : 'Max level reached'}</small>
          </div>
          <div className="dj-bar big">
            <div style={{ width: `${done ? pct : 0}%` }} />
          </div>
        </div>
        {result.levelUp && (
          <div className="dj-up" role="status">
            LEVEL UP — {result.levelName}! Unlocked: {result.unlocked}
          </div>
        )}
        {result.achievements.map((a) => (
          <div className="dj-up ach" role="status" key={a}>
            ★ Achievement unlocked: {a}
          </div>
        ))}
        <div className="dj-actions">
          <button className="primary" onClick={onMore}>
            Accept another mission
          </button>
          <button onClick={onClose}>Continue driving</button>
        </div>
      </div>
    </div>
  )
}
