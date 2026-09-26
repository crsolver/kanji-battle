import type { Level } from '../data/cards'
import { review } from '../srs/scheduler'
import { BOSS_WINS_TO_RETIRE, activeBosses, pairCounts, pairId } from './bosses'
import {
  CHAPTER_BY_ID, MIN_ACCURACY, MIN_REMEMBERED, chapterRemembered, unlockedChapterIds, unlockedWorlds,
} from './chapters'
import { advanceStreak, dayKey } from './streak'
import type { BossRecord, CardState, ChapterRecord, Confusion, DayRecord, PlayerState, Progress, SessionResult } from './types'
import { levelInfo, sessionXp, type XpLine } from './xp'

export interface ChapterOutcome {
  id: string
  accuracy: number
  remembered: number
  cleared: boolean
  passed: boolean
  /** Already passed before this run. */
  wasPassed: boolean
  stars: number
}

export interface BossOutcome {
  id: string
  won: boolean
  wins: number
  retired: boolean
}

export interface XpOutcome {
  total: number
  lines: XpLine[]
  levelBefore: number
  levelAfter: number
  /** Total XP before and after this session. */
  xpBefore: number
  xpAfter: number
}

export interface StreakOutcome {
  before: number
  after: number
  /** First session of the day, so the streak just counted. */
  extended: boolean
}

export interface Outcome {
  xp: XpOutcome
  streak: StreakOutcome
  chapter?: ChapterOutcome
  boss?: BossOutcome
  /** Pair ids that became bosses during this session. */
  newBosses: string[]
  newlyUnlockedChapters: string[]
  newlyUnlockedWorlds: Level[]
  /** Kanji seen for the first time in this session. */
  newKanji: number
  /** Distinct mix-ups made in this session, as [shown, mistakenFor]. */
  pairs: [string, string][]
}

export interface Changes {
  cards: CardState[]
  chapters: ChapterRecord[]
  confusions: Confusion[]
  bosses: BossRecord[]
  /** Present only when something was played. */
  player?: PlayerState
  days: DayRecord[]
}

export const confusionId = (shown: string, mistakenFor: string) => `${shown}>${mistakenFor}`

export function starsFor(accuracy: number, cleared: boolean): number {
  if (!cleared) return 0
  return accuracy >= 1 ? 3 : accuracy >= 0.9 ? 2 : 1
}

/**
 * Fold a finished session into the saved progress. Pure: returns the new
 * progress plus the rows that changed so the caller can persist just those.
 */
export function applyResults(
  prev: Progress,
  r: SessionResult,
  now: number = Date.now(),
): { progress: Progress; outcome: Outcome; changes: Changes } {
  const progress: Progress = {
    cards: { ...prev.cards },
    chapters: { ...prev.chapters },
    confusions: { ...prev.confusions },
    bosses: { ...prev.bosses },
    player: prev.player,
    days: { ...prev.days },
  }
  const touched = new Set<string>()
  const touchedConf = new Set<string>()
  const before = {
    chapters: unlockedChapterIds(prev),
    worlds: new Set(unlockedWorlds(prev)),
    bosses: new Set(activeBosses(prev).map((b) => b.id)),
  }
  let newKanji = 0
  const pairs = new Map<string, [string, string]>()

  for (const a of r.attempts) {
    if (a.study) continue // a free study card teaches; it is never graded
    const orig = prev.cards[a.kanji]
    // Practising kanji that are not due yet must not disturb their schedule.
    const skipSrs = r.mode === 'boss' || (r.mode === 'practice' && !!orig && orig.due > now)
    if (!skipSrs) {
      if (!orig && !touched.has(a.kanji)) newKanji++
      progress.cards[a.kanji] = review(progress.cards[a.kanji], a, { now, sessionId: r.sessionId })
      touched.add(a.kanji)
    }
    if (!a.correct && a.mistakenFor) {
      const id = confusionId(a.kanji, a.mistakenFor)
      const old = progress.confusions[id]
      progress.confusions[id] = { id, shown: a.kanji, mistakenFor: a.mistakenFor, count: (old?.count ?? 0) + 1, last: now }
      touchedConf.add(id)
      pairs.set(id, [a.kanji, a.mistakenFor])
    }
  }

  let chapterOutcome: ChapterOutcome | undefined
  const changedChapters: ChapterRecord[] = []
  const ch = r.chapterId ? CHAPTER_BY_ID.get(r.chapterId) : undefined
  if (r.mode === 'chapter' && ch) {
    const firstTries = new Map<string, boolean>()
    for (const a of r.attempts) if (a.firstTry) firstTries.set(a.kanji, a.correct)
    const right = ch.cards.filter((c) => firstTries.get(c.kanji)).length
    const accuracy = ch.cards.length ? right / ch.cards.length : 0
    const remembered = chapterRemembered(ch, progress)
    const old = prev.chapters[ch.id]
    const wasPassed = !!old?.passed
    const passed = wasPassed || (r.cleared && accuracy >= MIN_ACCURACY && remembered >= MIN_REMEMBERED)
    const stars = Math.max(old?.stars ?? 0, starsFor(accuracy, r.cleared))
    const rec: ChapterRecord = {
      id: ch.id,
      cleared: !!old?.cleared || r.cleared,
      passed,
      bestAccuracy: Math.max(old?.bestAccuracy ?? 0, accuracy),
      stars,
      clearedAt: r.cleared ? now : (old?.clearedAt ?? 0),
      plays: (old?.plays ?? 0) + 1,
    }
    progress.chapters[ch.id] = rec
    changedChapters.push(rec)
    chapterOutcome = { id: ch.id, accuracy, remembered, cleared: r.cleared, passed, wasPassed, stars }
  }

  let bossOutcome: BossOutcome | undefined
  const changedBosses: BossRecord[] = []
  if (r.mode === 'boss' && r.pair) {
    const id = pairId(r.pair[0], r.pair[1])
    const [a, b] = id.split('|')
    const old = prev.bosses[id]
    // Fighting a retired boss means new mix-ups brought it back.
    const base: BossRecord =
      old && !old.retired
        ? old
        : { id, a, b, wins: 0, retired: false, countAtRetire: 0, defeated: old?.defeated ?? 0, lastFought: 0 }
    const rec: BossRecord = { ...base, lastFought: now }
    if (r.cleared) {
      rec.wins += 1
      rec.defeated += 1
      if (rec.wins >= BOSS_WINS_TO_RETIRE) {
        rec.retired = true
        rec.countAtRetire = pairCounts(progress.confusions).get(id)?.count ?? 0
      }
    }
    progress.bosses[id] = rec
    changedBosses.push(rec)
    bossOutcome = { id, won: r.cleared, wins: rec.wins, retired: rec.retired }
  }

  // XP, streak and the day's tally. A session with no answers counts for nothing.
  const answered = r.attempts.length > 0
  const streakBefore = prev.player.streak.current
  let xp: XpOutcome = {
    total: 0, lines: [], levelBefore: levelInfo(prev.player.xp).level, levelAfter: levelInfo(prev.player.xp).level,
    xpBefore: prev.player.xp, xpAfter: prev.player.xp,
  }
  let streak: StreakOutcome = { before: streakBefore, after: streakBefore, extended: false }
  const changedDays: DayRecord[] = []
  let changedPlayer: PlayerState | undefined
  if (answered) {
    const adv = advanceStreak(prev.player.streak, now)
    const breakdown = sessionXp({
      mode: r.mode,
      result: r,
      chapter: chapterOutcome,
      boss: bossOutcome,
      streakDays: adv.streak.current,
      firstOfDay: adv.firstOfDay,
    })
    const ms = r.durationMs ?? r.attempts.reduce((sum, a) => sum + a.ms, 0)
    const xpAfter = prev.player.xp + breakdown.total
    changedPlayer = {
      ...prev.player,
      xp: xpAfter,
      streak: adv.streak,
      floors: prev.player.floors + (r.cleared && r.mode !== 'boss' ? 1 : 0),
      ms: prev.player.ms + ms,
      bossWins: prev.player.bossWins + (bossOutcome?.won ? 1 : 0),
    }
    progress.player = changedPlayer
    const key = dayKey(now)
    const graded = r.attempts.filter((a) => !a.study)
    const day: DayRecord = prev.days[key] ?? { date: key, answers: 0, correct: 0, xp: 0, ms: 0, newKanji: 0 }
    const today: DayRecord = {
      ...day,
      answers: day.answers + graded.length,
      correct: day.correct + graded.filter((a) => a.correct).length,
      xp: day.xp + breakdown.total,
      ms: day.ms + ms,
      newKanji: day.newKanji + newKanji,
    }
    progress.days[key] = today
    changedDays.push(today)
    xp = {
      total: breakdown.total, lines: breakdown.lines, xpBefore: prev.player.xp, xpAfter,
      levelBefore: levelInfo(prev.player.xp).level, levelAfter: levelInfo(xpAfter).level,
    }
    streak = { before: streakBefore, after: adv.streak.current, extended: adv.firstOfDay }
  }

  const after = { chapters: unlockedChapterIds(progress), worlds: unlockedWorlds(progress) }
  return {
    progress,
    outcome: {
      xp,
      streak,
      chapter: chapterOutcome,
      boss: bossOutcome,
      newBosses: activeBosses(progress).map((x) => x.id).filter((id) => !before.bosses.has(id)),
      newlyUnlockedChapters: [...after.chapters].filter((id) => !before.chapters.has(id)),
      newlyUnlockedWorlds: after.worlds.filter((l) => !before.worlds.has(l)),
      newKanji,
      pairs: [...pairs.values()],
    },
    changes: {
      cards: [...touched].map((k) => progress.cards[k]),
      chapters: changedChapters,
      confusions: [...touchedConf].map((id) => progress.confusions[id]),
      bosses: changedBosses,
      player: changedPlayer,
      days: changedDays,
    },
  }
}
