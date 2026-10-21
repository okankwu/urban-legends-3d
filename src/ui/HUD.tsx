import { useGameFields } from '../store/game'
import Minimap from './Minimap'

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bar" role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className="bar-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
      <span>{label}</span>
    </div>
  )
}

const WEATHER = { clear: 'Clear', cloudy: 'Cloudy', rain: 'Rain', storm: 'Storm', fog: 'Fog' } as const

function clock(hour: number) {
  const h = Math.floor(hour)
  const m = Math.floor((hour - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const HUD_FIELDS = [
  'hour', 'appearance', 'weather', 'money', 'wanted', 'searching', 'mission', 'objective', 'carrying', 'race', 'banner',
  'health', 'stamina', 'inVehicle', 'speedKmh', 'vehicleHealth', 'nearVehicle', 'prompt', 'dialogue', 'toast', 'caption', 'currentVehicle',
] as const

export default function HUD() {
  const s = useGameFields(HUD_FIELDS)
  return (
    <div className="hud">
      <div className="hud-tl">
        <Minimap />
        <div className="hud-clock">{clock(s.hour)} · {s.appearance.name} · {WEATHER[s.weather]}</div>
      </div>

      <div className="hud-tr">
        <div className="money">$ {s.money.toLocaleString()}</div>
        <div className="wanted" aria-label={`Wanted level ${s.wanted}`}>
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className={(i < s.wanted ? 'star on' : 'star') + (i < s.wanted && s.searching ? ' blink' : '')}>
              ★
            </span>
          ))}
        </div>
      </div>

      <div className="hud-objective">
        <b>{s.mission ? (s.mission.kind === 'job' ? 'JOB' : 'MISSION') : 'OBJECTIVE'}</b>
        <span>
          {s.mission && <em>{s.mission.title} · {s.mission.step + 1}/{s.mission.steps}</em>}
          {s.objective}
        </span>
        {s.mission?.timer != null && <strong className={s.mission.timer < 20 ? 'timer low' : 'timer'}>{Math.floor(s.mission.timer / 60)}:{String(s.mission.timer % 60).padStart(2, '0')}</strong>}
      </div>
      {s.carrying && <div className="carrying">Carrying: {s.carrying}</div>}
      {s.race && s.race.state === 'countdown' && <div className="countdown">{s.race.count > 0 ? s.race.count : 'GO'}</div>}
      {s.race && s.race.state === 'running' && (
        <div className="race-hud">
          <b>{s.race.place}</b>
          <small>/ {s.race.total}</small>
        </div>
      )}
      {s.banner && (
        <div key={s.banner.id} className={'banner ' + s.banner.kind} role="status">
          <strong>{s.banner.title}</strong>
          {s.banner.sub && <span>{s.banner.sub}</span>}
        </div>
      )}

      <div className="hud-bl">
        <Bar label="HEALTH" value={s.health} color="linear-gradient(90deg,#d9363e,#ff6b6b)" />
        <Bar label="STAMINA" value={s.stamina} color="linear-gradient(90deg,#2d9cdb,#6fd3ff)" />
      </div>

      {s.inVehicle && (
        <div className="hud-br">
          <div className="speed">
            {s.speedKmh}
            <small>km/h</small>
          </div>
          <Bar label="VEHICLE" value={s.vehicleHealth} color="linear-gradient(90deg,#f2a900,#ffd35c)" />
          {s.vehicleHealth <= 0 && <div className="warn">Vehicle wrecked — press F to exit</div>}
        </div>
      )}

      {s.nearVehicle && <div className="prompt"><kbd>E</kbd> Enter vehicle</div>}
      {s.prompt && (
        <div className={s.nearVehicle ? 'prompt alt' : 'prompt'}>
          <kbd>{s.prompt.slice(0, 1)}</kbd> {s.prompt.slice(1).trim()}
        </div>
      )}
      {s.dialogue && (
        <div className="dialogue" role="status">
          <b>{s.dialogue.name}</b>
          <span>{s.dialogue.text}</span>
        </div>
      )}
      {s.toast && <div className="toast" role="status">{s.toast}</div>}
      {s.caption && <div className="caption" role="status">{s.caption}</div>}
      {s.inVehicle && (
        <div className="prompt small">
          <kbd>F</kbd> Exit · <kbd>R</kbd> Reset upright · <kbd>Space</kbd> Handbrake · <kbd>H</kbd> Horn · <kbd>L</kbd> Lights · <kbd>Z</kbd>/<kbd>X</kbd> Indicators
        </div>
      )}
    </div>
  )
}
