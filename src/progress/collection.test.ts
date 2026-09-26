import { describe, expect, it } from 'vitest'
import { CHAPTERS } from './chapters'
import { buildRows, collectionStats, defaultFilters, filterRows, formatDue } from './collection'
import { partnerLookup } from './confusions'
import { buildChapterSession, buildPracticeSession, buildReviewSession } from './sessions'
import { emptyProgress, type CardState, type Progress } from './types'
import { freshCard, DAY_MS } from '../srs/scheduler'

const NOW = 1_700_000_000_000
const card = (kanji: string, patch: Partial<CardState> = {}): CardState => ({ ...freshCard(kanji, NOW), ...patch })

/** Progress with a handful of seen kanji from chapter N5-1. */
function sample(): Progress {
  const [a, b, c, d] = CHAPTERS[0].cards
  return {
    cards: {
      [a.kanji]: card(a.kanji, { interval: 1, due: NOW - 1000, seen: 4, correct: 3 }),
      [b.kanji]: card(b.kanji, { interval: 30, due: NOW + 30 * DAY_MS, seen: 6, correct: 6 }),
      [c.kanji]: card(c.kanji, { interval: 2, due: NOW + 2 * DAY_MS, lapses: 5, seen: 9, correct: 3 }),
      [d.kanji]: card(d.kanji, { interval: 8, due: NOW + 8 * DAY_MS, seen: 2, correct: 2 }),
    },
    chapters: {},
    bosses: {},
    player: emptyProgress().player,
    days: {},
    confusions: {
      [`${a.kanji}>${c.kanji}`]: { id: `${a.kanji}>${c.kanji}`, shown: a.kanji, mistakenFor: c.kanji, count: 3, last: NOW },
    },
  }
}

describe('collection', () => {
  const p = sample()
  const rows = buildRows(p)
  const [a, b, c] = CHAPTERS[0].cards
  const kanjis = (f: Partial<ReturnType<typeof defaultFilters>>) =>
    filterRows(rows, { ...defaultFilters(), ...f }, NOW).map((r) => r.card.kanji)

  it('lists only seen kanji unless asked for unseen ones', () => {
    expect(kanjis({})).toHaveLength(4)
    expect(kanjis({ showUnseen: true }).length).toBe(rows.length)
  })

  it('reports stats', () => {
    expect(collectionStats(rows, NOW)).toEqual({ seen: 4, total: rows.length, dueToday: 1, leeches: 1, mastered: 1 })
  })

  it('filters by due, leech, status and mixed-up', () => {
    expect(kanjis({ dueOnly: true })).toEqual([a.kanji])
    expect(kanjis({ leechOnly: true })).toEqual([c.kanji])
    expect(kanjis({ status: 'mastered' })).toEqual([b.kanji])
    expect(kanjis({ confusedOnly: true }).sort()).toEqual([a.kanji, c.kanji].sort())
  })

  it('searches by kanji or meaning and filters by chapter and level', () => {
    expect(kanjis({ query: a.kanji })).toEqual([a.kanji])
    expect(kanjis({ query: b.meaning.toUpperCase() })).toContain(b.kanji)
    expect(kanjis({ chapter: 'N5-1' })).toHaveLength(4)
    expect(kanjis({ chapter: 'N5-2' })).toHaveLength(0)
    expect(kanjis({ level: 'N4' })).toHaveLength(0)
  })

  it('sorts by next due and by lapses', () => {
    expect(kanjis({ sort: 'due' })[0]).toBe(a.kanji)
    expect(kanjis({ sort: 'lapses' })[0]).toBe(c.kanji)
  })

  it('shows each kanji its mix-up partner both ways', () => {
    const row = (k: string) => rows.find((r) => r.card.kanji === k)!
    expect(row(a.kanji).confusedWith).toEqual([c.kanji])
    expect(row(c.kanji).confusedWith).toEqual([a.kanji])
  })

  it('formats due times', () => {
    expect(formatDue(null, NOW)).toBe('-')
    expect(formatDue(NOW - 5, NOW)).toBe('due')
    expect(formatDue(NOW + 30 * 60_000, NOW)).toBe('in 30 min')
    expect(formatDue(NOW + 5 * 3_600_000, NOW)).toBe('in 5 h')
    expect(formatDue(NOW + 3 * DAY_MS, NOW)).toBe('in 3 d')
  })
})

describe('confusion partners', () => {
  it('returns the worst partners first', () => {
    const [a, b, c] = CHAPTERS[0].cards
    const p = emptyProgress()
    p.confusions = {
      x: { id: 'x', shown: a.kanji, mistakenFor: b.kanji, count: 1, last: 0 },
      y: { id: 'y', shown: c.kanji, mistakenFor: a.kanji, count: 5, last: 0 },
    }
    expect(partnerLookup(p)(a.kanji).map((k) => k.kanji)).toEqual([c.kanji, b.kanji])
    expect(partnerLookup(p)('x')).toEqual([])
  })
})

describe('sessions', () => {
  it('a chapter floor shows each kanji twice; wrong tiles come from seen kanji plus the floor', () => {
    const s = buildChapterSession(sample(), CHAPTERS[0])
    expect(s.rounds).toBe(2)
    expect(s.cards).toHaveLength(20)
    expect(s.distractors.length).toBeGreaterThanOrEqual(20)
  })

  it('a review session holds due kanji only, leeches first, and is null when nothing is due', () => {
    const p = sample()
    const [, , c] = CHAPTERS[0].cards
    p.cards[c.kanji] = { ...p.cards[c.kanji], due: NOW - 500 } // now a due leech
    const s = buildReviewSession(p, NOW)!
    expect(s.cards[0].kanji).toBe(c.kanji)
    expect(s.cards.length).toBe(2)
    expect(buildReviewSession(emptyProgress(), NOW)).toBeNull()
  })

  it('a practice session is capped and null for no cards', () => {
    expect(buildPracticeSession(emptyProgress(), [])).toBeNull()
    expect(buildPracticeSession(emptyProgress(), CHAPTERS[0].cards)!.cards).toHaveLength(20)
  })
})
