import type { Card } from '../data/cards'

export type Question =
  | { kind: 'type'; card: Card }
  | { kind: 'study'; card: Card }
  | { kind: 'pick'; card: Card; options: Card[] }

export const PICK_KEYS = ['d', 'f', 'j', 'k'] as const

export function shuffle<T>(items: T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const same = (a: Card, b: Card) => a.meaning.toLowerCase() === b.meaning.toLowerCase()

/**
 * Build the 4 tiles for a meaning -> kanji question. Confusion partners come
 * first, then random cards. No tile ever shares the answer's meaning text.
 */
export function buildOptions(card: Card, pool: Card[], partners: Card[] = []): Card[] {
  const picked: Card[] = []
  const usable = (c: Card) =>
    c.kanji !== card.kanji &&
    !same(c, card) &&
    !picked.some((p) => p.kanji === c.kanji || same(p, c))
  for (const p of partners) if (picked.length < 3 && usable(p)) picked.push(p)
  for (const c of shuffle(pool)) {
    if (picked.length >= 3) break
    if (usable(c)) picked.push(c)
  }
  return shuffle([card, ...picked])
}

/** Fraction of questions that are meaning -> kanji. */
export const PICK_RATE = 0.2
export const PARTNER_PICK_RATE = 0.6

export function makeQuestion(card: Card, pool: Card[], partners: Card[] = []): Question {
  // Cards with known look-alikes are asked as "which kanji?" most of the time.
  const wantsPick = Math.random() < (partners.length > 0 ? PARTNER_PICK_RATE : PICK_RATE)
  if (wantsPick && pool.length >= 4) {
    return { kind: 'pick', card, options: buildOptions(card, pool, partners) }
  }
  return { kind: 'type', card }
}
