import type { Attempt, CardState } from '../progress/types'

export const DAY_MS = 86_400_000
const RETRY_MS = 10 * 60 * 1000
const SLOW_MS = 8000
const FAST_MS = 3000
/** Answers this far apart (in cards) count as separate encounters. */
export const ENCOUNTER_GAP = 4

export const freshCard = (kanji: string, now: number): CardState => ({
  kanji,
  ease: 2.5,
  interval: 0,
  due: now,
  reps: 0,
  lapses: 0,
  seen: 0,
  correct: 0,
  streak: 0,
  firstSeen: now,
  lastSeen: now,
  good: 0,
  lastGoodSession: '',
  lastGoodPos: -1000,
})

/**
 * Fold one answer into a card's state (SM-2 flavoured).
 * Only the first answer to a card in a session moves its schedule; retries
 * after a miss just make sure the card is due again soon.
 */
export function review(
  prev: CardState | undefined,
  a: Attempt,
  ctx: { now: number; sessionId: string },
): CardState {
  const s: CardState = prev ? { ...prev } : freshCard(a.kanji, ctx.now)
  s.seen++
  s.lastSeen = ctx.now

  if (a.correct) {
    s.correct++
    s.streak++
    if (s.lastGoodSession !== ctx.sessionId || a.pos - s.lastGoodPos >= ENCOUNTER_GAP) {
      s.good++
      s.lastGoodSession = ctx.sessionId
      s.lastGoodPos = a.pos
    }
    if (a.firstTry) {
      s.reps++
      if (s.interval === 0) {
        s.interval = 1
      } else {
        const factor = a.ms > SLOW_MS ? 1.2 : s.ease
        s.interval = Math.max(s.interval + 1, Math.round(s.interval * factor))
        if (a.ms < FAST_MS) s.ease = Math.min(3, s.ease + 0.03)
      }
      s.due = ctx.now + s.interval * DAY_MS
    } else if (s.interval === 0) {
      s.interval = 1
      s.due = ctx.now + DAY_MS
    }
  } else {
    s.streak = 0
    if (a.firstTry) {
      if (s.reps > 0) {
        s.lapses++
        s.ease = Math.max(1.3, s.ease - 0.2)
      }
      s.interval = 0
      s.due = ctx.now + RETRY_MS
    }
  }
  return s
}
