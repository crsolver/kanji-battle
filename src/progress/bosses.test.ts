import { describe, expect, it } from 'vitest'
import { applyResults } from './applyResults'
import { BOSS_MIN_MIXUPS, BOSS_WINS_TO_RETIRE, activeBosses, pairId } from './bosses'
import { emptyProgress, type Attempt, type Progress, type SessionResult } from './types'
import { CHAPTERS } from './chapters'

const NOW = 1_700_000_000_000
const [A, B, C] = CHAPTERS[0].cards.map((c) => c.kanji)
const conf = (shown: string, mistakenFor: string, count: number) => ({
  id: `${shown}>${mistakenFor}`, shown, mistakenFor, count, last: NOW,
})
const withMixups = (...c: ReturnType<typeof conf>[]): Progress => ({
  ...emptyProgress(),
  confusions: Object.fromEntries(c.map((x) => [x.id, x])),
})
const attempt = (kanji: string, correct: boolean, pos: number, mistakenFor?: string): Attempt => ({
  kanji, correct, firstTry: true, ms: 1500, pos, mistakenFor,
})
const duel = (cleared: boolean, attempts: Attempt[] = []): SessionResult => ({
  sessionId: 'd', mode: 'boss', pair: [A, B], attempts, hpLeft: cleared ? 4 : 0, maxHp: 5, cleared,
})

describe('boss triggers', () => {
  it('a single mix-up is enough, and both directions count as one pair', () => {
    expect(BOSS_MIN_MIXUPS).toBe(1)
    expect(activeBosses(emptyProgress())).toEqual([])
    expect(activeBosses(withMixups(conf(A, B, 1)))).toHaveLength(1)
    const both = activeBosses(withMixups(conf(A, B, 1), conf(B, A, 1)))
    expect(both).toHaveLength(1)
    expect(both[0]).toMatchObject({ id: pairId(A, B), count: 2 })
  })

  it('lists the worst pair first', () => {
    const list = activeBosses(withMixups(conf(A, B, 2), conf(A, C, 5)))
    expect(list.map((b) => b.count)).toEqual([5, 2])
  })

  it('a session that makes a new mix-up announces the new boss', () => {
    const p = emptyProgress()
    const r: SessionResult = {
      sessionId: 's', mode: 'review', hpLeft: 4, maxHp: 5, cleared: true,
      attempts: [attempt(A, false, 0, B)],
    }
    expect(applyResults(p, r, NOW).outcome.newBosses).toEqual([pairId(A, B)])
    // ...and not again once it is already a boss
    const again = applyResults(applyResults(p, r, NOW).progress, r, NOW)
    expect(again.outcome.newBosses).toEqual([])
  })
})

describe('boss duels', () => {
  const start = () => withMixups(conf(A, B, 3))

  it('one win retires the boss', () => {
    expect(BOSS_WINS_TO_RETIRE).toBe(1)
    const won = applyResults(start(), duel(true), NOW)
    expect(won.outcome.boss).toMatchObject({ won: true, wins: 1, retired: true })
    expect(activeBosses(won.progress)).toEqual([])
    expect(won.progress.bosses[pairId(A, B)].countAtRetire).toBe(3)
  })

  it('a lost duel is not a win and does not retire anything', () => {
    const r = applyResults(start(), duel(false, [attempt(A, false, 0, B)]), NOW)
    expect(r.outcome.boss).toMatchObject({ won: false, wins: 0, retired: false })
    expect(r.progress.confusions[`${A}>${B}`].count).toBe(4) // the mistake is still recorded
    expect(activeBosses(r.progress)).toHaveLength(1)
  })

  it('does not touch the flashcard schedule', () => {
    const r = applyResults(start(), duel(true, [attempt(A, true, 0), attempt(B, true, 1)]), NOW)
    expect(r.progress.cards).toEqual({})
    expect(r.outcome.newKanji).toBe(0)
  })

  it('a retired boss comes back after two new mix-ups, with a fresh win count', () => {
    let p = applyResults(start(), duel(true), NOW).progress
    expect(activeBosses(p)).toEqual([])
    p = { ...p, confusions: { ...p.confusions, [`${A}>${B}`]: conf(A, B, 4) } } // only one new
    expect(activeBosses(p)).toEqual([])
    p = { ...p, confusions: { ...p.confusions, [`${A}>${B}`]: conf(A, B, 5) } }
    expect(activeBosses(p)).toHaveLength(1)
    const again = applyResults(p, duel(true), NOW).outcome.boss!
    expect(again).toMatchObject({ wins: 1, retired: true }) // a fresh count, not 2
  })
})
