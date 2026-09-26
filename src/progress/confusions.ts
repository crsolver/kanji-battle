import { CARD_BY_KANJI, type Card } from '../data/cards'
import type { Progress } from './types'

const MAX_PARTNERS = 3

/** For a kanji: the ones it has been mixed up with (either way round), worst first. */
export function partnerLookup(p: Progress): (kanji: string) => Card[] {
  const counts = new Map<string, Map<string, number>>()
  const add = (a: string, b: string, n: number) => {
    const m = counts.get(a) ?? new Map<string, number>()
    m.set(b, (m.get(b) ?? 0) + n)
    counts.set(a, m)
  }
  for (const c of Object.values(p.confusions)) {
    add(c.shown, c.mistakenFor, c.count)
    add(c.mistakenFor, c.shown, c.count)
  }
  return (kanji) =>
    [...(counts.get(kanji) ?? [])]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_PARTNERS)
      .map(([k]) => CARD_BY_KANJI.get(k))
      .filter((c): c is Card => !!c)
}
