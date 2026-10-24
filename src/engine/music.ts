/**
 * "Neon Boulevard" — an original instrumental written for Urban Legends 3D.
 *
 * Everything is composed and synthesised in code (no samples, no recordings, no borrowed melodies or chord charts), so
 * there is nothing third-party in it. 100 BPM, A minor / dorian, 32 bars (about 77 s) that loop:
 *   A  intro    pads, hats, soft keys, bass enters halfway
 *   B  groove   drums, bass, electric-piano stabs, a little answering lead
 *   C  lift     the full band plus the main melody and an arpeggio
 *   D  break    pads and a gentle piano, a half-time bass, then back into A
 * The same scheduler drives the live game (looked-ahead on the audio clock) and an offline render that can be exported
 * as a WAV file.
 */
export const TRACK = { title: 'Neon Boulevard', bpm: 100, bars: 32 }
const STEP = 60 / TRACK.bpm / 4 // one sixteenth note, in seconds
const STEPS = TRACK.bars * 16
const SWING = 0.1 // odd sixteenths arrive a touch late

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

interface Chord {
  root: number // bass note
  notes: number[] // voicing for keys / pads
}
const CH = {
  Am9: { root: 33, notes: [57, 60, 64, 67, 71] },
  Fmaj7: { root: 29, notes: [53, 57, 60, 64] },
  Cmaj7: { root: 36, notes: [52, 55, 59, 64] },
  G6: { root: 31, notes: [55, 59, 62, 64] },
  Dm9: { root: 38, notes: [50, 53, 57, 60, 64] },
  Em7: { root: 40, notes: [52, 55, 59, 62] },
  E7: { root: 40, notes: [52, 56, 59, 62] },
  E7sus: { root: 40, notes: [52, 57, 59, 62] },
} satisfies Record<string, Chord>

const PROG: Chord[][] = [
  // A
  [CH.Am9, CH.Fmaj7, CH.Cmaj7, CH.G6, CH.Am9, CH.Fmaj7, CH.Cmaj7, CH.G6],
  // B
  [CH.Am9, CH.Fmaj7, CH.Dm9, CH.E7, CH.Am9, CH.Fmaj7, CH.Dm9, CH.E7],
  // C
  [CH.Fmaj7, CH.G6, CH.Em7, CH.Am9, CH.Fmaj7, CH.G6, CH.Dm9, CH.E7],
  // D
  [CH.Fmaj7, CH.Em7, CH.Dm9, CH.Am9, CH.Fmaj7, CH.Em7, CH.Dm9, CH.E7sus],
]

type Note = [step: number, midi: number, len: number]
// main melody, section C (one array per bar)
const MELODY_C: Note[][] = [
  [[0, 76, 3], [4, 72, 2], [6, 76, 2], [8, 79, 6]],
  [[0, 79, 3], [4, 76, 2], [6, 74, 2], [8, 71, 6]],
  [[0, 71, 2], [2, 74, 2], [4, 76, 4], [10, 79, 2], [12, 76, 3]],
  [[0, 69, 4], [4, 72, 2], [6, 76, 2], [8, 81, 8]],
  [[0, 79, 3], [4, 77, 2], [6, 76, 2], [8, 72, 6]],
  [[0, 74, 3], [4, 76, 2], [6, 79, 2], [8, 83, 6]],
  [[0, 81, 2], [2, 79, 2], [4, 76, 4], [10, 77, 2], [12, 74, 4]],
  [[0, 76, 2], [2, 80, 2], [4, 83, 4], [10, 81, 2], [12, 76, 4]],
]
// short answering phrases in the second half of section B
const MELODY_B: Note[][] = [
  [],
  [],
  [],
  [],
  [[8, 76, 2], [10, 79, 2], [12, 76, 4]],
  [[8, 74, 2], [10, 76, 2], [12, 71, 4]],
  [[8, 72, 2], [10, 74, 2], [12, 76, 4]],
  [[8, 74, 2], [10, 72, 2], [12, 71, 2], [14, 69, 2]],
]
// slow floating line in the break
const MELODY_D: Note[][] = [
  [[0, 72, 16]],
  [[0, 71, 16]],
  [[0, 69, 12]],
  [[0, 67, 8], [8, 69, 8]],
  [[0, 72, 16]],
  [[0, 71, 16]],
  [[0, 69, 12]],
  [[0, 71, 12]],
]

const BASS_GROOVE: [number, number, number][] = [[0, 0, 3], [3, 0, 1], [6, 12, 1], [8, 0, 2], [11, 7, 1], [14, 0, 1]]
const BASS_HALF: [number, number, number][] = [[0, 0, 6], [8, 7, 4], [12, 12, 2]]

// ---- shared per-context mixer -----------------------------------------------------------------------------------
interface Mix {
  drums: GainNode
  bass: GainNode
  keys: GainNode
  pad: GainNode
  lead: GainNode
  arp: GainNode
  rev: GainNode
  noise: AudioBuffer
}
const mixes = new WeakMap<BaseAudioContext, Mix>()

function getMix(c: BaseAudioContext, dest: AudioNode): Mix {
  const m = mixes.get(c)
  if (m) return m
  const g = (v: number) => {
    const n = c.createGain()
    n.gain.value = v
    n.connect(dest)
    return n
  }
  // a small hall made from decaying noise
  const len = Math.floor(c.sampleRate * 2.2)
  const ir = c.createBuffer(2, len, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6)
  }
  const conv = c.createConvolver()
  conv.buffer = ir
  const revIn = c.createGain()
  revIn.gain.value = 0.7
  const revOut = c.createGain()
  revOut.gain.value = 0.55
  revIn.connect(conv).connect(revOut).connect(dest)
  // noise for drums
  const noise = c.createBuffer(1, c.sampleRate, c.sampleRate)
  const nd = noise.getChannelData(0)
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1
  const mix: Mix = { drums: g(0.85), bass: g(0.3), keys: g(0.55), pad: g(0.42), lead: g(0.4), arp: g(0.3), rev: revIn, noise }
  mixes.set(c, mix)
  return mix
}

// ---- instruments --------------------------------------------------------------------------------------------------
function kick(c: BaseAudioContext, m: Mix, t: number, vel: number) {
  const o = c.createOscillator()
  const g = c.createGain()
  o.frequency.setValueAtTime(150, t)
  o.frequency.exponentialRampToValueAtTime(44, t + 0.11)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(vel, t + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
  o.connect(g).connect(m.drums)
  o.start(t)
  o.stop(t + 0.32)
}

function noiseHit(c: BaseAudioContext, m: Mix, t: number, type: BiquadFilterType, freq: number, q: number, vol: number, dur: number, send = 0) {
  const s = c.createBufferSource()
  s.buffer = m.noise
  s.loop = true
  const f = c.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  const g = c.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  s.connect(f).connect(g).connect(m.drums)
  if (send > 0) {
    const sg = c.createGain()
    sg.gain.value = send
    g.connect(sg).connect(m.rev)
  }
  s.start(t, Math.random() * 0.5)
  s.stop(t + dur + 0.03)
}

function snare(c: BaseAudioContext, m: Mix, t: number, vel: number) {
  noiseHit(c, m, t, 'bandpass', 1900, 0.8, 0.55 * vel, 0.2, 0.25)
  const o = c.createOscillator()
  o.type = 'triangle'
  o.frequency.setValueAtTime(210, t)
  o.frequency.exponentialRampToValueAtTime(150, t + 0.09)
  const g = c.createGain()
  g.gain.setValueAtTime(0.32 * vel, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14)
  o.connect(g).connect(m.drums)
  o.start(t)
  o.stop(t + 0.16)
}

const hat = (c: BaseAudioContext, m: Mix, t: number, vel: number, open = false) => noiseHit(c, m, t, 'highpass', 7200, 0.7, 0.2 * vel, open ? 0.22 : 0.045)

function bassNote(c: BaseAudioContext, m: Mix, t: number, midi: number, dur: number, vel: number, bright: number) {
  const f = mtof(midi)
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.Q.value = 3
  lp.frequency.setValueAtTime(500 + 900 * bright, t)
  lp.frequency.exponentialRampToValueAtTime(220, t + 0.25)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(vel, t + 0.012)
  g.gain.setValueAtTime(vel, t + Math.max(0.02, dur - 0.07))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05)
  const saw = c.createOscillator()
  saw.type = 'sawtooth'
  saw.frequency.value = f
  const sub = c.createOscillator()
  sub.type = 'sine'
  sub.frequency.value = f
  const sg = c.createGain()
  sg.gain.value = 0.6
  saw.connect(lp)
  lp.connect(g)
  sub.connect(sg).connect(g)
  g.connect(m.bass)
  saw.start(t)
  sub.start(t)
  saw.stop(t + dur + 0.1)
  sub.stop(t + dur + 0.1)
}

/** Electric-piano voice: FM with a quickly fading "tine" over a warm body. */
function epiano(c: BaseAudioContext, m: Mix, t: number, midi: number, dur: number, vel: number, bright: number, send = 0.3) {
  const f = mtof(midi)
  const car = c.createOscillator()
  const mod = c.createOscillator()
  const tine = c.createOscillator()
  const mg = c.createGain()
  const tg = c.createGain()
  car.frequency.value = f
  mod.frequency.value = f
  tine.frequency.value = f * 14
  mg.gain.setValueAtTime(f * (0.9 + 1.4 * bright) * vel, t)
  mg.gain.exponentialRampToValueAtTime(f * 0.12, t + 0.35)
  tg.gain.setValueAtTime(f * 0.7 * vel, t)
  tg.gain.exponentialRampToValueAtTime(0.01, t + 0.06)
  mod.connect(mg).connect(car.frequency)
  tine.connect(tg).connect(car.frequency)
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 1800 + 3200 * bright
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.5 * vel, t + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.5)
  car.connect(lp).connect(g).connect(m.keys)
  if (send > 0) {
    const sg = c.createGain()
    sg.gain.value = send
    g.connect(sg).connect(m.rev)
  }
  for (const o of [car, mod, tine]) {
    o.start(t)
    o.stop(t + dur + 0.6)
  }
}

function padChord(c: BaseAudioContext, m: Mix, t: number, notes: number[], dur: number, bright: number, vel = 1) {
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(500, t)
  lp.frequency.linearRampToValueAtTime(700 + 1300 * bright, t + dur * 0.6)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.07 * vel, t + 0.7)
  g.gain.setValueAtTime(0.07 * vel, t + Math.max(0.8, dur - 0.5))
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.7)
  lp.connect(g).connect(m.pad)
  const sg = c.createGain()
  sg.gain.value = 0.5
  g.connect(sg).connect(m.rev)
  for (const n of notes) {
    for (const cents of [-7, 7]) {
      const o = c.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = mtof(n) * Math.pow(2, cents / 1200)
      o.connect(lp)
      o.start(t)
      o.stop(t + dur + 0.8)
    }
  }
}

function pluck(c: BaseAudioContext, m: Mix, t: number, midi: number, vel: number, bright: number) {
  const o = c.createOscillator()
  o.type = 'triangle'
  o.frequency.value = mtof(midi)
  const o2 = c.createOscillator()
  o2.type = 'square'
  o2.frequency.value = mtof(midi) * 2
  const g2 = c.createGain()
  g2.gain.value = 0.18
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(900 + 3000 * bright, t)
  lp.frequency.exponentialRampToValueAtTime(500, t + 0.2)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.5 * vel, t + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28)
  o.connect(lp)
  o2.connect(g2).connect(lp)
  lp.connect(g).connect(m.arp)
  const sg = c.createGain()
  sg.gain.value = 0.45
  g.connect(sg).connect(m.rev)
  o.start(t)
  o2.start(t)
  o.stop(t + 0.35)
  o2.stop(t + 0.35)
}

function leadNote(c: BaseAudioContext, m: Mix, t: number, midi: number, dur: number, vel: number, bright: number) {
  const f = mtof(midi)
  const o = c.createOscillator()
  o.type = 'sawtooth'
  o.frequency.value = f
  const o2 = c.createOscillator()
  o2.type = 'sine'
  o2.frequency.value = f
  const og = c.createGain()
  og.gain.value = 0.35
  // gentle vibrato that fades in
  const lfo = c.createOscillator()
  lfo.frequency.value = 5.4
  const lg = c.createGain()
  lg.gain.setValueAtTime(0, t)
  lg.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.5, dur))
  lfo.connect(lg)
  lg.connect(o.frequency)
  lg.connect(o2.frequency)
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 1500 + 2300 * bright
  lp.Q.value = 1.2
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.55 * vel, t + 0.025)
  g.gain.setValueAtTime(0.5 * vel, t + Math.max(0.04, dur - 0.12))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.18)
  o.connect(og).connect(lp)
  o2.connect(lp)
  lp.connect(g).connect(m.lead)
  const sg = c.createGain()
  sg.gain.value = 0.55
  g.connect(sg).connect(m.rev)
  for (const x of [o, o2, lfo]) {
    x.start(t)
    x.stop(t + dur + 0.25)
  }
}

// ---- the arrangement ----------------------------------------------------------------------------------------------
/** Schedules everything that happens on one sixteenth-note step. `bright` is 1 by day and about 0.3 at night. */
function playStep(c: BaseAudioContext, m: Mix, t0: number, idx: number, bright: number) {
  const bar = Math.floor(idx / 16)
  const s = idx % 16
  const sec = Math.floor(bar / 8) // 0..3 = A B C D
  const bi = bar % 8
  const chord = PROG[sec][bi]
  const t = t0 + (s % 2 === 1 ? SWING * STEP : 0)
  const human = () => (Math.random() - 0.5) * 0.006
  const last = bi === 7

  // drums
  if (sec === 0) {
    if (s % 4 === 2) hat(c, m, t, 0.5 + (s === 2 ? 0.2 : 0))
    if (s === 0 && bi >= 2) kick(c, m, t, 0.7)
    if (s === 8 && bi >= 4) kick(c, m, t, 0.55)
    if (s === 12 && bi >= 6) snare(c, m, t, 0.35)
  } else if (sec === 1 || sec === 2) {
    if (s === 0 || s === 7 || s === 10) kick(c, m, t, s === 0 ? 0.95 : 0.7)
    if (s === 4 || s === 12) snare(c, m, t, 0.9)
    if (s % 2 === 0) hat(c, m, t, s % 4 === 0 ? 0.85 : 0.55)
    if (s === 14 && !last) hat(c, m, t, 0.7, true)
    if (last && s >= 13) snare(c, m, t, 0.45 + (s - 13) * 0.15) // fill into the next section (the backbeat snare already sits on step 12)
  } else {
    if (s === 0 && (bi % 2 === 0)) kick(c, m, t, 0.65)
    if (s === 8 && bi % 2 === 0) snare(c, m, t, 0.3)
    if (s % 4 === 2) hat(c, m, t, 0.4)
  }

  // bass
  const bassOn = sec === 1 || sec === 2 || (sec === 0 && bi >= 4) || sec === 3
  if (bassOn) {
    const pat = sec === 0 || sec === 3 ? BASS_HALF : BASS_GROOVE
    for (const [st, iv, len] of pat) if (st === s) bassNote(c, m, t, chord.root + iv, len * STEP * 0.95, sec === 2 ? 0.55 : 0.5, bright)
  }

  // pads hold the harmony in A and D, and quietly under C
  if (s === 0) {
    if (sec === 0 || sec === 3) padChord(c, m, t, chord.notes, 16 * STEP, bright, sec === 0 ? 1 : 0.85)
    else if (sec === 2) padChord(c, m, t, chord.notes, 16 * STEP, bright, 0.5)
  }

  // keys
  if (sec === 0) {
    if (s === 0 || (s === 8 && bi % 2 === 1)) chord.notes.forEach((n, i) => epiano(c, m, t + i * 0.012 + human(), n, 0.7, 0.45, bright, 0.4))
  } else if (sec === 1 || sec === 2) {
    if ([0, 3, 6, 10].includes(s) && !(sec === 2 && s === 6)) {
      const v = s === 0 ? 0.62 : 0.5
      chord.notes.slice(0, 4).forEach((n, i) => epiano(c, m, t + i * 0.008 + human(), n, 0.28, v, bright, 0.25))
    }
  } else if (s % 4 === 0) {
    const n = chord.notes[(s / 4 + bi) % chord.notes.length]
    epiano(c, m, t + human(), n + 12, 0.8, 0.4, bright, 0.5)
  }

  // arpeggio (C, and the last bars of B)
  if ((sec === 2 || (sec === 1 && bi >= 6)) && s % 2 === 0) {
    const order = [0, 1, 2, 3, 2, 1, 3, 2]
    const n = chord.notes[order[(s / 2) % 8] % chord.notes.length] + 12
    pluck(c, m, t + human(), n, 0.32 + (s % 4 === 0 ? 0.1 : 0), bright)
  }

  // melodies
  const phrase = sec === 2 ? MELODY_C[bi] : sec === 1 ? MELODY_B[bi] : sec === 3 ? MELODY_D[bi] : []
  for (const [st, midi, len] of phrase) {
    if (st === s) leadNote(c, m, t, midi, len * STEP, sec === 2 ? 0.85 : sec === 3 ? 0.55 : 0.6, bright)
  }
}

// ---- live playback -----------------------------------------------------------------------------------------------------
let next = 0
let idx = 0
let started = false

/** Called every frame by the audio engine. Keeps about half a second of music scheduled ahead of the audio clock. */
export function musicTick(c: AudioContext, dest: AudioNode, on: boolean, night: number) {
  const now = c.currentTime
  if (!on) {
    started = false
    return
  }
  if (!started) {
    started = true
    next = now + 0.25
  }
  if (next < now - 0.1) next = now + 0.1 // the tab was in the background: skip ahead instead of catching up
  const m = getMix(c, dest)
  const bright = 1 - 0.7 * night
  while (next < now + 0.5) {
    playStep(c, m, next, idx, bright)
    next += STEP
    idx = (idx + 1) % STEPS
  }
}

// ---- offline render / export -------------------------------------------------------------------------------------------
const TAIL = 3.5 // seconds of reverb / release after each chunk, mixed into the next one

/**
 * Renders the 32-bar loop in four 8-bar chunks (so progress can be reported and the browser stays responsive), overlap-adds
 * their tails, normalises to -1 dBFS and returns a 16-bit stereo WAV. 22.05 kHz is plenty for this arrangement.
 */
export async function renderTrackWav(sampleRate = 22050, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const chunkBars = 8
  const chunks = TRACK.bars / chunkBars
  const chunkSec = chunkBars * 16 * STEP
  const total = Math.ceil((TRACK.bars * 16 * STEP + TAIL + 0.1) * sampleRate)
  const L = new Float32Array(total)
  const R = new Float32Array(total)
  for (let k = 0; k < chunks; k++) {
    onProgress?.(k, chunks)
    await new Promise((r) => setTimeout(r, 0)) // let the page repaint between chunks
    const OAC = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext
    const oc = new OAC(2, Math.ceil((chunkSec + TAIL) * sampleRate), sampleRate)
    const comp = oc.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 3
    comp.connect(oc.destination)
    const m = getMix(oc, comp)
    for (let i = 0; i < chunkBars * 16; i++) playStep(oc, m, 0.05 + i * STEP, k * chunkBars * 16 + i, 0.8)
    const buf = await oc.startRendering()
    const off = Math.round(k * chunkSec * sampleRate)
    const l = buf.getChannelData(0)
    const r = buf.getChannelData(1)
    for (let i = 0; i < l.length && off + i < total; i++) {
      L[off + i] += l[i]
      R[off + i] += r[i]
    }
  }
  onProgress?.(chunks, chunks)
  let peak = 0
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]))
  const gain = peak > 0 ? 0.89 / peak : 1
  const out = new DataView(new ArrayBuffer(44 + total * 4))
  const w = (o: number, str: string) => [...str].forEach((ch, i) => out.setUint8(o + i, ch.charCodeAt(0)))
  w(0, 'RIFF')
  out.setUint32(4, 36 + total * 4, true)
  w(8, 'WAVE')
  w(12, 'fmt ')
  out.setUint32(16, 16, true)
  out.setUint16(20, 1, true)
  out.setUint16(22, 2, true)
  out.setUint32(24, sampleRate, true)
  out.setUint32(28, sampleRate * 4, true)
  out.setUint16(32, 4, true)
  out.setUint16(34, 16, true)
  w(36, 'data')
  out.setUint32(40, total * 4, true)
  for (let i = 0; i < total; i++) {
    out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i] * gain)) * 32767, true)
    out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i] * gain)) * 32767, true)
  }
  return new Blob([out], { type: 'audio/wav' })
}
