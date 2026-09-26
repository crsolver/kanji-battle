import type { StreakState } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

/** Local calendar date of a timestamp, as YYYY-MM-DD. */
export function dayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** The calendar day before a date key. Built from date parts so DST shifts cannot skip or repeat a day. */
export function prevDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return dayKey(new Date(y, m - 1, d - 1, 12).getTime())
}

export const dayKeyOffset = (key: string, days: number): string => {
  const [y, m, d] = key.split('-').map(Number)
  return dayKey(new Date(y, m - 1, d + days, 12).getTime())
}

/** Count today toward the streak. `firstOfDay` is true the first time each day. */
export function advanceStreak(s: StreakState, now: number): { streak: StreakState; firstOfDay: boolean } {
  const today = dayKey(now)
  if (s.lastDay === today) return { streak: s, firstOfDay: false }
  const current = s.lastDay === prevDayKey(today) ? s.current + 1 : 1
  return { streak: { current, best: Math.max(s.best, current), lastDay: today }, firstOfDay: true }
}

/** The streak as it should be displayed today: a streak that was not extended yesterday is over. */
export function liveStreak(s: StreakState, now: number): number {
  const today = dayKey(now)
  return s.lastDay === today || s.lastDay === prevDayKey(today) ? s.current : 0
}
