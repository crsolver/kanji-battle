import type { Card, Level } from '../data/cards'

/** Everything we remember about one kanji. A row exists only once it has been seen. */
export interface CardState {
  kanji: string
  ease: number
  /** Days until the next review; 0 while a card is new or was just missed. */
  interval: number
  /** Epoch ms when the card is next due. */
  due: number
  /** Reviews answered right on the first try. */
  reps: number
  lapses: number
  /** Total answers given, and how many were right. */
  seen: number
  correct: number
  streak: number
  firstSeen: number
  lastSeen: number
  /** Separate encounters answered correctly. Two means "remembered". */
  good: number
  lastGoodSession: string
  lastGoodPos: number
}

export interface ChapterRecord {
  id: string
  /** The floor was finished with hearts left at least once. */
  cleared: boolean
  /** Cleared with enough accuracy and retention. Stays true once earned. */
  passed: boolean
  bestAccuracy: number
  stars: number
  clearedAt: number
  plays: number
}

export interface Confusion {
  id: string
  shown: string
  mistakenFor: string
  count: number
  last: number
}

/** A pair of look-alike kanji the player keeps mixing up, fought as a boss. */
export interface BossRecord {
  /** Sorted pair id, e.g. "A|B". */
  id: string
  a: string
  b: string
  /** Duels won since the boss last (re)appeared. */
  wins: number
  retired: boolean
  /** Combined mix-up count when it retired; new mix-ups beyond this bring it back. */
  countAtRetire: number
  defeated: number
  lastFought: number
}

export interface StreakState {
  current: number
  best: number
  /** Local date key (YYYY-MM-DD) of the last day something was played; '' if never. */
  lastDay: string
}

/** Whole-player numbers: XP, streak and lifetime totals. */
export interface PlayerState {
  xp: number
  streak: StreakState
  /** Floors cleared (chapters, reviews, drills), not counting boss duels. */
  floors: number
  /** Time spent in sessions, in ms. */
  ms: number
  bossWins: number
}

/** What happened on one calendar day, for the stats charts. */
export interface DayRecord {
  date: string
  answers: number
  correct: number
  xp: number
  ms: number
  newKanji: number
}

export const emptyPlayer = (): PlayerState => ({
  xp: 0,
  streak: { current: 0, best: 0, lastDay: '' },
  floors: 0,
  ms: 0,
  bossWins: 0,
})

/** A chapter floor paused part-way, so it can be picked up later. */
export interface SavedFloor {
  id: 'floor'
  sessionId: string
  chapterId: string
  /** What is still to come, the question on screen first. */
  queue: { kanji: string; study?: boolean }[]
  /** Answers given so far. They are only applied to progress when the floor is finished. */
  attempts: Attempt[]
  hp: number
  defeated: number
  xpGain: number
  elapsedMs: number
  savedAt: number
}

export interface Attempt {
  kanji: string
  correct: boolean
  /** First answer to this kanji in the session (later ones are retries). */
  firstTry: boolean
  ms: number
  /** Order of the answer within the session. */
  pos: number
  mistakenFor?: string
  /** A free 'study' showing of a kanji not seen before: never graded, never counted. */
  study?: boolean
}

export type SessionMode = 'chapter' | 'review' | 'practice' | 'boss'

export interface Session {
  id: string
  mode: SessionMode
  chapterId?: string
  level: Level
  cards: Card[]
  /** Boss duels: the two look-alikes being fought. */
  pair?: [Card, Card]
  /** Boss duel started by the game at the end of a floor (shows an intro). */
  auto?: boolean
  /** How many times each kanji comes up in the floor (chapters show them twice). */
  rounds: number
  /** Kanji not seen before this session: they get a free study card before any test. */
  newKanji?: string[]
  /** Pick up a paused floor instead of starting a new one. */
  resume?: SavedFloor
  /** Cards that may appear as wrong tiles: seen kanji plus this session's. */
  distractors: Card[]
}

export interface SessionResult {
  sessionId: string
  mode: SessionMode
  chapterId?: string
  /** Boss duels: kanji of the pair. */
  pair?: [string, string]
  attempts: Attempt[]
  /** Wall-clock length of the session in ms, when known. */
  durationMs?: number
  hpLeft: number
  maxHp: number
  /** Every kanji in the floor was defeated with hearts left. */
  cleared: boolean
}

export interface Progress {
  cards: Record<string, CardState>
  chapters: Record<string, ChapterRecord>
  confusions: Record<string, Confusion>
  bosses: Record<string, BossRecord>
  player: PlayerState
  days: Record<string, DayRecord>
}

export const emptyProgress = (): Progress => ({
  cards: {}, chapters: {}, confusions: {}, bosses: {}, player: emptyPlayer(), days: {},
})
