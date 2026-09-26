import { audio, midiToHz, noise, tone, whenAudioReady } from './engine'
import { getSound, subscribeSound } from './settings'

export type ThemeId = 'N5' | 'N4' | 'N3' | 'N2' | 'N1' | 'boss'

export interface Theme {
  bpm: number
  /** MIDI note of scale degree 0 for the lead. */
  root: number
  /** Semitone offsets of the scale. */
  scale: number[]
  /** Scale degrees per eighth note (null = rest); 16 steps = two bars. */
  bass: (number | null)[]
  lead: (number | null)[]
  leadWave: OscillatorType
  bassWave: OscillatorType
  drums: boolean
}

const PENT = [0, 2, 4, 7, 9]
const MINOR_PENT = [0, 3, 5, 7, 10]
const MINOR = [0, 2, 3, 5, 7, 8, 10]
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10]
const LYDIAN = [0, 2, 4, 6, 7, 9, 11]

export const THEMES: Record<ThemeId, Theme> = {
  N5: {
    bpm: 116, root: 60, scale: PENT, leadWave: 'square', bassWave: 'triangle', drums: true,
    bass: [0, null, 0, null, 2, null, 2, null, 3, null, 3, null, 2, null, 1, null],
    lead: [4, null, 5, 6, null, 5, 4, null, 2, null, 4, 5, null, 4, 2, null],
  },
  N4: {
    bpm: 92, root: 57, scale: MINOR_PENT, leadWave: 'triangle', bassWave: 'sine', drums: false,
    bass: [0, null, null, null, 2, null, null, null, 1, null, null, null, 3, null, null, null],
    lead: [4, null, 3, null, 2, null, 3, 4, null, null, 5, null, 4, null, 2, null],
  },
  N3: {
    bpm: 128, root: 57, scale: MINOR, leadWave: 'sawtooth', bassWave: 'square', drums: true,
    bass: [0, 0, null, 0, 0, null, 2, null, 3, 3, null, 3, 4, null, 2, null],
    lead: [null, 7, null, 6, 4, null, 7, null, 9, null, 7, 6, null, 4, 2, null],
  },
  N2: {
    bpm: 138, root: 55, scale: PHRYGIAN, leadWave: 'sawtooth', bassWave: 'square', drums: true,
    bass: [0, null, 0, 1, 0, null, 0, 4, 0, null, 0, 1, 0, null, 3, 4],
    lead: [7, null, 8, 7, null, 5, null, 4, 7, null, 8, 9, null, 8, 7, null],
  },
  N1: {
    bpm: 80, root: 60, scale: LYDIAN, leadWave: 'sine', bassWave: 'triangle', drums: false,
    bass: [0, null, null, null, null, null, 4, null, 3, null, null, null, null, null, 2, null],
    lead: [4, null, null, 6, null, null, 8, null, 7, null, null, 5, null, null, 4, null],
  },
  boss: {
    bpm: 156, root: 52, scale: MINOR, leadWave: 'sawtooth', bassWave: 'square', drums: true,
    bass: [0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 5, 5, 4, 3],
    lead: [7, null, 7, 8, null, 7, 5, null, 7, null, 9, 10, null, 9, 8, null],
  },
}

/** MIDI note for a scale degree (degrees past the scale wrap into higher octaves). */
export function degreeToMidi(theme: Theme, degree: number, octaveShift = 0): number {
  const n = theme.scale.length
  const oct = Math.floor(degree / n)
  return theme.root + theme.scale[((degree % n) + n) % n] + 12 * (oct + octaveShift)
}

const STEPS = 16
const LOOKAHEAD = 0.28

let wanted: ThemeId | null = null
let playing: ThemeId | null = null
let timer: ReturnType<typeof setInterval> | null = null
let nextTime = 0
let step = 0

function playStep(theme: Theme, i: number, at: number) {
  const eighth = 60 / theme.bpm / 2
  const b = theme.bass[i]
  if (b !== null) tone({ freq: midiToHz(degreeToMidi(theme, b, -2)), dur: eighth * 1.6, type: theme.bassWave, vol: 0.2, at, bus: 'music' })
  const l = theme.lead[i]
  if (l !== null) tone({ freq: midiToHz(degreeToMidi(theme, l)), dur: eighth * 1.4, type: theme.leadWave, vol: 0.09, at, bus: 'music' })
  if (theme.drums) {
    if (i % 4 === 0) tone({ freq: 140, dur: 0.12, type: 'sine', vol: 0.32, at, slideTo: 40, bus: 'music' })
    if (i % 2 === 1) noise({ dur: 0.04, vol: 0.06, lowpass: 9000, at, bus: 'music' })
  }
}

function tick() {
  const c = audio()
  if (!c || !playing) return
  const theme = THEMES[playing]
  const eighth = 60 / theme.bpm / 2
  if (nextTime < c.currentTime) nextTime = c.currentTime + 0.05
  while (nextTime < c.currentTime + LOOKAHEAD) {
    playStep(theme, step, nextTime)
    nextTime += eighth
    step = (step + 1) % STEPS
  }
}

function halt() {
  if (timer) clearInterval(timer)
  timer = null
  playing = null
}

function sync() {
  if (!wanted || !getSound().music) return halt()
  if (playing === wanted) return
  halt()
  whenAudioReady(() => {
    if (!wanted || !getSound().music) return
    playing = wanted
    step = 0
    nextTime = 0
    timer = setInterval(tick, 60)
  })
}

subscribeSound(sync)

/** Play (or keep playing) a theme. Starts once audio is allowed and music is on. */
export const music = {
  play(id: ThemeId) {
    wanted = id
    sync()
  },
  stop() {
    wanted = null
    halt()
  },
}
