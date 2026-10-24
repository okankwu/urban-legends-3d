/**
 * Fully synthesised audio (no sound files): engine, footsteps, ambience, UI sounds, horn and an optional
 * generative music bed. Everything starts only after the first user gesture (browser autoplay rules).
 */
import { musicTick } from './music'

let ctx: AudioContext | null = null
let master: GainNode
let noiseBuf: AudioBuffer

// engine
let engOsc1: OscillatorNode, engOsc2: OscillatorNode, engFilter: BiquadFilterNode, engGain: GainNode
// ambience
let cityGain: GainNode, trafficGain: GainNode, cricketGain: GainNode, indoorFilter: BiquadFilterNode, rainGain: GainNode, sirenOsc: OscillatorNode, sirenGain: GainNode
// music
let musicGain: GainNode
let wantVolume = 0.6

export type Sfx = 'click' | 'hover' | 'door' | 'talk' | 'buy' | 'horn' | 'hit' | 'toast' | 'deny'

export function audioReady() {
  return !!ctx
}

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume()
    return
  }
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!AC) return
  ctx = new AC()
  const comp = ctx.createDynamicsCompressor()
  master = ctx.createGain()
  master.gain.value = wantVolume
  master.connect(comp).connect(ctx.destination)

  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const d = noiseBuf.getChannelData(0)
  let b0 = 0
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1
    b0 = 0.97 * b0 + 0.03 * w // brown-ish
    d[i] = b0 * 6 + w * 0.2
  }

  // engine
  engOsc1 = ctx.createOscillator()
  engOsc2 = ctx.createOscillator()
  engOsc1.type = 'sawtooth'
  engOsc2.type = 'square'
  engFilter = ctx.createBiquadFilter()
  engFilter.type = 'lowpass'
  engGain = ctx.createGain()
  engGain.gain.value = 0
  engOsc1.connect(engFilter)
  engOsc2.connect(engFilter)
  engFilter.connect(engGain).connect(master)
  engOsc1.start()
  engOsc2.start()

  // ambience: filtered noise beds
  indoorFilter = ctx.createBiquadFilter()
  indoorFilter.type = 'lowpass'
  indoorFilter.frequency.value = 20000
  indoorFilter.connect(master)
  const bed = (freq: number, q = 0.7) => {
    const src = ctx!.createBufferSource()
    src.buffer = noiseBuf
    src.loop = true
    const f = ctx!.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx!.createGain()
    g.gain.value = 0
    src.connect(f).connect(g).connect(indoorFilter)
    src.start()
    return g
  }
  cityGain = bed(500)
  trafficGain = bed(180)
  rainGain = bed(5200, 0.4)
  // police siren: a slowly swept square wave
  sirenOsc = ctx.createOscillator()
  sirenOsc.type = 'square'
  sirenGain = ctx.createGain()
  sirenGain.gain.value = 0
  const sirenFilter = ctx.createBiquadFilter()
  sirenFilter.type = 'lowpass'
  sirenFilter.frequency.value = 2200
  sirenOsc.connect(sirenFilter).connect(sirenGain).connect(indoorFilter)
  sirenOsc.start()
  // crickets: amplitude-modulated high tone
  const cr = ctx.createOscillator()
  cr.frequency.value = 4300
  const crAm = ctx.createGain()
  crAm.gain.value = 0
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 28
  const lfoG = ctx.createGain()
  lfoG.gain.value = 0.5
  lfo.connect(lfoG).connect(crAm.gain)
  cricketGain = ctx.createGain()
  cricketGain.gain.value = 0
  cr.connect(crAm).connect(cricketGain).connect(indoorFilter)
  cr.start()
  lfo.start()

  musicGain = ctx.createGain()
  musicGain.gain.value = 0
  musicGain.connect(master)
}

export function setVolume(v: number) {
  wantVolume = v
  if (ctx) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05)
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slideTo?: number, dest?: AudioNode) {
  if (!ctx) return
  const t = ctx.currentTime + when
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(dest ?? master)
  o.start(t)
  o.stop(t + dur + 0.05)
}

function noiseBurst(dur: number, freq: number, vol: number, q = 1, when = 0) {
  if (!ctx) return
  const t = ctx.currentTime + when
  const s = ctx.createBufferSource()
  s.buffer = noiseBuf
  s.loop = true
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = freq
  f.Q.value = q
  const g = ctx.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  s.connect(f).connect(g).connect(master)
  s.start(t, Math.random())
  s.stop(t + dur + 0.05)
}

export function sfx(name: Sfx) {
  if (!ctx) return
  switch (name) {
    case 'click':
      tone(660, 0.07, 'square', 0.08)
      break
    case 'hover':
      tone(880, 0.04, 'sine', 0.03)
      break
    case 'door':
      noiseBurst(0.18, 300, 0.35, 0.8)
      tone(180, 0.2, 'triangle', 0.12, 0.05, 120)
      break
    case 'talk':
      tone(320, 0.09, 'triangle', 0.08)
      tone(400, 0.09, 'triangle', 0.08, 0.1)
      break
    case 'buy':
      tone(1320, 0.1, 'sine', 0.12)
      tone(1760, 0.18, 'sine', 0.12, 0.09)
      break
    case 'deny':
      tone(180, 0.2, 'sawtooth', 0.1, 0, 110)
      break
    case 'toast':
      tone(740, 0.12, 'sine', 0.08)
      break
    case 'hit':
      noiseBurst(0.25, 120, 0.6, 0.7)
      tone(90, 0.25, 'sine', 0.3, 0, 40)
      break
    case 'horn': {
      // one short beep
      const v = buildHorn(ctx, master, 1)
      v.stop(ctx.currentTime + 0.42)
      break
    }
  }
}

/**
 * A car horn: two diaphragm horns a minor third apart (about 415 Hz and 510 Hz). Each is a pair of slightly detuned
 * sawtooth waves (their beating gives the characteristic buzz), pushed through a soft clipper for the reedy harmonics, then
 * shaped by two brass-like resonances. Fast attack with a tiny pitch droop, quick release. Works on any audio context, so it
 * can also be rendered offline for testing.
 */
export function buildHorn(c: BaseAudioContext, dest: AudioNode, pitch: number): { stop: (when: number) => void } {
  const t = c.currentTime
  const out = c.createGain()
  out.gain.setValueAtTime(0.0001, t)
  out.gain.linearRampToValueAtTime(0.34, t + 0.012)
  out.gain.exponentialRampToValueAtTime(0.24, t + 0.14)
  const clip = c.createWaveShaper()
  const curve = new Float32Array(1024)
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1
    curve[i] = Math.tanh(x * 2.6) * 0.8
  }
  clip.curve = curve
  const r1 = c.createBiquadFilter()
  r1.type = 'peaking'
  r1.frequency.value = 980
  r1.Q.value = 1.6
  r1.gain.value = 7
  const r2 = c.createBiquadFilter()
  r2.type = 'peaking'
  r2.frequency.value = 2050
  r2.Q.value = 1.4
  r2.gain.value = 5
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 3600
  const hp = c.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 160
  const mix = c.createGain()
  mix.gain.value = 0.22
  mix.connect(clip).connect(r1).connect(r2).connect(lp).connect(hp).connect(out).connect(dest)
  const oscs: OscillatorNode[] = []
  for (const [f, beat] of [
    [415, 1.0055],
    [510, 1.0048],
  ] as const) {
    for (const k of [1, beat]) {
      const o = c.createOscillator()
      o.type = 'sawtooth'
      const hz = f * pitch * k
      o.frequency.setValueAtTime(hz * 1.045, t) // a small droop as the diaphragm gets going
      o.frequency.exponentialRampToValueAtTime(hz, t + 0.07)
      o.connect(mix)
      o.start(t)
      oscs.push(o)
    }
  }
  let done = false
  return {
    stop: (when: number) => {
      if (done) return
      done = true
      const w = Math.max(when, c.currentTime)
      out.gain.cancelScheduledValues(w)
      out.gain.setTargetAtTime(0.0001, w, 0.018)
      for (const o of oscs) o.stop(w + 0.14)
    },
  }
}

/** Pitch of the horn per vehicle: small and light = higher, big and heavy = lower. */
const HORN_PITCH: Record<string, number> = { sedan: 1, subaru: 1.05, apex: 1.12, suv: 0.88, pickup: 0.8, van: 0.74, bike: 1.4 }
let hornVoice: { stop: (when: number) => void } | null = null
/** Holds the horn while the button is down; it sounds for as long as it is held. */
export function hornHold(on: boolean, vehicle = 'sedan') {
  if (!ctx) return
  if (on && !hornVoice) hornVoice = buildHorn(ctx, master, HORN_PITCH[vehicle] ?? 1)
  else if (!on && hornVoice) {
    hornVoice.stop(ctx.currentTime)
    hornVoice = null
  }
}

export interface AudioFrame {
  dt: number
  playing: boolean
  inCar: boolean
  carSpeed: number // m/s, along the car
  throttle: number // 0..1
  walkSpeed: number
  grounded: boolean
  sprint: boolean
  hour: number
  night: number
  nearTraffic: number // 0..1
  rain: number // 0..1
  siren: number // 0..1 (nearest police car)
  indoors: boolean
  music: boolean
}

let stepTimer = 0
let birdTimer = 2
const GEARS = [0, 14, 25, 36, 48, 70]

export function updateAudio(f: AudioFrame) {
  if (!ctx) return
  const t = ctx.currentTime
  const quiet = !f.playing
  // engine
  const sp = Math.abs(f.carSpeed)
  let gear = 0
  while (gear < GEARS.length - 2 && sp > GEARS[gear + 1]) gear++
  const frac = (sp - GEARS[gear]) / (GEARS[gear + 1] - GEARS[gear])
  const rpm = 900 + Math.min(1, frac) * 5200 + f.throttle * 400
  const hz = rpm / 60
  engOsc1.frequency.setTargetAtTime(hz, t, 0.05)
  engOsc2.frequency.setTargetAtTime(hz * 0.5, t, 0.05)
  engFilter.frequency.setTargetAtTime(300 + rpm * 0.35 + f.throttle * 400, t, 0.08)
  const eg = f.inCar && !quiet ? 0.05 + f.throttle * 0.08 + Math.min(1, rpm / 7000) * 0.04 : 0
  engGain.gain.setTargetAtTime(eg, t, 0.1)

  // ambience
  const outdoorsMask = f.indoors ? 0.15 : 1
  indoorFilter.frequency.setTargetAtTime(f.indoors ? 700 : 20000, t, 0.2)
  cityGain.gain.setTargetAtTime(quiet ? 0 : (0.04 + 0.02 * (1 - f.night)) * outdoorsMask, t, 0.3)
  trafficGain.gain.setTargetAtTime(quiet ? 0 : (0.02 + 0.22 * f.nearTraffic) * outdoorsMask * (f.indoors ? 0.5 : 1), t, 0.3)
  cricketGain.gain.setTargetAtTime(quiet || f.indoors ? 0 : 0.012 * f.night, t, 0.5)
  birdTimer -= f.dt
  if (birdTimer < 0 && f.playing && !f.indoors) {
    birdTimer = 3 + Math.random() * 6
    if (f.night < 0.3) {
      const base = 2200 + Math.random() * 1800
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) tone(base, 0.09, 'sine', 0.025, i * 0.12, base * 1.4)
    }
  }

  rainGain.gain.setTargetAtTime(quiet ? 0 : f.rain * 0.11 * outdoorsMask, t, 0.4)
  sirenGain.gain.setTargetAtTime(quiet || f.indoors ? 0 : f.siren * 0.05, t, 0.15)
  sirenOsc.frequency.setTargetAtTime(700 + 350 * Math.sin(t * 5.2), t, 0.03)

  // footsteps
  if (f.playing && !f.inCar && f.grounded && f.walkSpeed > 0.5) {
    stepTimer -= f.dt
    if (stepTimer <= 0) {
      stepTimer = f.sprint ? 0.27 : f.walkSpeed < 2.2 ? 0.6 : 0.42
      noiseBurst(0.07, f.indoors ? 1400 : 900, f.sprint ? 0.22 : 0.14, 1.2)
    }
  } else stepTimer = 0

  // generative music bed (optional)
  musicGain.gain.setTargetAtTime(f.music && f.playing ? 0.55 : 0, t, 0.8)
  musicTick(ctx, musicGain, f.music && f.playing, f.night)
}

export function honk() {
  sfx('horn')
}

/** Rolling thunder after a lightning flash. */
export function thunder(delay: number) {
  if (!ctx) return
  noiseBurst(2.8, 140, 0.9, 0.4, delay)
  tone(60, 2.2, 'sine', 0.35, delay, 28)
}

if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__audio = { buildHorn, hornHold }
