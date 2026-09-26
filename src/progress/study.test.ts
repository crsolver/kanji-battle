import { describe, expect, it } from 'vitest'
import { buildQueue } from '../game/floor'
import { freshCard } from '../srs/scheduler'
import { applyResults } from './applyResults'
import { CHAPTERS } from './chapters'
import { buildChapterSession } from './sessions'
import { emptyProgress, type Attempt, type SessionResult } from './types'
import { XP, sessionXp } from './xp'

const NOW = new Date(2026, 5, 10, 12).getTime()
const cards = CHAPTERS[0].cards
const kanji = cards.map((c) => c.kanji)

describe('chapter sessions', () => {
  it('list the kanji that have never been seen', () => {
    expect(buildChapterSession(emptyProgress(), CHAPTERS[0]).newKanji).toEqual(kanji)
    const p = emptyProgress()
    p.cards[kanji[0]] = freshCard(kanji[0], NOW)
    p.cards[kanji[1]] = freshCard(kanji[1], NOW)
    expect(buildChapterSession(p, CHAPTERS[0]).newKanji).toEqual(kanji.slice(2))
  })
})

describe('floor queue with study cards', () => {
  /** Split a queue into runs of the same kind (study / test). */
  const runs = (q: ReturnType<typeof buildQueue>) => {
    const out: { study: boolean; kanji: string[] }[] = []
    for (const i of q) {
      const study = !!i.study
      const last = out[out.length - 1]
      if (last && last.study === study) last.kanji.push(i.card.kanji)
      else out.push({ study, kanji: [i.card.kanji] })
    }
    return out
  }

  it('teaches new kanji five at a time: study five, test those five, then the next five', () => {
    const q = buildQueue(cards, 2, kanji)
    const r = runs(q)
    // 4 batches of (5 study, 5 test), then one final round of all 20
    expect(r.map((x) => [x.study, x.kanji.length])).toEqual([
      [true, 5], [false, 5], [true, 5], [false, 5], [true, 5], [false, 5], [true, 5], [false, 5 + 20],
    ])
    for (let b = 0; b < 4; b++) {
      const study = r[b * 2].kanji
      const test = r[b * 2 + 1].kanji.slice(0, 5)
      expect([...test].sort()).toEqual([...study].sort()) // the batch is tested right after it is studied
    }
    expect(q).toHaveLength(20 + 20 + 20)
    expect(new Set(q.filter((i) => i.study).map((i) => i.card.kanji)).size).toBe(20) // each studied once
  })

  it('never introduces more than five new kanji before a test', () => {
    const q = buildQueue(cards, 2, kanji)
    let run = 0
    for (const i of q) {
      run = i.study ? run + 1 : 0
      expect(run).toBeLessThanOrEqual(5)
    }
  })

  it('only studies the new ones; kanji already seen get a warm-up test first', () => {
    const newOnes = kanji.slice(0, 7)
    const q = buildQueue(cards, 2, newOnes)
    expect(q.filter((i) => i.study).map((i) => i.card.kanji).sort()).toEqual([...newOnes].sort())
    expect(q.slice(0, 13).every((i) => !i.study)).toBe(true) // the 13 familiar kanji first
    expect(runs(q).filter((x) => x.study).map((x) => x.kanji.length)).toEqual([5, 2])
    expect(q).toHaveLength(7 + 20 + 20)
  })

  it('has no study cards when nothing is new, and still tests every kanji twice', () => {
    const q = buildQueue(cards, 2, [])
    expect(q.some((i) => i.study)).toBe(false)
    for (const c of cards) expect(q.filter((i) => i.card.kanji === c.kanji)).toHaveLength(2)
  })

  it('keeps the two tests of a kanji apart so they count as separate encounters', () => {
    const q = buildQueue(cards, 2, kanji)
    for (const c of cards) {
      const at = q.map((x, i) => (!x.study && x.card.kanji === c.kanji ? i : -1)).filter((i) => i >= 0)
      expect(at).toHaveLength(2)
      expect(at[1] - at[0]).toBeGreaterThanOrEqual(4)
    }
  })

  it('a review floor (one round, nothing new) is just the cards once', () => {
    const q = buildQueue(cards.slice(0, 6), 1, [])
    expect(q).toHaveLength(6)
    expect(q.some((i) => i.study)).toBe(false)
  })
})

describe('study attempts are never graded', () => {
  const att = (kanjiChar: string, over: Partial<Attempt> = {}): Attempt => ({
    kanji: kanjiChar, correct: true, firstTry: true, ms: 1500, pos: 0, ...over,
  })
  /** A floor: study card for every kanji, then test round 1 and 2 (all right), as the game runs it. */
  function floor(): SessionResult {
    const attempts: Attempt[] = []
    let pos = 0
    kanji.forEach((k) => attempts.push(att(k, { study: true, firstTry: false, pos: pos++ })))
    kanji.forEach((k) => attempts.push(att(k, { pos: pos++ })))
    kanji.forEach((k) => attempts.push(att(k, { firstTry: false, pos: pos++ })))
    return { sessionId: 's', mode: 'chapter', chapterId: 'N5-1', attempts, hpLeft: 8, maxHp: 8, cleared: true, durationMs: 1000 }
  }

  it('do not touch the schedule of a kanji that was only studied', () => {
    const r = applyResults(emptyProgress(), { ...floor(), attempts: floor().attempts.filter((a) => a.study), cleared: false }, NOW)
    expect(r.progress.cards).toEqual({})
    expect(r.outcome.newKanji).toBe(0)
  })

  it('leave accuracy and "remembered" to the real tests: a studied-then-tested floor passes', () => {
    const r = applyResults(emptyProgress(), floor(), NOW)
    expect(r.outcome.chapter).toMatchObject({ accuracy: 1, remembered: 1, passed: true })
    const state = r.progress.cards[kanji[0]]
    expect(state.seen).toBe(2) // two tests, not three answers
    expect(state.good).toBe(2)
    expect(r.outcome.newKanji).toBe(20)
  })

  it('cannot inflate the day totals or the correct count', () => {
    const r = applyResults(emptyProgress(), floor(), NOW)
    expect(r.progress.days['2026-06-10']).toMatchObject({ answers: 40, correct: 40 })
    expect(Object.values(r.progress.cards).reduce((s, c) => s + c.seen, 0)).toBe(40)
  })

  it('a kanji that is studied but then missed on its first test is a normal first-try miss', () => {
    const f = floor()
    const firstTest = f.attempts.find((a) => !a.study && a.kanji === kanji[0])!
    firstTest.correct = false
    const r = applyResults(emptyProgress(), f, NOW)
    expect(r.outcome.chapter!.accuracy).toBeCloseTo(19 / 20)
  })

  it('give a small XP line for studying, and count no combo or answer XP for it', () => {
    const studyOnly = sessionXp({
      mode: 'chapter', streakDays: 1, firstOfDay: false,
      result: { attempts: kanji.map((k) => att(k, { study: true, firstTry: false })), cleared: false },
    })
    expect(studyOnly.lines).toEqual([{ label: 'New kanji studied', xp: kanji.length * XP.study }])
  })

  it('a session of only study cards still counts for the streak but adds no graded answers', () => {
    const r = applyResults(
      emptyProgress(),
      { ...floor(), attempts: floor().attempts.filter((a) => a.study), cleared: false },
      NOW,
    )
    expect(r.outcome.streak.extended).toBe(true)
    expect(r.progress.days['2026-06-10']).toMatchObject({ answers: 0, correct: 0 })
  })
})
