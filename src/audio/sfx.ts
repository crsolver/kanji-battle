import { midiToHz, noise, tone } from './engine'

const PENTATONIC = [0, 2, 4, 7, 9]

/** A rising pentatonic note for each step of a combo, so streaks sound like climbing. */
export const comboNote = (combo: number) => {
  const n = Math.min(Math.max(combo, 0), 14)
  return 64 + PENTATONIC[n % 5] + 12 * Math.floor(n / 5)
}

const arp = (notes: number[], step: number, type: OscillatorType, vol: number, dur = 0.16) =>
  notes.forEach((m, i) => tone({ freq: midiToHz(m), dur, type, vol, delay: i * step }))

/** Sound effects. Every call is a silent no-op until the browser allows audio. */
export const sfx = {
  select: () => tone({ freq: 660, dur: 0.05, type: 'square', vol: 0.1 }),

  lock() {
    tone({ freq: 180, dur: 0.08, type: 'square', vol: 0.13 })
    tone({ freq: 140, dur: 0.11, type: 'square', vol: 0.13, delay: 0.09 })
  },

  hit(combo: number) {
    const m = comboNote(combo)
    noise({ dur: 0.09, vol: 0.16, lowpass: 3200, sweepTo: 700 })
    tone({ freq: midiToHz(m), dur: 0.12, type: 'square', vol: 0.15, slideTo: midiToHz(m + 12) })
    tone({ freq: midiToHz(m + 7), dur: 0.1, type: 'triangle', vol: 0.12, delay: 0.06 })
  },

  explode() {
    noise({ dur: 0.36, vol: 0.28, lowpass: 2600, sweepTo: 180, delay: 0.09 })
    tone({ freq: 190, dur: 0.3, type: 'sawtooth', vol: 0.18, slideTo: 34, delay: 0.09 })
  },

  miss() {
    tone({ freq: 250, dur: 0.28, type: 'sawtooth', vol: 0.18, slideTo: 85 })
    noise({ dur: 0.16, vol: 0.15, lowpass: 900 })
  },

  combo: () => arp([72, 76, 79, 84], 0.05, 'square', 0.11, 0.12),

  pass() {
    arp([60, 64, 67, 72, 76], 0.09, 'square', 0.15)
    tone({ freq: midiToHz(79), dur: 0.5, type: 'square', vol: 0.15, delay: 0.5 })
    tone({ freq: midiToHz(72), dur: 0.5, type: 'triangle', vol: 0.15, delay: 0.5 })
  },

  fail: () => arp([67, 64, 61, 58], 0.2, 'triangle', 0.2, 0.3),

  levelUp() {
    arp([67, 71, 74, 79, 83, 86, 91], 0.07, 'square', 0.13, 0.18)
    tone({ freq: midiToHz(91), dur: 0.7, type: 'square', vol: 0.13, delay: 0.5 })
    tone({ freq: midiToHz(79), dur: 0.7, type: 'triangle', vol: 0.15, delay: 0.5 })
  },

  unlock: () => arp([72, 76, 79, 84, 88, 91], 0.06, 'triangle', 0.12, 0.2),

  bossAppear() {
    tone({ freq: 55, dur: 0.9, type: 'sawtooth', vol: 0.18, slideTo: 40 })
    noise({ dur: 0.8, vol: 0.14, lowpass: 400 })
    arp([48, 48, 51], 0.22, 'square', 0.13, 0.2)
  },

  bossWin() {
    noise({ dur: 0.6, vol: 0.3, lowpass: 3000, sweepTo: 150 })
    arp([60, 64, 67, 72, 76, 79, 84], 0.08, 'square', 0.15)
    tone({ freq: midiToHz(84), dur: 0.8, type: 'square', vol: 0.15, delay: 0.6 })
    tone({ freq: midiToHz(72), dur: 0.8, type: 'triangle', vol: 0.15, delay: 0.6 })
  },
}
