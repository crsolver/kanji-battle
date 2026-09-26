import type { CardState } from './types'

export type CardStatus = 'new' | 'learning' | 'reviewing' | 'mastered'

export const LEECH_LAPSES = 4

export function cardStatus(s: CardState | undefined): CardStatus {
  if (!s) return 'new'
  if (s.interval >= 21) return 'mastered'
  if (s.interval >= 7) return 'reviewing'
  return 'learning'
}

export const isLeech = (s: CardState | undefined) => !!s && s.lapses >= LEECH_LAPSES

/** Answered right in two separate encounters. */
export const isRemembered = (s: CardState | undefined) => !!s && s.good >= 2

export const isDue = (s: CardState | undefined, now: number) => !!s && s.due <= now
