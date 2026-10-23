import { useEffect, useMemo, useState } from 'react'
import { useGame } from '../store/game'
import { rt } from '../engine/runtime'
import { acceptJob, abandonJob, canAccept } from '../driver/manager'
import { makeOffers } from '../driver/jobs'
import { fmtDist, fmtEta, planRoute } from '../driver/gps'
import { ACHIEVEMENTS, CHALLENGES, LEVELS, TYPE_NAME, leaderboard, levelOf, levelProgress, todayKey, withToday } from '../driver/rewards'
import type { JobDef } from '../driver/types'
import { saveGame } from '../missions/manager'
import { banner } from '../missions/actions'
import { lockPointer } from '../engine/input'
import { sfx } from '../engine/audio'
import MissionCompletionPanel from './MissionCompletionPanel'

type Tab = 'jobs' | 'progress' | 'board' | 'rewards'

const STARS = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n)
const rewardText = (j: JobDef) => (j.type === 'parking' ? '50–200' : j.type === 'race' ? '300–1,000' : `${j.base}+`)

function close() {
  useGame.getState().set({ phase: 'playing', djResult: null })
  lockPointer()
}

function Offer({ job, startDist, locked }: { job: JobDef; startDist: number; locked: boolean }) {
  useGame((s) => s.djJob) // re-evaluate availability when a job starts or ends
  const why = canAccept(job)
  const est = (startDist + job.routeLen) / 11
  return (
    <div className={'dj-card' + (locked ? ' locked' : '')}>
      <div className="dj-card-top">
        <span className={'dj-chip ' + job.type}>{TYPE_NAME[job.type]}</span>
        <span className="dj-stars" title={`Difficulty ${job.difficulty} of 3`} aria-label={`Difficulty ${job.difficulty} of 3`}>
          {STARS(job.difficulty)}
        </span>
      </div>
      <h3>{job.title}</h3>
      <p className="dj-desc">{job.desc}</p>
      <dl className="dj-facts">
        <div>
          <dt>Start</dt>
          <dd>{job.start.label}</dd>
        </div>
        <div>
          <dt>Destination</dt>
          <dd>{job.type === 'parking' || job.type === 'race' ? job.stages[job.stages.length - 1].text : job.dest.label}</dd>
        </div>
        <div>
          <dt>Distance</dt>
          <dd>
            {fmtDist(startDist)} to start · {job.type === 'parking' || job.type === 'race' ? 'short' : fmtDist(job.routeLen)} trip
          </dd>
        </div>
        <div>
          <dt>Est. time</dt>
          <dd>{fmtEta(est)}</dd>
        </div>
      </dl>
      <div className="dj-card-foot">
        <strong className="dj-reward">{rewardText(job)} pts</strong>
        <button
          className="primary"
          disabled={!!why}
          title={why ?? ''}
          onClick={() => {
            const err = acceptJob(job)
            if (err) banner('fail', 'Cannot accept', err)
            else close()
          }}
        >
          {locked ? `Level ${job.minLevel}` : 'Accept Mission'}
        </button>
      </div>
      {why && <small className="dj-why">{why}</small>}
    </div>
  )
}

function Jobs() {
  const level = useGame((s) => levelOf(s.driver.xp).level)
  const active = useGame((s) => s.djJob)
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e6))
  const from = useMemo(() => {
    const st = useGame.getState()
    const p = st.inVehicle ? rt.vehiclePos : rt.playerPos
    return { x: p.x, z: p.z }
  }, [])
  const offers = useMemo(() => makeOffers(from, seed), [from, seed])
  const dists = useMemo(() => offers.map((o) => planRoute(from, null, o.start)?.length ?? Math.hypot(from.x - o.start.x, from.z - o.start.z)), [offers, from])
  const order = offers.map((o, i) => i).sort((a, b) => Number(offers[a].minLevel > level) - Number(offers[b].minLevel > level))
  return (
    <>
      {active && (
        <div className="dj-active">
          <div>
            <b>Active: {active.title}</b>
            <div className="hint">{active.text}</div>
          </div>
          <button
            onClick={() => {
              abandonJob()
              setSeed((v) => v + 1)
            }}
          >
            Abandon (no points)
          </button>
        </div>
      )}
      <div className="dj-grid">
        {order.map((i) => (
          <Offer key={offers[i].uid} job={offers[i]} startDist={dists[i]} locked={offers[i].minLevel > level} />
        ))}
      </div>
      <div className="dj-foot">
        <small className="hint">Only one driver job can be active at a time. Failed or abandoned jobs pay nothing.</small>
        <button onClick={() => setSeed((v) => v + 1)}>Refresh jobs</button>
      </div>
    </>
  )
}

function Progress() {
  const driver = useGame((s) => s.driver)
  const d = withToday(driver)
  const prog = levelProgress(d.xp)
  return (
    <div className="dj-prog">
      <section className="dj-level">
        <div>
          <small>DRIVER LEVEL</small>
          <h2>
            {prog.cur.level} · {prog.cur.name}
          </h2>
        </div>
        <div className="dj-bar big" role="progressbar" aria-label="Progress to next level" aria-valuenow={Math.round(prog.frac * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${prog.frac * 100}%` }} />
          <span>{prog.next ? `${d.xp} / ${prog.next.xp} XP to ${prog.next.name}` : `${d.xp} XP · max level`}</span>
        </div>
        <ul className="dj-levels">
          {LEVELS.map((l) => (
            <li key={l.level} className={d.xp >= l.xp ? 'on' : ''}>
              <b>
                {l.level} · {l.name}
              </b>
              <span>
                {l.xp.toLocaleString()} XP — {l.unlock}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className="dj-stats">
        <div>
          <b>{d.points.toLocaleString()}</b>
          <small>points balance</small>
        </div>
        <div>
          <b>{d.totalEarned.toLocaleString()}</b>
          <small>mission points earned</small>
        </div>
        <div>
          <b>{d.completed}</b>
          <small>missions completed</small>
        </div>
        <div>
          <b>{d.streak}</b>
          <small>current streak</small>
        </div>
        <div>
          <b>{d.bestScore}</b>
          <small>best driving score</small>
        </div>
      </section>
      <section>
        <h3>Daily challenges · {todayKey()}</h3>
        {d.daily.list.map((c) => {
          const def = CHALLENGES.find((q) => q.id === c.id)!
          return (
            <div className={'dj-chal' + (c.claimed ? ' done' : '')} key={c.id}>
              <span>
                {def.text} {c.claimed && '✓'}
              </span>
              <div className="dj-bar">
                <div style={{ width: `${(c.progress / def.target) * 100}%` }} />
              </div>
              <b>+{def.bonus}</b>
            </div>
          )
        })}
      </section>
      <section>
        <h3>
          Achievements {d.achievements.length}/{ACHIEVEMENTS.length}
        </h3>
        <div className="dj-ach">
          {ACHIEVEMENTS.map((a) => (
            <div key={a.id} className={d.achievements.includes(a.id) ? 'on' : ''} title={a.text}>
              <b>{d.achievements.includes(a.id) ? '★' : '☆'} {a.name}</b>
              <small>{a.text}</small>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3>Recent missions</h3>
        {d.history.length === 0 && <small className="hint">No completed missions yet.</small>}
        <ul className="dj-hist">
          {d.history.slice(0, 12).map((h) => (
            <li key={h.uid}>
              <span>
                <b>{h.title}</b> <small>{TYPE_NAME[h.type]} · score {h.score} · {fmtEta(h.seconds)} · {h.day}</small>
              </span>
              <b>+{h.points}</b>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function Board() {
  const driver = useGame((s) => s.driver)
  const name = useGame((s) => s.appearance.name)
  const rows = leaderboard(driver, name)
  return (
    <div className="dj-board">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Driver</th>
            <th>Level</th>
            <th>Mission points</th>
            <th>Missions</th>
            <th>Best score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.name} className={r.you ? 'you' : ''}>
              <td>{i + 1}</td>
              <td>
                {r.name} {r.you && <em>(you)</em>}
              </td>
              <td>{r.level}</td>
              <td>{r.points.toLocaleString()}</td>
              <td>{r.missions}</td>
              <td>{r.best}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <small className="hint">Local standings only. The other drivers are fictional characters for comparison, not real players, and your row is saved on this device.</small>
    </div>
  )
}

function Rewards() {
  const points = useGame((s) => s.driver.points)
  const money = useGame((s) => s.money)
  const health = useGame((s) => s.vehicleHealth)
  const spend = (cost: number, apply: () => void, msg: string) => {
    const st = useGame.getState()
    if (st.driver.points < cost) return
    st.set({ driver: { ...st.driver, points: st.driver.points - cost } })
    apply()
    saveGame()
    sfx('buy')
    banner('info', msg)
  }
  const items = [
    {
      id: 'repair',
      name: 'Vehicle repair',
      text: 'Fully repairs your current vehicle.',
      cost: 60,
      disabled: health >= 99,
      run: () => spend(60, () => useGame.getState().set({ vehicleHealth: 100 }), 'Vehicle repaired'),
    },
    {
      id: 'cash',
      name: 'Cash out',
      text: 'Convert 200 points into $100.',
      cost: 200,
      disabled: false,
      run: () => spend(200, () => useGame.getState().set({ money: useGame.getState().money + 100 }), '+$100'),
    },
    {
      id: 'cash2',
      name: 'Big cash out',
      text: 'Convert 1,000 points into $600.',
      cost: 1000,
      disabled: false,
      run: () => spend(1000, () => useGame.getState().set({ money: useGame.getState().money + 600 }), '+$600'),
    },
  ]
  return (
    <div className="dj-rewards">
      <p>
        Spendable points: <b>{points.toLocaleString()}</b> · cash: <b>${money.toLocaleString()}</b>. Spending points never lowers your XP, level or leaderboard total.
      </p>
      <div className="dj-grid">
        {items.map((it) => (
          <div className="dj-card" key={it.id}>
            <h3>{it.name}</h3>
            <p className="dj-desc">{it.text}</p>
            <div className="dj-card-foot">
              <strong className="dj-reward">{it.cost} pts</strong>
              <button className="primary" disabled={points < it.cost || it.disabled} onClick={it.run}>
                {it.disabled ? 'Not needed' : 'Redeem'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** DriverJobsMenu: available jobs, driver level and history, local leaderboard and rewards. */
export default function DriverJobsMenu() {
  const result = useGame((s) => s.djResult)
  const level = useGame((s) => levelOf(s.driver.xp))
  const points = useGame((s) => s.driver.points)
  const [tab, setTab] = useState<Tab>('jobs')

  useEffect(() => {
    document.exitPointerLock?.()
  }, [])

  if (result) return <MissionCompletionPanel result={result} onMore={() => useGame.getState().set({ djResult: null })} onClose={close} />

  const tabs: [Tab, string][] = [
    ['jobs', 'Driver Jobs'],
    ['progress', 'Progress'],
    ['board', 'Leaderboard'],
    ['rewards', 'Rewards'],
  ]
  return (
    <div className="overlay" role="dialog" aria-label="Driver jobs">
      <div className="dj-panel">
        <header className="dj-head">
          <div>
            <h2>Driver Jobs</h2>
            <small>
              Level {level.level} · {level.name} · {points.toLocaleString()} pts
            </small>
          </div>
          <nav className="tabs" role="tablist">
            {tabs.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </nav>
          <button onClick={close}>Close (J)</button>
        </header>
        <div className="dj-body">
          {tab === 'jobs' && <Jobs />}
          {tab === 'progress' && <Progress />}
          {tab === 'board' && <Board />}
          {tab === 'rewards' && <Rewards />}
        </div>
      </div>
    </div>
  )
}
