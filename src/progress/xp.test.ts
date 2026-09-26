import { describe, expect, it } from 'vitest'
import { applyResults } from './applyResults'
import { CHAPTERS } from './chapters'
import { advanceStreak, dayKey, dayKeyOffset, liveStreak, prevDayKey } from './streak'
import { emptyProgress, type Attempt, type SessionResult } from './types'
import { XP, answerXp, attemptsXp, levelInfo, sessionXp, xpAtLevel } from './xp'

const att = (correct: boolean, over: Partial<Attempt> = {}): Attempt => ({
  kanji: 'x', correct, firstTry: true, ms: 1500, pos: 0, ...over,
})
const NOON = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime()

describe('answer XP', () => {
  it('pays 10 plus a speed bonus for a fast first answer, nothing for a miss', () => {
    expect(answerXp(att(true), 0)).toBe(15)
    expect(answerXp(att(true, { ms: 5000 }), 0)).toBe(10)
    expect(answerXp(att(false), 0)).toBe(0)
  })

  it('grows with the combo up to a cap', () => {
    expect(answerXp(att(true), 3)).toBe(10 + 6 + 5)
    expect(answerXp(att(true), 10)).toBe(10 + XP.comboCap + 5)
    expect(answerXp(att(true), 200)).toBe(answerXp(att(true), 10))
  })

  it('pays half for a correct retry after a miss', () => {
    expect(answerXp(att(true, { firstTry: false }), 0)).toBe(Math.round(15 * XP.retryFactor))
  })

  it('tracks the combo across a session and resets it on a miss', () => {
    const run = [att(true), att(true), att(false), att(true)]
    // combo before each answer: 0, 1, (miss), 0
    expect(attemptsXp(run)).toBe(answerXp(att(true), 0) + answerXp(att(true), 1) + 0 + answerXp(att(true), 0))
  })
})

describe('session XP', () => {
  const base = { streakDays: 1, firstOfDay: false }
  const ok = { attempts: [att(true), att(true)], cleared: true }

  it('adds a floor bonus for a cleared floor only', () => {
    const cleared = sessionXp({ ...base, mode: 'chapter', result: ok })
    expect(cleared.lines.map((l) => l.label)).toEqual(['Answers', 'Floor cleared'])
    const quit = sessionXp({ ...base, mode: 'chapter', result: { ...ok, cleared: false } })
    expect(quit.lines.map((l) => l.label)).toEqual(['Answers'])
  })

  it('pays the chapter bonus by stars, once', () => {
    for (const [stars, bonus] of [[1, 100], [2, 150], [3, 200]] as const) {
      const r = sessionXp({ ...base, mode: 'chapter', result: ok, chapter: { passed: true, wasPassed: false, stars } })
      expect(r.lines.find((l) => l.label === 'Chapter passed')?.xp).toBe(bonus)
    }
    const again = sessionXp({ ...base, mode: 'chapter', result: ok, chapter: { passed: true, wasPassed: true, stars: 3 } })
    expect(again.lines.some((l) => l.label === 'Chapter passed')).toBe(false)
  })

  it('pays for a cleared daily review and a defeated boss, and no floor bonus for duels', () => {
    const review = sessionXp({ ...base, mode: 'review', result: ok })
    expect(review.lines.find((l) => l.label === 'Daily review')?.xp).toBe(XP.reviewCleared)
    const boss = sessionXp({ ...base, mode: 'boss', result: ok, boss: { won: true } })
    expect(boss.lines.find((l) => l.label === 'Boss defeated')?.xp).toBe(XP.bossWin)
    expect(boss.lines.some((l) => l.label === 'Floor cleared')).toBe(false)
    const lost = sessionXp({ ...base, mode: 'boss', result: ok, boss: { won: false } })
    expect(lost.lines.some((l) => l.label === 'Boss defeated')).toBe(false)
  })

  it('halves answer and floor XP for practice drills', () => {
    const full = sessionXp({ ...base, mode: 'chapter', result: ok })
    const drill = sessionXp({ ...base, mode: 'practice', result: ok })
    expect(drill.total).toBeCloseTo(full.total / 2, 0)
    expect(drill.lines.some((l) => l.label === 'Daily review')).toBe(false)
  })

  it('gives the streak bonus once a day, capped', () => {
    const three = sessionXp({ mode: 'review', result: ok, streakDays: 3, firstOfDay: true })
    expect(three.lines.at(-1)).toEqual({ label: '3 day streak', xp: 15 })
    const forty = sessionXp({ mode: 'review', result: ok, streakDays: 40, firstOfDay: true })
    expect(forty.lines.at(-1)!.xp).toBe(XP.streakCap)
    const later = sessionXp({ mode: 'review', result: ok, streakDays: 3, firstOfDay: false })
    expect(later.lines.some((l) => l.label.includes('streak'))).toBe(false)
  })

  it('total is the sum of the lines', () => {
    const r = sessionXp({
      mode: 'chapter', result: ok, streakDays: 2, firstOfDay: true,
      chapter: { passed: true, wasPassed: false, stars: 2 },
    })
    expect(r.total).toBe(r.lines.reduce((s, l) => s + l.xp, 0))
  })
})

describe('levels', () => {
  it('start at 0, 100, 300, 600 XP', () => {
    expect([1, 2, 3, 4, 5].map(xpAtLevel)).toEqual([0, 100, 300, 600, 1000])
  })

  it('find the level right at the boundaries', () => {
    expect(levelInfo(0).level).toBe(1)
    expect(levelInfo(99).level).toBe(1)
    expect(levelInfo(100).level).toBe(2)
    expect(levelInfo(299).level).toBe(2)
    expect(levelInfo(300).level).toBe(3)
    expect(levelInfo(999).level).toBe(4)
    expect(levelInfo(1000).level).toBe(5)
    expect(levelInfo(-50).level).toBe(1)
  })

  it('reports progress inside the level', () => {
    expect(levelInfo(0)).toMatchObject({ level: 1, into: 0, need: 100, pct: 0 })
    expect(levelInfo(250)).toMatchObject({ level: 2, into: 150, need: 200, pct: 0.75 })
    expect(levelInfo(300)).toMatchObject({ level: 3, into: 0, need: 300 })
  })
})

describe('streak', () => {
  const s0 = { current: 0, best: 0, lastDay: '' }

  it('formats local day keys', () => {
    expect(dayKey(NOON(2026, 3, 8))).toBe('2026-03-08')
    expect(prevDayKey('2026-03-01')).toBe('2026-02-28')
    expect(prevDayKey('2026-01-01')).toBe('2025-12-31')
    expect(dayKeyOffset('2026-02-27', 3)).toBe('2026-03-02')
  })

  it('starts at 1, ignores a second session the same day, and extends on the next day', () => {
    const d1 = advanceStreak(s0, NOON(2026, 6, 10))
    expect(d1).toMatchObject({ firstOfDay: true, streak: { current: 1, best: 1 } })
    const again = advanceStreak(d1.streak, NOON(2026, 6, 10) + 3_600_000)
    expect(again).toMatchObject({ firstOfDay: false, streak: d1.streak })
    const d2 = advanceStreak(d1.streak, NOON(2026, 6, 11))
    expect(d2).toMatchObject({ firstOfDay: true, streak: { current: 2, best: 2 } })
  })

  it('resets after a missed day but keeps the best', () => {
    let s = advanceStreak(advanceStreak(s0, NOON(2026, 6, 10)).streak, NOON(2026, 6, 11)).streak
    s = advanceStreak(s, NOON(2026, 6, 14)).streak
    expect(s).toMatchObject({ current: 1, best: 2 })
  })

  it('counts every calendar day of a year exactly once, across daylight-saving changes', () => {
    let s = s0
    for (let i = 0; i < 365; i++) s = advanceStreak(s, new Date(2026, 0, 1 + i, 12).getTime()).streak
    expect(s.current).toBe(365)
  })

  it('displays a lapsed streak as 0', () => {
    const s = { current: 5, best: 5, lastDay: '2026-06-10' }
    expect(liveStreak(s, NOON(2026, 6, 10))).toBe(5)
    expect(liveStreak(s, NOON(2026, 6, 11))).toBe(5) // can still be extended today
    expect(liveStreak(s, NOON(2026, 6, 12))).toBe(0)
  })
})

describe('applyResults XP', () => {
  const [A, B] = CHAPTERS[0].cards.map((c) => c.kanji)
  const result = (over: Partial<SessionResult> = {}): SessionResult => ({
    sessionId: 's', mode: 'review', attempts: [att(true, { kanji: A }), att(true, { kanji: B, pos: 1 })],
    hpLeft: 4, maxHp: 5, cleared: true, durationMs: 60_000, ...over,
  })
  const T1 = NOON(2026, 6, 10)

  it('returns a breakdown that matches the XP saved', () => {
    const r = applyResults(emptyProgress(), result(), T1)
    const sum = r.outcome.xp.lines.reduce((s, l) => s + l.xp, 0)
    expect(r.outcome.xp.total).toBe(sum)
    expect(r.progress.player.xp).toBe(sum)
    expect(r.changes.player?.xp).toBe(sum)
    expect(r.outcome.xp).toMatchObject({ xpBefore: 0, xpAfter: sum, levelBefore: 1 })
  })

  it('reports a level up when XP crosses a threshold', () => {
    const p = emptyProgress()
    p.player = { ...p.player, xp: 95 }
    const r = applyResults(p, result(), T1)
    expect(r.outcome.xp.levelBefore).toBe(1)
    expect(r.outcome.xp.levelAfter).toBeGreaterThan(1)
  })

  it('keeps a per-day tally that adds up over several sessions', () => {
    const one = applyResults(emptyProgress(), result(), T1)
    const two = applyResults(one.progress, result({ sessionId: 's2' }), T1 + 3_600_000)
    const day = two.progress.days['2026-06-10']
    expect(day).toMatchObject({ answers: 4, correct: 4, ms: 120_000 })
    expect(day.newKanji).toBe(2)
    expect(day.xp).toBe(two.progress.player.xp)
    expect(two.changes.days).toEqual([day])
  })

  it('counts floors, duel wins and time, and applies the streak bonus only once a day', () => {
    const one = applyResults(emptyProgress(), result(), T1)
    expect(one.progress.player).toMatchObject({ floors: 1, ms: 60_000 })
    expect(one.outcome.streak).toEqual({ before: 0, after: 1, extended: true })
    expect(one.outcome.xp.lines.some((l) => l.label.includes('streak'))).toBe(true)
    const same = applyResults(one.progress, result(), T1 + 1000)
    expect(same.outcome.xp.lines.some((l) => l.label.includes('streak'))).toBe(false)
    const next = applyResults(one.progress, result(), NOON(2026, 6, 11))
    expect(next.outcome.streak).toEqual({ before: 1, after: 2, extended: true })
    const duel = applyResults(emptyProgress(), result({ mode: 'boss', pair: [A, B] }), T1)
    expect(duel.progress.player.floors).toBe(0)
  })

  it('an empty session (quit at once) changes nothing', () => {
    const r = applyResults(emptyProgress(), result({ attempts: [], cleared: false }), T1)
    expect(r.outcome.xp.total).toBe(0)
    expect(r.changes.player).toBeUndefined()
    expect(r.changes.days).toEqual([])
    expect(r.progress.player).toEqual(emptyProgress().player)
    expect(r.outcome.streak.extended).toBe(false)
  })

  it('falls back to summed answer times when the session length is unknown', () => {
    const r = applyResults(emptyProgress(), result({ durationMs: undefined }), T1)
    expect(r.progress.player.ms).toBe(3000)
  })
})
