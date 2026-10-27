import { useGame } from '../store/game'
import { MISSIONS } from '../missions/missions'
import CloseButton from './CloseButton'

/** Tab: mission log, stats and carried items. */
export default function Journal() {
  const s = useGame()
  return (
    <div className="overlay" role="dialog" aria-label="Journal">
      <CloseButton label="journal" />
      <div className="journal">
        <h2>{s.appearance.name}&apos;s journal</h2>
        <div className="jgrid">
          <div className="jcard"><small>Cash</small><b>${s.money}</b></div>
          <div className="jcard"><small>Total earned</small><b>${s.earnedTotal}</b></div>
          <div className="jcard"><small>Reputation</small><b>{s.reputation}</b></div>
          <div className="jcard"><small>Courier jobs</small><b>{s.jobsDone}</b></div>
          <div className="jcard"><small>Health</small><b>{Math.round(s.health)}</b></div>
          <div className="jcard"><small>Carrying</small><b>{s.carrying || '—'}</b></div>
        </div>
        <h3 style={{ margin: 0 }}>Missions</h3>
        <div className="mlist">
          {MISSIONS.map((m) => {
            const done = s.completed.includes(m.id)
            const cur = s.mission?.id === m.id
            return (
              <div key={m.id} className={'mrow' + (done ? ' done' : '') + (cur ? ' cur' : '')}>
                <span>
                  {done ? '✔ ' : ''}
                  {m.title}
                </span>
                <span>{done ? 'Completed' : cur ? 'In progress' : m.reward ? `$${m.reward}` : 'Prize money'}</span>
              </div>
            )
          })}
        </div>
        {s.unlocks.length > 0 && (
          <>
            <h3 style={{ margin: 0 }}>Unlocked</h3>
            <div>{s.unlocks.join(' · ')}</div>
          </>
        )}
        <small style={{ color: 'var(--muted)' }}>Tab or Esc to close, or use the Close button</small>
      </div>
    </div>
  )
}
