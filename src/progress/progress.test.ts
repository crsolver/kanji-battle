import { describe, expect, it } from 'vitest'
import { ALL_CARDS, LEVELS } from '../data/cards'
import { buildQueue } from '../game/floor'
import { DAY_MS, review } from '../srs/scheduler'
import { applyResults } from './applyResults'
import {
  CHAPTERS, CHAPTERS_BY_LEVEL, CHAPTER_SIZE, chapterStatus, isChapterUnlocked, isWorldUnlocked, unlockRequirement,
} from './chapters'
import { cardStatus, isLeech, isRemembered } from './status'
import { emptyProgress, type Attempt, type CardState, type Progress, type SessionResult } from './types'

const NOW = 1_700_000_000_000
const att = (kanji: string, correct: boolean, pos: number, firstTry = true, mistakenFor?: string): Attempt => ({
  kanji, correct, firstTry, ms: 2000, pos, mistakenFor,
})
const ctx = (sessionId = 's1') => ({ now: NOW, sessionId })

describe('chapters', () => {
  it('put every kanji in exactly one chapter of at most 20', () => {
    const seen = new Map<string, number>()
    for (const ch of CHAPTERS) {
      expect(ch.cards.length).toBeLessThanOrEqual(CHAPTER_SIZE)
      expect(ch.cards.length).toBeGreaterThan(0)
      for (const c of ch.cards) seen.set(c.kanji, (seen.get(c.kanji) ?? 0) + 1)
    }
    expect(seen.size).toBe(ALL_CARDS.length)
    expect([...seen.values()].every((n) => n === 1)).toBe(true)
    expect(CHAPTERS_BY_LEVEL.N5.map((c) => c.id)).toEqual(['N5-1', 'N5-2', 'N5-3', 'N5-4'])
  })

  it('start with only the first N5 chapter open', () => {
    const p = emptyProgress()
    expect(isChapterUnlocked(p, CHAPTERS_BY_LEVEL.N5[0])).toBe(true)
    expect(isChapterUnlocked(p, CHAPTERS_BY_LEVEL.N5[1])).toBe(false)
    expect(isChapterUnlocked(p, CHAPTERS_BY_LEVEL.N4[0])).toBe(false)
    expect(chapterStatus(p, CHAPTERS_BY_LEVEL.N5[0])).toBe('available')
    expect(unlockRequirement(p, CHAPTERS_BY_LEVEL.N5[1])).toBe('Pass N5-1 first')
    expect(unlockRequirement(p, CHAPTERS_BY_LEVEL.N4[0])).toContain('N5')
  })

  it('open the next world only when every chapter of the previous one is passed', () => {
    const p: Progress = emptyProgress()
    const passAll = (level: (typeof LEVELS)[number], except?: number) =>
      CHAPTERS_BY_LEVEL[level].forEach((c, i) => {
        if (i !== except) p.chapters[c.id] = { id: c.id, cleared: true, passed: true, bestAccuracy: 1, stars: 3, clearedAt: 1, plays: 1 }
      })
    passAll('N5', 2)
    expect(isWorldUnlocked(p, 'N4')).toBe(false)
    passAll('N5')
    expect(isWorldUnlocked(p, 'N4')).toBe(true)
    expect(isChapterUnlocked(p, CHAPTERS_BY_LEVEL.N4[0])).toBe(true)
    expect(isWorldUnlocked(p, 'N3')).toBe(false)
  })
})

describe('scheduler', () => {
  it('a new card answered right is due tomorrow', () => {
    const s = review(undefined, att('日', true, 0), ctx())
    expect(s.interval).toBe(1)
    expect(s.due).toBe(NOW + DAY_MS)
    expect(s.reps).toBe(1)
  })

  it('intervals grow on later right answers and reset on a miss', () => {
    let s: CardState | undefined = review(undefined, att('日', true, 0), ctx())
    s = review(s, att('日', true, 0), ctx('s2'))
    expect(s.interval).toBe(3) // round(1 * 2.5) = 3
    s = review(s, att('日', true, 0), ctx('s3'))
    expect(s.interval).toBeGreaterThan(3)
    const missed = review(s, att('日', false, 0), ctx('s4'))
    expect(missed.interval).toBe(0)
    expect(missed.lapses).toBe(1)
    expect(missed.ease).toBeLessThan(s.ease)
  })

  it('a slow right answer grows the interval less', () => {
    const base = review(review(undefined, att('日', true, 0), ctx()), att('日', true, 0), ctx('s2'))
    const fast = review(base, { ...att('日', true, 0), ms: 1000 }, ctx('s3'))
    const slow = review(base, { ...att('日', true, 0), ms: 12000 }, ctx('s3'))
    expect(slow.interval).toBeLessThan(fast.interval)
  })

  it('missing a brand new card is not a lapse; it is due again soon', () => {
    const s = review(undefined, att('日', false, 0), ctx())
    expect(s.lapses).toBe(0)
    expect(s.interval).toBe(0)
    expect(s.due).toBeLessThan(NOW + DAY_MS)
    const retry = review(s, att('日', true, 5, false), ctx())
    expect(retry.interval).toBe(1)
  })

  it('flags a leech after four lapses', () => {
    let s: CardState | undefined = review(undefined, att('日', true, 0), ctx('a'))
    for (let i = 0; i < 4; i++) {
      s = review(s, att('日', true, 0), ctx(`ok${i}`)) // re-earn a review so the miss is a lapse
      s = review(s, att('日', false, 0), ctx(`bad${i}`))
    }
    expect(s.lapses).toBe(4)
    expect(isLeech(s)).toBe(true)
  })

  it('counts separate encounters: needs a gap of 4 cards or a new session', () => {
    let s = review(undefined, att('日', true, 0), ctx())
    s = review(s, att('日', true, 2, false), ctx()) // too close
    expect(s.good).toBe(1)
    expect(isRemembered(s)).toBe(false)
    s = review(s, att('日', true, 10, false), ctx()) // far enough
    expect(s.good).toBe(2)
    expect(isRemembered(s)).toBe(true)
    const t = review(review(undefined, att('月', true, 0), ctx('x')), att('月', true, 0), ctx('y'))
    expect(t.good).toBe(2) // different session
  })
})

describe('status', () => {
  it('follows the interval', () => {
    const base = review(undefined, att('日', true, 0), ctx())
    expect(cardStatus(undefined)).toBe('new')
    expect(cardStatus({ ...base, interval: 1 })).toBe('learning')
    expect(cardStatus({ ...base, interval: 7 })).toBe('reviewing')
    expect(cardStatus({ ...base, interval: 21 })).toBe('mastered')
  })
})

describe('floor queue', () => {
  it('shows each kanji once per round, spaced apart', () => {
    const cards = CHAPTERS[0].cards
    const q = buildQueue(cards, 2)
    expect(q).toHaveLength(cards.length * 2)
    expect(q.some((x) => x.study)).toBe(false)
    for (const c of cards) {
      const at = q.map((x, i) => (x.card.kanji === c.kanji ? i : -1)).filter((i) => i >= 0)
      expect(at).toHaveLength(2)
      expect(at[1] - at[0]).toBeGreaterThanOrEqual(4)
    }
  })
})

/** A chapter session: round 1 with the first `right` kanji answered correctly, round 2 for `secondRound` of them. */
function chapterSession(chapterIndex: number, right: number, secondRound: number, cleared = true): SessionResult {
  const ch = CHAPTERS_BY_LEVEL.N5[chapterIndex]
  const attempts: Attempt[] = []
  let pos = 0
  ch.cards.forEach((c, i) => attempts.push(att(c.kanji, i < right, pos++)))
  ch.cards.slice(0, secondRound).forEach((c) => attempts.push(att(c.kanji, true, pos++, false)))
  return { sessionId: 'sess', mode: 'chapter', chapterId: ch.id, attempts, hpLeft: 3, maxHp: 5, cleared }
}

describe('applyResults: passing a chapter', () => {
  it('passes at exactly 80% accuracy with everything remembered, and unlocks the next chapter', () => {
    // 16/20 right first try; the 4 misses are retried and right at the end
    const r = chapterSession(0, 16, 20)
    r.attempts.push(...CHAPTERS_BY_LEVEL.N5[0].cards.slice(16).map((c, i) => att(c.kanji, true, 100 + i * 5, false)))
    const { outcome, progress } = applyResults(emptyProgress(), r, NOW)
    expect(outcome.chapter!.accuracy).toBeCloseTo(0.8)
    expect(outcome.chapter!.passed).toBe(true)
    expect(outcome.newlyUnlockedChapters).toContain('N5-2')
    expect(progress.chapters['N5-1'].stars).toBe(1)
  })

  it('fails just under 80% accuracy', () => {
    const r = chapterSession(0, 15, 20)
    r.attempts.push(...CHAPTERS_BY_LEVEL.N5[0].cards.slice(15).map((c, i) => att(c.kanji, true, 100 + i * 5, false)))
    const { outcome } = applyResults(emptyProgress(), r, NOW)
    expect(outcome.chapter!.accuracy).toBeCloseTo(0.75)
    expect(outcome.chapter!.passed).toBe(false)
    expect(outcome.chapter!.cleared).toBe(true)
    expect(outcome.newlyUnlockedChapters).toEqual([])
  })

  it('needs 70% remembered: 14 of 20 passes, 13 of 20 does not', () => {
    expect(applyResults(emptyProgress(), chapterSession(0, 20, 14), NOW).outcome.chapter!.passed).toBe(true)
    const r = applyResults(emptyProgress(), chapterSession(0, 20, 13), NOW).outcome.chapter!
    expect(r.remembered).toBeCloseTo(0.65)
    expect(r.passed).toBe(false)
  })

  it('does not pass a floor that was not cleared, and never un-passes a chapter', () => {
    expect(applyResults(emptyProgress(), chapterSession(0, 20, 20, false), NOW).outcome.chapter!.passed).toBe(false)
    const passed = applyResults(emptyProgress(), chapterSession(0, 20, 20), NOW).progress
    expect(passed.chapters['N5-1'].passed).toBe(true)
    const worse = applyResults(passed, chapterSession(0, 5, 0, false), NOW)
    expect(worse.progress.chapters['N5-1'].passed).toBe(true)
    expect(worse.outcome.chapter!.wasPassed).toBe(true)
  })

  it('gives 3 stars for a perfect floor', () => {
    expect(applyResults(emptyProgress(), chapterSession(0, 20, 20), NOW).progress.chapters['N5-1'].stars).toBe(3)
  })

  it('opens N4 when the last N5 chapter is passed', () => {
    let p = emptyProgress()
    let unlocked: string[] = []
    let worlds: string[] = []
    CHAPTERS_BY_LEVEL.N5.forEach((_, i) => {
      const res = applyResults(p, chapterSession(i, 20, 20), NOW)
      p = res.progress
      unlocked = res.outcome.newlyUnlockedChapters
      worlds = res.outcome.newlyUnlockedWorlds
    })
    expect(worlds).toEqual(['N4'])
    expect(unlocked).toContain('N4-1')
  })
})

describe('applyResults: other rules', () => {
  it('records which kanji was mistaken for which', () => {
    const r: SessionResult = {
      sessionId: 's', mode: 'review', hpLeft: 4, maxHp: 5, cleared: true,
      attempts: [att('日', false, 0, true, '月'), att('日', false, 3, false, '月')],
    }
    const { progress, outcome } = applyResults(emptyProgress(), r, NOW)
    expect(progress.confusions['日>月'].count).toBe(2)
    expect(outcome.pairs).toEqual([['日', '月']])
    expect(outcome.newKanji).toBe(1)
  })

  it('practice mode leaves the schedule of kanji that are not due alone', () => {
    const seen = review(undefined, att('日', true, 0), ctx('old'))
    const p: Progress = { ...emptyProgress(), cards: { 日: seen } }
    const practice: SessionResult = { sessionId: 'p', mode: 'practice', hpLeft: 5, maxHp: 5, cleared: true, attempts: [att('日', false, 0)] }
    expect(applyResults(p, practice, NOW).progress.cards['日']).toEqual(seen)
    // ...but once it is due, practising counts like a review.
    const due = applyResults(p, practice, NOW + 2 * DAY_MS).progress.cards['日']
    expect(due.lapses).toBe(1)
  })
})
