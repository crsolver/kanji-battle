import n5 from './kanji/N5.json'
import n4 from './kanji/N4.json'
import n3 from './kanji/N3.json'
import n2 from './kanji/N2.json'
import n1 from './kanji/N1.json'

export type Level = 'N5' | 'N4' | 'N3' | 'N2' | 'N1'

interface RawKanji {
  id: number
  kanjiChar: string
  onyomi: string[]
  kunyomi: string[]
  meanings: string[]
}

export interface Card {
  kanji: string
  meaning: string
  /** Second meaning, shown as a hint when the first meaning is shared with another kanji. */
  hint?: string
  level: Level
  onyomi: string[]
  kunyomi: string[]
  /** True when another card has the same first meaning. */
  ambiguous: boolean
}

export const LEVELS: Level[] = ['N5', 'N4', 'N3', 'N2', 'N1']

const sources: [Level, RawKanji[]][] = [
  ['N5', n5], ['N4', n4], ['N3', n3], ['N2', n2], ['N1', n1],
]

function build(): Card[] {
  const seen = new Set<string>()
  const cards: Card[] = []
  for (const [level, list] of sources) {
    for (const k of list) {
      const meaning = k.meanings[0]?.trim()
      if (!meaning || seen.has(k.kanjiChar)) continue
      seen.add(k.kanjiChar)
      cards.push({
        kanji: k.kanjiChar,
        meaning,
        hint: k.meanings[1],
        level,
        onyomi: k.onyomi,
        kunyomi: k.kunyomi,
        ambiguous: false,
      })
    }
  }
  const counts = new Map<string, number>()
  for (const c of cards) {
    const key = c.meaning.toLowerCase()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  for (const c of cards) c.ambiguous = (counts.get(c.meaning.toLowerCase()) ?? 0) > 1
  return cards
}

export const ALL_CARDS: Card[] = build()
export const CARD_BY_KANJI = new Map(ALL_CARDS.map((c) => [c.kanji, c]))
