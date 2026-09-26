import type { Card } from '../data/cards'
import { ENCOUNTER_GAP } from '../srs/scheduler'
import { shuffle } from './questions'

/** New kanji are introduced this many at a time. */
export const STUDY_BATCH = 5

export interface QueueItem {
  card: Card
  /** A free study card (answer shown, nothing at stake) for a kanji never seen before. */
  study?: boolean
}

function spacedOk(order: Card[], offset: number, last: Map<string, number>) {
  return order.every((c, i) => {
    const prev = last.get(c.kanji)
    return prev === undefined || offset + i - prev >= ENCOUNTER_GAP
  })
}

/**
 * The order kanji appear in a floor:
 * 1. a warm-up test of the kanji already seen;
 * 2. new kanji in batches: study cards for a few, then a test of just those, then the next few;
 * 3. a final test round of everything (more rounds if asked), reshuffled until a card's repeat
 *    is far enough from its last showing to count as a separate encounter.
 * `rounds` is how many times each kanji is tested in total.
 */
export function buildQueue(
  cards: Card[],
  rounds: number,
  newKanji: string[] = [],
  batch: number = STUDY_BATCH,
): QueueItem[] {
  const isNew = new Set(newKanji)
  const familiar = cards.filter((c) => !isNew.has(c.kanji))
  const fresh = shuffle(cards.filter((c) => isNew.has(c.kanji)))
  const out: QueueItem[] = []
  const last = new Map<string, number>()

  const push = (items: QueueItem[]) => {
    items.forEach((it, i) => {
      if (!it.study) last.set(it.card.kanji, out.length + i)
    })
    out.push(...items)
  }

  if (familiar.length) push(shuffle(familiar).map((card) => ({ card })))
  for (let i = 0; i < fresh.length; i += batch) {
    const chunk = fresh.slice(i, i + batch)
    push(chunk.map((card) => ({ card, study: true })))
    push(shuffle(chunk).map((card) => ({ card })))
  }
  for (let r = 1; r < rounds; r++) {
    let order = shuffle(cards)
    for (let tries = 0; tries < 60 && !spacedOk(order, out.length, last); tries++) order = shuffle(cards)
    push(order.map((card) => ({ card })))
  }
  return out
}
