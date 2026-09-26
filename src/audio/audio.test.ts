import { describe, expect, it } from 'vitest'
import { audio, midiToHz } from './engine'
import { THEMES, degreeToMidi, type ThemeId } from './music'
import { comboNote, sfx } from './sfx'
import { getSound, setSound, subscribeSound } from './settings'

describe('music themes', () => {
  const ids = Object.keys(THEMES) as ThemeId[]

  it('has a theme for every world and for bosses', () => {
    expect(ids.sort()).toEqual(['N1', 'N2', 'N3', 'N4', 'N5', 'boss'])
  })

  it('every pattern is 16 steps and only uses scale degrees that make a real note', () => {
    for (const id of ids) {
      const t = THEMES[id]
      expect(t.bass, id).toHaveLength(16)
      expect(t.lead, id).toHaveLength(16)
      expect(t.bass.some((n) => n !== null), id).toBe(true)
      expect(t.lead.some((n) => n !== null), id).toBe(true)
      for (const n of [...t.bass, ...t.lead]) {
        if (n === null) continue
        const hz = midiToHz(degreeToMidi(t, n, -2))
        expect(hz).toBeGreaterThan(20) // audible, not a NaN or a sub-bass rumble
        expect(hz).toBeLessThan(4000)
      }
    }
  })

  it('sits the boss theme faster than every world theme', () => {
    for (const id of ids.filter((i) => i !== 'boss')) expect(THEMES.boss.bpm).toBeGreaterThan(THEMES[id].bpm)
  })
})

describe('note math', () => {
  it('converts MIDI to Hz', () => {
    expect(midiToHz(69)).toBeCloseTo(440)
    expect(midiToHz(81)).toBeCloseTo(880)
  })

  it('wraps scale degrees into higher octaves', () => {
    const t = THEMES.N5 // pentatonic: 5 notes per octave
    expect(degreeToMidi(t, 0)).toBe(t.root)
    expect(degreeToMidi(t, 5)).toBe(t.root + 12)
    expect(degreeToMidi(t, 0, -1)).toBe(t.root - 12)
  })

  it('climbs with the combo and stops climbing at the cap', () => {
    expect(comboNote(1)).toBeGreaterThan(comboNote(0))
    expect(comboNote(9)).toBeGreaterThan(comboNote(4))
    expect(comboNote(50)).toBe(comboNote(14))
    expect(comboNote(-3)).toBe(comboNote(0))
  })
})

describe('settings', () => {
  it('start with everything on, notify listeners, and remember changes', () => {
    expect(getSound()).toEqual({ sfx: true, music: true })
    let calls = 0
    const off = subscribeSound(() => calls++)
    setSound({ music: false })
    expect(getSound()).toEqual({ sfx: true, music: false })
    expect(calls).toBe(1)
    off()
    setSound({ music: true })
    expect(calls).toBe(1)
  })
})

describe('without audio', () => {
  it('does nothing and never throws before the browser allows sound', () => {
    expect(audio()).toBeNull()
    for (const fn of Object.values(sfx)) expect(() => (fn as (n?: number) => void)(3)).not.toThrow()
  })
})
