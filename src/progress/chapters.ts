import { ALL_CARDS, LEVELS, type Card, type Level } from '../data/cards'
import { isRemembered } from './status'
import type { Progress } from './types'

export const CHAPTER_SIZE = 20
/** First-try accuracy needed to pass a chapter. */
export const MIN_ACCURACY = 0.8
/** Share of the chapter's kanji that must be remembered to pass it. */
export const MIN_REMEMBERED = 0.7

export interface Chapter {
  id: string
  level: Level
  /** 1-based position inside its level. */
  index: number
  cards: Card[]
}

function build(): Chapter[] {
  const chapters: Chapter[] = []
  for (const level of LEVELS) {
    const cards = ALL_CARDS.filter((c) => c.level === level)
    for (let i = 0; i < cards.length; i += CHAPTER_SIZE) {
      const index = i / CHAPTER_SIZE + 1
      chapters.push({ id: `${level}-${index}`, level, index, cards: cards.slice(i, i + CHAPTER_SIZE) })
    }
  }
  return chapters
}

export const CHAPTERS: Chapter[] = build()
export const CHAPTER_BY_ID = new Map(CHAPTERS.map((c) => [c.id, c]))
export const CHAPTERS_BY_LEVEL: Record<Level, Chapter[]> = Object.fromEntries(
  LEVELS.map((l) => [l, CHAPTERS.filter((c) => c.level === l)]),
) as Record<Level, Chapter[]>

export const chapterOf = (kanji: string): Chapter | undefined =>
  CHAPTERS.find((c) => c.cards.some((k) => k.kanji === kanji))

/** Fraction (0..1) of a chapter's kanji that are remembered. */
export function chapterRemembered(ch: Chapter, p: Progress): number {
  if (!ch.cards.length) return 0
  return ch.cards.filter((c) => isRemembered(p.cards[c.kanji])).length / ch.cards.length
}

export const isPassed = (p: Progress, ch: Chapter) => !!p.chapters[ch.id]?.passed

export function isWorldUnlocked(p: Progress, level: Level): boolean {
  const i = LEVELS.indexOf(level)
  if (i <= 0) return true
  return CHAPTERS_BY_LEVEL[LEVELS[i - 1]].every((c) => isPassed(p, c))
}

export function isChapterUnlocked(p: Progress, ch: Chapter): boolean {
  if (ch.index > 1) return isPassed(p, CHAPTERS_BY_LEVEL[ch.level][ch.index - 2])
  return isWorldUnlocked(p, ch.level)
}

export type ChapterStatus = 'locked' | 'available' | 'cleared' | 'passed'

export function chapterStatus(p: Progress, ch: Chapter): ChapterStatus {
  if (isPassed(p, ch)) return 'passed'
  if (!isChapterUnlocked(p, ch)) return 'locked'
  return p.chapters[ch.id]?.cleared ? 'cleared' : 'available'
}

/** Why a chapter is locked, or null when it is open. */
export function unlockRequirement(p: Progress, ch: Chapter): string | null {
  if (isChapterUnlocked(p, ch)) return null
  if (ch.index > 1) return `Pass ${ch.level}-${ch.index - 1} first`
  const prev = LEVELS[LEVELS.indexOf(ch.level) - 1]
  return `Pass every ${prev} chapter to open ${ch.level}`
}

export function unlockedChapterIds(p: Progress): Set<string> {
  return new Set(CHAPTERS.filter((c) => isChapterUnlocked(p, c)).map((c) => c.id))
}

export function unlockedWorlds(p: Progress): Level[] {
  return LEVELS.filter((l) => isWorldUnlocked(p, l))
}
