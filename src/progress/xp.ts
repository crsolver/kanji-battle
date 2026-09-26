import type { BossOutcome, ChapterOutcome } from './applyResults'
import type { Attempt, SessionMode, SessionResult } from './types'

/** Every number that shapes XP lives here. */
export const XP = {
  correct: 10,
  comboStep: 2,
  comboCap: 20,
  fastMs: 3000,
  fastBonus: 5,
  /** A correct retry after a miss counts for this share. */
  retryFactor: 0.5,
  /** Drills earn this share of answer and floor XP, so they cannot be farmed. */
  practiceFactor: 0.5,
  /** A new kanji studied (its free study card). */
  study: 3,
  floorCleared: 20,
  pass: { 1: 100, 2: 150, 3: 200 } as Record<number, number>,
  bossWin: 40,
  reviewCleared: 30,
  streakPerDay: 5,
  streakCap: 50,
}

export interface XpLine {
  label: string
  xp: number
}

export interface XpBreakdown {
  lines: XpLine[]
  total: number
}

/** XP for one answer, given how many right answers in a row came before it. */
export function answerXp(a: Attempt, comboBefore: number): number {
  if (!a.correct) return 0
  const raw = XP.correct + Math.min(XP.comboCap, XP.comboStep * comboBefore) + (a.ms < XP.fastMs ? XP.fastBonus : 0)
  return Math.round(a.firstTry ? raw : raw * XP.retryFactor)
}

/** XP for a whole list of answers, tracking the combo the same way the battle screen does. */
export function attemptsXp(attempts: Attempt[]): number {
  let combo = 0
  let total = 0
  for (const a of attempts) {
    if (a.study) continue
    total += answerXp(a, combo)
    combo = a.correct ? combo + 1 : 0
  }
  return total
}

export interface XpInput {
  mode: SessionMode
  result: Pick<SessionResult, 'attempts' | 'cleared'>
  chapter?: Pick<ChapterOutcome, 'passed' | 'wasPassed' | 'stars'>
  boss?: Pick<BossOutcome, 'won'>
  /** Streak length after today counted, and whether this is the first session today. */
  streakDays: number
  firstOfDay: boolean
}

export function sessionXp(i: XpInput): XpBreakdown {
  const lines: XpLine[] = []
  const mult = i.mode === 'practice' ? XP.practiceFactor : 1
  const add = (label: string, xp: number) => xp > 0 && lines.push({ label, xp: Math.round(xp) })

  add('Answers', attemptsXp(i.result.attempts) * mult)
  add('New kanji studied', i.result.attempts.filter((a) => a.study).length * XP.study)
  if (i.result.cleared && i.mode !== 'boss') add('Floor cleared', XP.floorCleared * mult)
  if (i.mode === 'review' && i.result.cleared) add('Daily review', XP.reviewCleared)
  if (i.chapter?.passed && !i.chapter.wasPassed) add('Chapter passed', XP.pass[i.chapter.stars] ?? XP.pass[1])
  if (i.boss?.won) add('Boss defeated', XP.bossWin)
  if (i.firstOfDay) add(`${i.streakDays} day streak`, Math.min(XP.streakCap, XP.streakPerDay * i.streakDays))

  return { lines, total: lines.reduce((sum, l) => sum + l.xp, 0) }
}

/** XP at which a level begins: 0, 100, 300, 600, ... */
export const xpAtLevel = (level: number) => (100 * level * (level - 1)) / 2

export interface LevelInfo {
  level: number
  /** XP earned inside this level, and the XP the level needs in total. */
  into: number
  need: number
  pct: number
}

export function levelInfo(xp: number): LevelInfo {
  const safe = Math.max(0, xp)
  let level = Math.floor((1 + Math.sqrt(1 + (8 * safe) / 100)) / 2)
  while (xpAtLevel(level + 1) <= safe) level++
  while (level > 1 && xpAtLevel(level) > safe) level--
  const need = xpAtLevel(level + 1) - xpAtLevel(level)
  const into = safe - xpAtLevel(level)
  return { level, into, need, pct: need ? into / need : 0 }
}
