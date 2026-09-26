import { getSound, subscribeSound } from './settings'

/**
 * Tiny WebAudio synth. Browsers only allow audio after a user gesture, so the
 * context is created on the first key press or click and never before.
 */
let ctx: AudioContext | null = null
let sfxBus: GainNode | null = null
let musicBus: GainNode | null = null
let gestured = false
const onReady = new Set<() => void>()

export const midiToHz = (m: number) => 440 * 2 ** ((m - 69) / 12)

const MUSIC_LEVEL = 0.32

function applyGains() {
  const s = getSound()
  if (sfxBus) sfxBus.gain.value = s.sfx ? 1 : 0
  if (musicBus) musicBus.gain.value = s.music ? MUSIC_LEVEL : 0
}

/** The audio context, or null before the first gesture / without WebAudio. */
export function audio(): AudioContext | null {
  if (ctx) return ctx
  if (!gestured || typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  ctx = new Ctor()
  const master = ctx.createGain()
  master.gain.value = 0.6
  master.connect(ctx.destination)
  sfxBus = ctx.createGain()
  musicBus = ctx.createGain()
  sfxBus.connect(master)
  musicBus.connect(master)
  applyGains()
  subscribeSound(applyGains)
  return ctx
}

/** Run `fn` once audio is allowed (immediately if it already is). */
export function whenAudioReady(fn: () => void) {
  if (audio()) fn()
  else onReady.add(fn)
}

if (typeof window !== 'undefined') {
  const unlock = () => {
    gestured = true
    const c = audio()
    if (c?.state === 'suspended') c.resume()
    onReady.forEach((fn) => fn())
    onReady.clear()
  }
  for (const type of ['pointerdown', 'keydown', 'click', 'touchstart'] as const) {
    window.addEventListener(type, unlock, { capture: true })
  }
}

interface ToneOpts {
  freq: number
  dur: number
  type?: OscillatorType
  vol?: number
  /** Seconds from now, or absolute audio time with `at`. */
  delay?: number
  at?: number
  slideTo?: number
  bus?: 'sfx' | 'music'
}

export function tone(o: ToneOpts) {
  const c = audio()
  if (!c) return
  const t0 = o.at ?? c.currentTime + (o.delay ?? 0)
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = o.type ?? 'square'
  osc.frequency.setValueAtTime(o.freq, t0)
  if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t0 + o.dur)
  const vol = o.vol ?? 0.15
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.linearRampToValueAtTime(vol, t0 + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur)
  osc.connect(g)
  g.connect((o.bus === 'music' ? musicBus : sfxBus)!)
  osc.start(t0)
  osc.stop(t0 + o.dur + 0.03)
}

interface NoiseOpts {
  dur: number
  vol?: number
  delay?: number
  at?: number
  lowpass?: number
  sweepTo?: number
  bus?: 'sfx' | 'music'
}

let noiseBuffer: AudioBuffer | null = null

export function noise(o: NoiseOpts) {
  const c = audio()
  if (!c) return
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate)
    const d = noiseBuffer.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  const t0 = o.at ?? c.currentTime + (o.delay ?? 0)
  const src = c.createBufferSource()
  src.buffer = noiseBuffer
  src.loop = true
  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(o.lowpass ?? 4000, t0)
  if (o.sweepTo) filter.frequency.exponentialRampToValueAtTime(o.sweepTo, t0 + o.dur)
  const g = c.createGain()
  g.gain.setValueAtTime(o.vol ?? 0.2, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur)
  src.connect(filter)
  filter.connect(g)
  g.connect((o.bus === 'music' ? musicBus : sfxBus)!)
  src.start(t0)
  src.stop(t0 + o.dur + 0.03)
}
