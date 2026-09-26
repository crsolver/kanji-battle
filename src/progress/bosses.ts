import type { Confusion, Progress } from './types'

/** Combined mix-ups (either direction) before a pair becomes a boss. One is enough. */
export const BOSS_MIN_MIXUPS = 1
/** Answers in a row needed to win a duel. */
export const BOSS_STREAK = 6
/** Duels won before the boss retires. One clean win clears the mix-up. */
export const BOSS_WINS_TO_RETIRE = 1
/** New mix-ups after retiring that bring the boss back. */
export const BOSS_REARM_MIXUPS = 2

export const pairId = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`)

export interface ActiveBoss {
  id: string
  a: string
  b: string
  /** Times this pair has been mixed up, both directions together. */
  count: number
}

/** Mix-up totals per unordered pair. */
export function pairCounts(confusions: Record<string, Confusion>): Map<string, ActiveBoss> {
  const out = new Map<string, ActiveBoss>()
  for (const c of Object.values(confusions)) {
    const id = pairId(c.shown, c.mistakenFor)
    const [a, b] = id.split('|')
    const row = out.get(id) ?? { id, a, b, count: 0 }
    row.count += c.count
    out.set(id, row)
  }
  return out
}

/** Pairs that currently have a boss waiting, worst first. */
export function activeBosses(p: Progress): ActiveBoss[] {
  const out: ActiveBoss[] = []
  for (const pair of pairCounts(p.confusions).values()) {
    if (pair.count < BOSS_MIN_MIXUPS) continue
    const rec = p.bosses[pair.id]
    if (rec?.retired && pair.count < rec.countAtRetire + BOSS_REARM_MIXUPS) continue
    out.push(pair)
  }
  return out.sort((x, y) => y.count - x.count)
}
