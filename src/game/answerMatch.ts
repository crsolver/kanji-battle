import type { Card } from '../data/cards'

export type MatchResult = 'exact' | 'typo' | 'wrong'

const LEADING_WORDS = /^(to|a|an|the)\s+/

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(LEADING_WORDS, '')
}

/** Optimal string alignment distance: insert/delete/substitute/transpose each cost 1. */
export function distance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array<number>(n + 1).fill(0)
    row[0] = i
    return row
  })
  for (let j = 0; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[m][n]
}

export function tolerance(len: number): number {
  if (len <= 3) return 0
  if (len <= 7) return 1
  return 2
}

/** Normalized forms of a card's answer that we accept. */
export function targets(card: Card): string[] {
  const forms = new Set<string>()
  const full = normalize(card.meaning)
  if (full) forms.add(full)
  const noPunct = normalize(card.meaning.replace(/\(.*?\)/g, ''))
  if (noPunct) forms.add(noPunct)
  return [...forms]
}

/** Smallest distance between the input and any accepted form of the card. */
function best(input: string, card: Card): number {
  return Math.min(...targets(card).map((t) => distance(input, t)))
}

export function isExact(input: string, card: Card): boolean {
  const n = normalize(input)
  return n !== '' && targets(card).includes(n)
}

/**
 * Judge a finished answer. `pool` is the cards a near-miss could really be
 * meant for, so "son" is never forgiven into "sun" when both are kanji.
 */
export function judge(input: string, card: Card, pool: Card[] = []): MatchResult {
  const n = normalize(input)
  if (!n) return 'wrong'
  if (isExact(input, card)) return 'exact'
  const dist = best(n, card)
  const limit = Math.min(...targets(card).map((t) => tolerance(t.length)))
  if (dist > limit) return 'wrong'
  for (const other of pool) {
    if (other.kanji === card.kanji) continue
    if (best(n, other) <= dist) return 'wrong'
  }
  return 'typo'
}

/** Which other card did the user's (wrong) answer actually describe, if any? */
export function mistakenFor(input: string, card: Card, pool: Card[]): Card | undefined {
  const n = normalize(input)
  if (!n) return undefined
  let found: Card | undefined
  let foundDist = Infinity
  for (const other of pool) {
    if (other.kanji === card.kanji) continue
    const dist = best(n, other)
    const limit = Math.min(...targets(other).map((t) => tolerance(t.length)))
    if (dist <= limit && dist < foundDist) {
      found = other
      foundDist = dist
    }
  }
  return found
}
