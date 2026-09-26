import { ALL_CARDS, type Card, type Level } from '../data/cards'
import { CHAPTERS } from './chapters'
import { cardStatus, isDue, isLeech, type CardStatus } from './status'
import type { CardState, Progress } from './types'

export interface Row {
  card: Card
  state?: CardState
  status: CardStatus
  leech: boolean
  chapterId: string
  /** Epoch ms of the next review, or null for kanji never seen. */
  due: number | null
  /** Share of answers that were right, or null for kanji never seen. */
  accuracy: number | null
  confusedWith: string[]
}

const CHAPTER_OF = new Map<string, string>()
for (const ch of CHAPTERS) for (const c of ch.cards) CHAPTER_OF.set(c.kanji, ch.id)

export function buildRows(p: Progress): Row[] {
  const partners = new Map<string, Set<string>>()
  const add = (a: string, b: string) => partners.set(a, (partners.get(a) ?? new Set()).add(b))
  for (const c of Object.values(p.confusions)) {
    add(c.shown, c.mistakenFor)
    add(c.mistakenFor, c.shown)
  }
  return ALL_CARDS.map((card) => {
    const state = p.cards[card.kanji]
    return {
      card,
      state,
      status: cardStatus(state),
      leech: isLeech(state),
      chapterId: CHAPTER_OF.get(card.kanji) ?? '',
      due: state ? state.due : null,
      accuracy: state && state.seen ? state.correct / state.seen : null,
      confusedWith: [...(partners.get(card.kanji) ?? [])],
    }
  })
}

export type SortKey = 'due' | 'lapses' | 'recent' | 'order'

export interface Filters {
  query: string
  level: Level | 'all'
  chapter: string | 'all'
  status: CardStatus | 'all'
  dueOnly: boolean
  leechOnly: boolean
  confusedOnly: boolean
  showUnseen: boolean
  sort: SortKey
}

export const defaultFilters = (): Filters => ({
  query: '', level: 'all', chapter: 'all', status: 'all',
  dueOnly: false, leechOnly: false, confusedOnly: false, showUnseen: false, sort: 'due',
})

export function filterRows(rows: Row[], f: Filters, now: number): Row[] {
  const q = f.query.trim().toLowerCase()
  const out = rows.filter((r) => {
    if (!r.state && !f.showUnseen) return false
    if (f.level !== 'all' && r.card.level !== f.level) return false
    if (f.chapter !== 'all' && r.chapterId !== f.chapter) return false
    if (f.status !== 'all' && r.status !== f.status) return false
    if (f.dueOnly && !isDue(r.state, now)) return false
    if (f.leechOnly && !r.leech) return false
    if (f.confusedOnly && !r.confusedWith.length) return false
    if (q && !r.card.kanji.includes(q) && !r.card.meaning.toLowerCase().includes(q)) return false
    return true
  })
  const seenFirst = (a: Row, b: Row) => Number(!!b.state) - Number(!!a.state)
  switch (f.sort) {
    case 'due':
      return out.sort((a, b) => seenFirst(a, b) || (a.due ?? Infinity) - (b.due ?? Infinity))
    case 'lapses':
      return out.sort((a, b) => (b.state?.lapses ?? -1) - (a.state?.lapses ?? -1))
    case 'recent':
      return out.sort((a, b) => (b.state?.lastSeen ?? -1) - (a.state?.lastSeen ?? -1))
    default:
      return out
  }
}

export interface CollectionStats {
  seen: number
  total: number
  dueToday: number
  leeches: number
  mastered: number
}

export function collectionStats(rows: Row[], now: number): CollectionStats {
  const seen = rows.filter((r) => r.state)
  return {
    seen: seen.length,
    total: rows.length,
    dueToday: seen.filter((r) => isDue(r.state, now)).length,
    leeches: seen.filter((r) => r.leech).length,
    mastered: seen.filter((r) => r.status === 'mastered').length,
  }
}

export function formatDue(due: number | null, now: number): string {
  if (due === null) return '-'
  const diff = due - now
  if (diff <= 0) return 'due'
  const min = Math.round(diff / 60000)
  if (min < 60) return `in ${Math.max(min, 1)} min`
  const h = Math.round(min / 60)
  if (h < 24) return `in ${h} h`
  return `in ${Math.round(h / 24)} d`
}
