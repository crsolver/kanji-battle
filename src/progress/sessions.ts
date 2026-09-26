import { ALL_CARDS, CARD_BY_KANJI, LEVELS, type Card, type Level } from '../data/cards'
import type { Chapter } from './chapters'
import { isDue, isLeech } from './status'
import type { Progress, Session } from './types'

export const REVIEW_LIMIT = 30
export const PRACTICE_LIMIT = 30

const newId = (mode: string) => `${mode}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

/** Wrong tiles come from kanji the user has met, plus everything in this floor. */
function distractorsFor(p: Progress, cards: Card[], level: Level): Card[] {
  const byKanji = new Map<string, Card>()
  for (const c of cards) byKanji.set(c.kanji, c)
  for (const c of ALL_CARDS) if (c.level === level && p.cards[c.kanji]) byKanji.set(c.kanji, c)
  return [...byKanji.values()]
}

export function dueCards(p: Progress, now: number): Card[] {
  return ALL_CARDS.filter((c) => isDue(p.cards[c.kanji], now))
}

export const buildChapterSession = (p: Progress, ch: Chapter): Session => ({
  id: newId('chapter'),
  mode: 'chapter',
  chapterId: ch.id,
  level: ch.level,
  cards: ch.cards,
  rounds: 2,
  newKanji: ch.cards.filter((c) => !p.cards[c.kanji]).map((c) => c.kanji),
  distractors: distractorsFor(p, ch.cards, ch.level),
})

function commonLevel(cards: Card[]): Level {
  const counts = new Map<Level, number>()
  for (const c of cards) counts.set(c.level, (counts.get(c.level) ?? 0) + 1)
  return LEVELS.reduce((best, l) => ((counts.get(l) ?? 0) > (counts.get(best) ?? 0) ? l : best), LEVELS[0])
}

/** Most overdue first, with leeches pulled to the front. */
export function buildReviewSession(p: Progress, now: number, limit = REVIEW_LIMIT): Session | null {
  const due = dueCards(p, now)
    .sort((a, b) => {
      const la = isLeech(p.cards[a.kanji]) ? 0 : 1
      const lb = isLeech(p.cards[b.kanji]) ? 0 : 1
      return la - lb || p.cards[a.kanji].due - p.cards[b.kanji].due
    })
    .slice(0, limit)
  if (!due.length) return null
  const level = commonLevel(due)
  return { id: newId('review'), mode: 'review', level, cards: due, rounds: 1, distractors: distractorsFor(p, due, level) }
}

export function buildPracticeSession(p: Progress, cards: Card[], limit = PRACTICE_LIMIT): Session | null {
  const picked = cards.slice(0, limit)
  if (!picked.length) return null
  const level = commonLevel(picked)
  return { id: newId('practice'), mode: 'practice', level, cards: picked, rounds: 1, distractors: distractorsFor(p, picked, level) }
}

export function buildBossSession(boss: { id: string; a: string; b: string }, auto = false): Session | null {
  const a = CARD_BY_KANJI.get(boss.a)
  const b = CARD_BY_KANJI.get(boss.b)
  if (!a || !b) return null
  return { id: newId('boss'), mode: 'boss', level: a.level, cards: [a, b], pair: [a, b], auto, rounds: 1, distractors: [a, b] }
}
