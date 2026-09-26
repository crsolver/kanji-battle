import { ALL_CARDS, LEVELS, type Card, type Level } from '../data/cards'
import { activeBosses, pairCounts } from './bosses'
import { cardStatus, type CardStatus } from './status'
import { dayKey, dayKeyOffset, liveStreak } from './streak'
import type { DayRecord, Progress } from './types'
import { levelInfo } from './xp'

export interface Overview {
  level: number
  xp: number
  levelPct: number
  streak: number
  bestStreak: number
  /** Totals come from the per-kanji counters, so they include play from before XP existed. */
  answers: number
  correct: number
  accuracy: number | null
  timeMs: number
  floors: number
  seen: number
  total: number
  mastered: number
  bossWins: number
}

export function overview(p: Progress, now: number): Overview {
  const cards = Object.values(p.cards)
  const answers = cards.reduce((s, c) => s + c.seen, 0)
  const correct = cards.reduce((s, c) => s + c.correct, 0)
  const lvl = levelInfo(p.player.xp)
  return {
    level: lvl.level,
    xp: p.player.xp,
    levelPct: lvl.pct,
    streak: liveStreak(p.player.streak, now),
    bestStreak: p.player.streak.best,
    answers,
    correct,
    accuracy: answers ? correct / answers : null,
    timeMs: p.player.ms,
    floors: p.player.floors,
    seen: cards.length,
    total: ALL_CARDS.length,
    mastered: cards.filter((c) => cardStatus(c) === 'mastered').length,
    bossWins: p.player.bossWins,
  }
}

export interface LevelStatus {
  level: Level
  total: number
  counts: Record<CardStatus, number>
}

/** How many kanji of each JLPT level are new / learning / reviewing / mastered. */
export function statusByLevel(p: Progress): LevelStatus[] {
  return LEVELS.map((level) => {
    const counts: Record<CardStatus, number> = { new: 0, learning: 0, reviewing: 0, mastered: 0 }
    let total = 0
    for (const c of ALL_CARDS) {
      if (c.level !== level) continue
      total++
      counts[cardStatus(p.cards[c.kanji])]++
    }
    return { level, total, counts }
  })
}

export interface DayPoint {
  date: string
  answers: number
  correct: number
  xp: number
}

/** The last `n` calendar days ending at `today`, oldest first, with zeros for days nothing was played. */
export function activitySeries(days: Record<string, DayRecord>, n: number, today: string): DayPoint[] {
  return Array.from({ length: n }, (_, i) => {
    const date = dayKeyOffset(today, i - (n - 1))
    const d = days[date]
    return { date, answers: d?.answers ?? 0, correct: d?.correct ?? 0, xp: d?.xp ?? 0 }
  })
}

export interface AccuracyPoint {
  date: string
  /** null when nothing was answered that day, so the chart shows a gap. */
  accuracy: number | null
  answers: number
}

export function accuracySeries(days: Record<string, DayRecord>, n: number, today: string): AccuracyPoint[] {
  return activitySeries(days, n, today).map((d) => ({
    date: d.date,
    accuracy: d.answers ? d.correct / d.answers : null,
    answers: d.answers,
  }))
}

export interface HardKanji {
  card: Card
  lapses: number
  seen: number
  accuracy: number
}

/** Kanji that cost the most: most lapses, then lowest accuracy. Needs a few answers and at least one miss. */
export function hardestKanji(p: Progress, limit = 10, minAnswers = 3): HardKanji[] {
  const rows: HardKanji[] = []
  for (const c of ALL_CARDS) {
    const s = p.cards[c.kanji]
    if (!s || s.seen < minAnswers || s.correct >= s.seen) continue
    rows.push({ card: c, lapses: s.lapses, seen: s.seen, accuracy: s.correct / s.seen })
  }
  return rows
    .sort((a, b) => b.lapses - a.lapses || a.accuracy - b.accuracy || b.seen - a.seen)
    .slice(0, limit)
}

export interface ConfusedPair {
  a: string
  b: string
  count: number
  boss: 'waiting' | 'retired' | 'none'
}

/** The pairs mixed up most, marked with the state of their boss. */
export function topConfusions(p: Progress, limit = 8): ConfusedPair[] {
  const waiting = new Set(activeBosses(p).map((b) => b.id))
  return [...pairCounts(p.confusions).values()]
    .sort((x, y) => y.count - x.count || x.id.localeCompare(y.id))
    .slice(0, limit)
    .map((pair) => ({
      a: pair.a,
      b: pair.b,
      count: pair.count,
      boss: waiting.has(pair.id) ? 'waiting' : p.bosses[pair.id]?.retired ? 'retired' : 'none',
    }))
}

export const todayKey = (now: number) => dayKey(now)

export function formatDuration(ms: number): string {
  const min = Math.round(ms / 60000)
  if (min < 1) return ms > 0 ? '<1 min' : '0 min'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return `${h} h ${min % 60} min`
}
