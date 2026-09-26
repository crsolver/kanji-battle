import { create } from 'zustand'
import type { Card, Level } from '../data/cards'
import { applyResults, type BossOutcome, type Outcome } from '../progress/applyResults'
import { CHAPTERS, CHAPTER_BY_ID, isChapterUnlocked, unlockedWorlds } from '../progress/chapters'
import { activeBosses } from '../progress/bosses'
import { buildBossSession, buildChapterSession, buildPracticeSession, buildReviewSession } from '../progress/sessions'
import { emptyProgress, type Progress, type SavedFloor, type Session, type SessionResult } from '../progress/types'
import { freshCard } from '../srs/scheduler'
import { dayKeyOffset, dayKey } from '../progress/streak'
import { deleteSave, exportProgress, loadProgress, loadSave, parseBackup, persist, replaceProgress, writeSave } from './db'

/** The newest autosave. Kept outside the store so saving every answer does not re-render the app. */
let latestSave: SavedFloor | null = null

export type Screen = 'map' | 'battle' | 'summary' | 'collection' | 'stats'

export interface DuelResult {
  pair: [string, string]
  outcome: BossOutcome
  hpLeft: number
}

export interface Summary {
  result: SessionResult
  outcome: Outcome
  session: Session
  /** Boss duels fought automatically right after this floor. */
  duels: DuelResult[]
}

interface AppState {
  ready: boolean
  screen: Screen
  /** World (JLPT level) shown on the map. */
  world: Level
  progress: Progress
  session: Session | null
  summary: Summary | null
  /** A chapter floor that was paused and can be resumed. */
  saved: SavedFloor | null
  /** The floor summary held back while automatic boss duels are played. */
  pending: Summary | null
  /** Boss ids still to fight automatically (the first is the current duel). */
  bossQueue: string[]
  duels: DuelResult[]
  init: () => Promise<void>
  goto: (screen: Screen) => void
  setWorld: (level: Level) => void
  startChapter: (id: string) => void
  /** Autosave the floor in progress (no re-render). */
  saveFloor: (s: SavedFloor) => void
  resumeChapter: () => void
  /** Leave a chapter floor for the map; the autosave keeps its place. */
  exitToMap: () => void
  startReview: () => void
  startPractice: (cards: Card[]) => void
  startBoss: (id: string) => void
  /** Fight every waiting boss in a row, worst pair first. */
  startAllBosses: () => void
  finish: (result: SessionResult) => void
  exportBackup: () => Promise<string>
  importBackup: (json: string) => Promise<void>
  resetAll: () => Promise<void>
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  screen: 'map',
  world: 'N5',
  progress: emptyProgress(),
  session: null,
  summary: null,
  saved: null,
  pending: null,
  bossQueue: [],
  duels: [],

  init: async () => {
    const [progress, saved] = await Promise.all([loadProgress(), loadSave()])
    latestSave = saved ?? null
    const worlds = unlockedWorlds(progress)
    const savedLevel = saved ? CHAPTER_BY_ID.get(saved.chapterId)?.level : undefined
    set({ progress, saved: latestSave, ready: true, world: savedLevel ?? worlds[worlds.length - 1] })
  },

  goto: (screen) => set({ screen }),
  setWorld: (world) => set({ world }),

  startChapter: (id) => {
    const ch = CHAPTER_BY_ID.get(id)
    const { progress } = get()
    if (!ch || !isChapterUnlocked(progress, ch)) return
    // Starting a chapter over throws away any paused floor.
    latestSave = null
    deleteSave().catch((e) => console.error('Could not clear the saved floor', e))
    set({ session: buildChapterSession(progress, ch), saved: null, screen: 'battle' })
  },

  saveFloor: (s) => {
    latestSave = s
    writeSave(s).catch((e) => console.error('Could not save the floor', e))
  },

  resumeChapter: () => {
    const { saved, progress } = get()
    const ch = saved && CHAPTER_BY_ID.get(saved.chapterId)
    if (!saved || !ch) return
    set({ session: { ...buildChapterSession(progress, ch), id: saved.sessionId, resume: saved }, screen: 'battle' })
  },

  exitToMap: () => set({ session: null, saved: latestSave, screen: 'map' }),

  startReview: () => {
    const session = buildReviewSession(get().progress, Date.now())
    if (session) set({ session, screen: 'battle' })
  },

  startPractice: (cards) => {
    const session = buildPracticeSession(get().progress, cards)
    if (session) set({ session, screen: 'battle' })
  },

  startBoss: (id) => {
    const boss = activeBosses(get().progress).find((b) => b.id === id)
    const session = boss && buildBossSession(boss)
    if (session) set({ session, screen: 'battle' })
  },

  startAllBosses: () => {
    const bosses = activeBosses(get().progress)
    const first = bosses[0] && buildBossSession(bosses[0], true)
    if (first) set({ session: first, bossQueue: bosses.map((b) => b.id), pending: null, duels: [], screen: 'battle' })
  },

  finish: (result) => {
    const { progress, session, pending, bossQueue, duels } = get()
    if (!session) return set({ screen: 'map' })
    // A finished (or abandoned) chapter floor has nothing left to resume.
    if (session.mode === 'chapter') {
      latestSave = null
      deleteSave().catch((e) => console.error('Could not clear the saved floor', e))
      set({ saved: null })
    }
    const { progress: next, outcome, changes } = applyResults(progress, result)
    persist(changes).catch((e) => console.error('Could not save progress', e))

    // A duel in a chain just ended (after a floor, or from FIGHT ALL): fight the next waiting boss,
    // or show the summary.
    // The chain stops after a lost or abandoned duel, so a bad run is not dragged out.
    if (result.mode === 'boss' && bossQueue.length > 0 && outcome.boss) {
      const fought = [...duels, { pair: result.pair!, outcome: outcome.boss, hpLeft: result.hpLeft }]
      const waiting = new Set(activeBosses(next).map((b) => b.id))
      const rest = result.cleared ? bossQueue.slice(1).filter((id) => waiting.has(id)) : []
      const nextBoss = activeBosses(next).find((b) => b.id === rest[0])
      const nextSession = nextBoss && buildBossSession(nextBoss, true)
      if (nextSession) {
        return set({ progress: next, session: nextSession, bossQueue: rest, duels: fought, screen: 'battle' })
      }
      // After a floor the held-back floor summary is shown; a FIGHT ALL run ends on the last duel's.
      const base: Summary = pending ?? { result, outcome, session, duels: [] }
      return set({
        progress: next, summary: { ...base, duels: fought }, screen: 'summary',
        session: null, pending: null, bossQueue: [], duels: [],
      })
    }

    const summary: Summary = { result, outcome, session, duels: [] }
    // After a cleared floor, the waiting bosses that involve a kanji from this floor are fought
    // right away, no button needed. Older bosses wait on the map.
    const inFloor = new Set(session.cards.map((c) => c.kanji))
    const bosses =
      result.mode !== 'boss' && result.cleared
        ? activeBosses(next).filter((b) => inFloor.has(b.a) || inFloor.has(b.b))
        : []
    const first = bosses[0] && buildBossSession(bosses[0], true)
    if (first) {
      return set({
        progress: next, pending: summary, bossQueue: bosses.map((b) => b.id), duels: [],
        session: first, screen: 'battle',
      })
    }
    set({ progress: next, summary, screen: 'summary', session: null })
  },

  exportBackup: () => exportProgress(),

  importBackup: async (json) => {
    const progress = parseBackup(json)
    await replaceProgress(progress)
    set({ progress, screen: 'map' })
  },

  resetAll: async () => {
    await replaceProgress(emptyProgress())
    latestSave = null
    set({ progress: emptyProgress(), screen: 'map', world: 'N5', session: null, summary: null, saved: null, pending: null, bossQueue: [], duels: [] })
  },
}))

// Dev-only helpers so unlocks can be checked without replaying whole chapters.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __kb: unknown }).__kb = {
    /** Mark the first `n` chapters passed, with their kanji remembered. */
    async passChapters(n: number) {
      const now = Date.now()
      const p = emptyProgress()
      for (const ch of CHAPTERS.slice(0, n)) {
        p.chapters[ch.id] = { id: ch.id, cleared: true, passed: true, bestAccuracy: 1, stars: 3, clearedAt: now, plays: 1 }
        for (const c of ch.cards) {
          p.cards[c.kanji] = { ...freshCard(c.kanji, now), interval: 3, due: now + 3 * 86_400_000, reps: 2, seen: 2, correct: 2, good: 2 }
        }
      }
      await replaceProgress(p)
      await useApp.getState().init()
    },
    /** Record `count` mix-ups of a for b, so a boss is waiting. */
    async makeBoss(a: string, b: string, count = 3) {
      const p = useApp.getState().progress
      const id = `${a}>${b}`
      const next = { ...p, confusions: { ...p.confusions, [id]: { id, shown: a, mistakenFor: b, count, last: Date.now() } } }
      await replaceProgress(next)
      await useApp.getState().init()
    },
    /** Set the player's XP, for testing level-ups. */
    async setXp(xp: number) {
      const p = useApp.getState().progress
      await replaceProgress({ ...p, player: { ...p.player, xp } })
      await useApp.getState().init()
    },
    /** 30 days of history, weak kanji, mix-ups and a streak, so every chart has something to draw. */
    async seedStats() {
      const now = Date.now()
      const today = dayKey(now)
      const p = emptyProgress()
      for (let i = 0; i < 30; i++) {
        if (i % 4 === 2) continue // some days off
        const date = dayKeyOffset(today, -i)
        const answers = 8 + ((i * 7) % 40)
        const correct = Math.round(answers * (0.6 + ((i * 3) % 30) / 100))
        p.days[date] = { date, answers, correct, xp: answers * 12, ms: answers * 4000, newKanji: i % 5 }
      }
      const kanji = CHAPTERS.slice(0, 3).flatMap((c) => c.cards)
      kanji.forEach((c, i) => {
        p.cards[c.kanji] = {
          ...freshCard(c.kanji, now),
          interval: [1, 3, 10, 30][i % 4], seen: 6 + (i % 7), correct: 3 + (i % 5), lapses: i % 6,
          due: now + 86_400_000, good: 2,
        }
      })
      const [a, b, c, d] = kanji.map((k) => k.kanji)
      p.confusions[`${a}>${b}`] = { id: `${a}>${b}`, shown: a, mistakenFor: b, count: 4, last: now }
      p.confusions[`${c}>${d}`] = { id: `${c}>${d}`, shown: c, mistakenFor: d, count: 2, last: now }
      const pair = [c, d].sort()
      p.bosses[pair.join('|')] = { id: pair.join('|'), a: pair[0], b: pair[1], wins: 1, retired: true, countAtRetire: 2, defeated: 1, lastFought: now }
      p.player = { xp: 1234, streak: { current: 5, best: 12, lastDay: today }, floors: 14, ms: 5_400_000, bossWins: 3 }
      await replaceProgress(p)
      await useApp.getState().init()
    },
    reset: () => useApp.getState().resetAll(),
    state: () => useApp.getState().progress,
  }
}
