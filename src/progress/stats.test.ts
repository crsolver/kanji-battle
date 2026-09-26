import { describe, expect, it } from 'vitest'
import { ALL_CARDS } from '../data/cards'
import { DAY_MS, freshCard } from '../srs/scheduler'
import { CHAPTERS } from './chapters'
import {
  accuracySeries, activitySeries, formatDuration, hardestKanji, overview, statusByLevel, topConfusions,
} from './stats'
import { emptyProgress, type CardState, type DayRecord, type Progress } from './types'

const NOW = new Date(2026, 5, 10, 12).getTime()
const TODAY = '2026-06-10'
const [A, B, C, D] = CHAPTERS[0].cards.map((c) => c.kanji)
const card = (kanji: string, over: Partial<CardState> = {}): CardState => ({ ...freshCard(kanji, NOW), ...over })
const day = (date: string, answers: number, correct: number, xp = 0): DayRecord => ({ date, answers, correct, xp, ms: 0, newKanji: 0 })

describe('overview', () => {
  it('starts empty on a fresh profile', () => {
    const o = overview(emptyProgress(), NOW)
    expect(o).toMatchObject({ level: 1, xp: 0, streak: 0, answers: 0, accuracy: null, seen: 0, mastered: 0, floors: 0 })
    expect(o.total).toBe(ALL_CARDS.length)
  })

  it('totals answers and accuracy from the per-kanji counters', () => {
    const p = emptyProgress()
    p.cards = {
      [A]: card(A, { seen: 10, correct: 8, interval: 30 }),
      [B]: card(B, { seen: 6, correct: 6, interval: 2 }),
    }
    p.player = { ...p.player, xp: 350, floors: 4, ms: 5_400_000, bossWins: 2, streak: { current: 3, best: 9, lastDay: TODAY } }
    const o = overview(p, NOW)
    expect(o).toMatchObject({ answers: 16, correct: 14, seen: 2, mastered: 1, level: 3, floors: 4, bossWins: 2, bestStreak: 9, streak: 3 })
    expect(o.accuracy).toBeCloseTo(14 / 16)
  })

  it('shows a streak that lapsed as 0', () => {
    const p = emptyProgress()
    p.player = { ...p.player, streak: { current: 6, best: 6, lastDay: '2026-06-01' } }
    expect(overview(p, NOW).streak).toBe(0)
    expect(overview(p, NOW).bestStreak).toBe(6)
  })
})

describe('statusByLevel', () => {
  it('counts every kanji into exactly one status per level', () => {
    const p = emptyProgress()
    p.cards = {
      [A]: card(A, { interval: 1 }),
      [B]: card(B, { interval: 10 }),
      [C]: card(C, { interval: 40 }),
    }
    const rows = statusByLevel(p)
    expect(rows.map((r) => r.level)).toEqual(['N5', 'N4', 'N3', 'N2', 'N1'])
    for (const r of rows) expect(Object.values(r.counts).reduce((s, n) => s + n, 0)).toBe(r.total)
    expect(rows[0].counts).toMatchObject({ learning: 1, reviewing: 1, mastered: 1 })
    expect(rows[0].counts.new).toBe(rows[0].total - 3)
    expect(rows[1].counts.new).toBe(rows[1].total)
  })
})

describe('daily series', () => {
  const days = { '2026-06-10': day('2026-06-10', 20, 15, 200), '2026-06-08': day('2026-06-08', 10, 10, 90) }

  it('gives n days ending today, oldest first, zeros for days off', () => {
    const s = activitySeries(days, 5, TODAY)
    expect(s.map((d) => d.date)).toEqual(['2026-06-06', '2026-06-07', '2026-06-08', '2026-06-09', '2026-06-10'])
    expect(s.map((d) => d.answers)).toEqual([0, 0, 10, 0, 20])
    expect(s[4]).toMatchObject({ correct: 15, xp: 200 })
  })

  it('crosses month and year boundaries', () => {
    const s = activitySeries({}, 3, '2026-01-01')
    expect(s.map((d) => d.date)).toEqual(['2025-12-30', '2025-12-31', '2026-01-01'])
  })

  it('leaves accuracy null on days nothing was answered', () => {
    const s = accuracySeries(days, 5, TODAY)
    expect(s.map((d) => d.accuracy)).toEqual([null, null, 1, null, 0.75])
  })
})

describe('hardestKanji', () => {
  it('orders by lapses then accuracy and ignores kanji with too few answers or no misses', () => {
    const p = emptyProgress()
    p.cards = {
      [A]: card(A, { seen: 10, correct: 5, lapses: 3 }),
      [B]: card(B, { seen: 8, correct: 3, lapses: 3 }), // same lapses, worse accuracy
      [C]: card(C, { seen: 2, correct: 0, lapses: 5 }), // too few answers
      [D]: card(D, { seen: 12, correct: 12, lapses: 0 }), // never missed
    }
    const rows = hardestKanji(p)
    expect(rows.map((r) => r.card.kanji)).toEqual([B, A])
    expect(rows[0]).toMatchObject({ lapses: 3, seen: 8, accuracy: 0.375 })
  })

  it('caps the list', () => {
    const p = emptyProgress()
    for (const c of ALL_CARDS.slice(0, 15)) p.cards[c.kanji] = card(c.kanji, { seen: 5, correct: 3, lapses: 1 })
    expect(hardestKanji(p, 10)).toHaveLength(10)
  })
})

describe('topConfusions', () => {
  it('ranks pairs both ways together and marks their boss', () => {
    const p: Progress = emptyProgress()
    p.confusions = {
      [`${A}>${B}`]: { id: `${A}>${B}`, shown: A, mistakenFor: B, count: 2, last: 0 },
      [`${B}>${A}`]: { id: `${B}>${A}`, shown: B, mistakenFor: A, count: 3, last: 0 },
      [`${C}>${D}`]: { id: `${C}>${D}`, shown: C, mistakenFor: D, count: 1, last: 0 },
    }
    const [id1] = [[A, B].sort().join('|')]
    p.bosses = { [[C, D].sort().join('|')]: { id: '', a: C, b: D, wins: 1, retired: true, countAtRetire: 1, defeated: 1, lastFought: 0 } }
    const rows = topConfusions(p)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ count: 5, boss: 'waiting' })
    expect([rows[0].a, rows[0].b].sort().join('|')).toBe(id1)
    expect(rows[1]).toMatchObject({ count: 1, boss: 'retired' })
  })

  it('is empty with no mix-ups', () => {
    expect(topConfusions(emptyProgress())).toEqual([])
  })
})

describe('formatDuration', () => {
  it('reads naturally', () => {
    expect(formatDuration(0)).toBe('0 min')
    expect(formatDuration(20_000)).toBe('<1 min')
    expect(formatDuration(25 * 60_000)).toBe('25 min')
    expect(formatDuration(95 * 60_000)).toBe('1 h 35 min')
    expect(DAY_MS).toBeGreaterThan(0)
  })
})
