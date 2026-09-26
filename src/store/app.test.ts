import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./db', () => ({
  persist: vi.fn(async () => {}),
  loadProgress: vi.fn(async () => ({ cards: {}, chapters: {}, confusions: {}, bosses: {} })),
  replaceProgress: vi.fn(async () => {}),
  exportProgress: vi.fn(async () => '{}'),
  parseBackup: vi.fn(),
  loadSave: vi.fn(async () => undefined),
  writeSave: vi.fn(async () => {}),
  deleteSave: vi.fn(async () => {}),
}))

import { CHAPTERS } from '../progress/chapters'
import { pairId } from '../progress/bosses'
import { buildBossSession, buildChapterSession } from '../progress/sessions'
import { emptyProgress, type Progress, type SavedFloor, type SessionResult } from '../progress/types'
import { useApp } from './app'

const [A, B, C, D, E, F] = CHAPTERS[0].cards.map((c) => c.kanji)
const [X, Y] = CHAPTERS[1].cards.map((c) => c.kanji) // kanji from a different chapter

/** Progress where each [x, y] pair has been mixed up 3 times, so a boss waits for each. */
function waiting(...pairs: [string, string][]): Progress {
  const p = emptyProgress()
  for (const [x, y] of pairs) p.confusions[`${x}>${y}`] = { id: `${x}>${y}`, shown: x, mistakenFor: y, count: 3, last: 0 }
  return p
}

const floor = (cleared: boolean): SessionResult => ({
  sessionId: 'floor', mode: 'chapter', chapterId: 'N5-1', attempts: [], hpLeft: cleared ? 5 : 0, maxHp: 8, cleared,
})
const duelResult = (a: string, b: string, cleared: boolean): SessionResult => ({
  sessionId: 'duel', mode: 'boss', pair: [a, b], attempts: [], hpLeft: cleared ? 4 : 0, maxHp: 5, cleared,
})

function startFloor(progress: Progress) {
  useApp.setState({
    progress, screen: 'battle', summary: null, pending: null, bossQueue: [], duels: [],
    session: buildChapterSession(progress, CHAPTERS[0]),
  })
}

beforeEach(() => useApp.setState({ session: null, summary: null, pending: null, bossQueue: [], duels: [], screen: 'map' }))

describe('automatic boss duels', () => {
  it('start right after a cleared floor when a boss is waiting, with no button', () => {
    startFloor(waiting([A, B]))
    useApp.getState().finish(floor(true))
    const s = useApp.getState()
    expect(s.screen).toBe('battle')
    expect(s.session).toMatchObject({ mode: 'boss', auto: true })
    expect(s.session!.pair!.map((c) => c.kanji).sort()).toEqual([A, B].sort())
    expect(s.summary).toBeNull()
    expect(s.pending?.session.mode).toBe('chapter') // the floor summary is held back
  })

  it('show the floor summary, with the duel results, once the duel is over', () => {
    startFloor(waiting([A, B]))
    useApp.getState().finish(floor(true))
    useApp.getState().finish(duelResult(A, B, true))
    const s = useApp.getState()
    expect(s.screen).toBe('summary')
    expect(s.summary!.session.mode).toBe('chapter')
    expect(s.summary!.duels).toHaveLength(1)
    expect(s.summary!.duels[0].outcome).toMatchObject({ id: pairId(A, B), won: true, wins: 1 })
    expect(s.pending).toBeNull()
    expect(s.bossQueue).toEqual([])
  })

  it('chain into the next waiting boss, worst pair first', () => {
    const p = waiting([A, B], [C, D])
    p.confusions[`${C}>${D}`].count = 9
    startFloor(p)
    useApp.getState().finish(floor(true))
    expect(useApp.getState().session!.pair!.map((c) => c.kanji).sort()).toEqual([C, D].sort())
    useApp.getState().finish(duelResult(C, D, true))
    const mid = useApp.getState()
    expect(mid.screen).toBe('battle')
    expect(mid.session!.pair!.map((c) => c.kanji).sort()).toEqual([A, B].sort())
    useApp.getState().finish(duelResult(A, B, true))
    const end = useApp.getState()
    expect(end.screen).toBe('summary')
    expect(end.summary!.duels.map((d) => d.outcome.won)).toEqual([true, true])
  })

  it('fight every waiting boss, with no cap', () => {
    startFloor(waiting([A, B], [C, D], [E, F]))
    useApp.getState().finish(floor(true))
    for (const [x, y] of [[A, B], [C, D], [E, F]]) {
      expect(useApp.getState().screen).toBe('battle')
      const [p, q] = useApp.getState().session!.pair!.map((c) => c.kanji)
      useApp.getState().finish(duelResult(p, q, true))
      expect([p, q].sort()).toEqual([x, y].sort()) // same-count ties keep a stable order
    }
    const s = useApp.getState()
    expect(s.screen).toBe('summary')
    expect(s.summary!.duels).toHaveLength(3)
  })

  it('stop the chain after a lost duel, keeping the results so far', () => {
    startFloor(waiting([A, B], [C, D], [E, F]))
    useApp.getState().finish(floor(true))
    const [p, q] = useApp.getState().session!.pair!.map((c) => c.kanji)
    useApp.getState().finish(duelResult(p, q, false))
    const s = useApp.getState()
    expect(s.screen).toBe('summary')
    expect(s.summary!.duels).toHaveLength(1)
    expect(s.summary!.duels[0].outcome.won).toBe(false)
    expect(s.pending).toBeNull()
    expect(s.session).toBeNull()
  })

  it('only fight bosses that involve a kanji from the floor just played', () => {
    startFloor(waiting([X, Y], [A, X]))
    useApp.getState().finish(floor(true))
    const s = useApp.getState()
    expect(s.screen).toBe('battle') // A|X involves a kanji of this chapter
    expect(s.session!.pair!.map((c) => c.kanji).sort()).toEqual([A, X].sort())
    useApp.getState().finish(duelResult(A, X, true))
    const end = useApp.getState()
    expect(end.screen).toBe('summary') // X|Y is an older boss and waits on the map
    expect(end.summary!.duels).toHaveLength(1)
  })

  it('leave older bosses for the map when none involve this floor', () => {
    startFloor(waiting([X, Y]))
    useApp.getState().finish(floor(true))
    const s = useApp.getState()
    expect(s.screen).toBe('summary')
    expect(s.summary!.duels).toEqual([])
    expect(s.session).toBeNull()
  })

  it('do not start after a quit or a defeat', () => {
    startFloor(waiting([A, B]))
    useApp.getState().finish(floor(false))
    expect(useApp.getState().screen).toBe('summary')
    expect(useApp.getState().summary!.duels).toEqual([])
    expect(useApp.getState().session).toBeNull()
  })

  it('do not start when no boss is waiting', () => {
    startFloor(emptyProgress())
    useApp.getState().finish(floor(true))
    expect(useApp.getState().screen).toBe('summary')
  })

  it('a fight started from the map still ends on its own summary', () => {
    const p = waiting([A, B])
    const session = buildBossSession({ id: pairId(A, B), a: A, b: B })!
    useApp.setState({ progress: p, screen: 'battle', summary: null, session })
    useApp.getState().finish(duelResult(A, B, true))
    const s = useApp.getState()
    expect(s.screen).toBe('summary')
    expect(s.summary!.outcome.boss).toMatchObject({ won: true })
    expect(s.summary!.duels).toEqual([])
  })
})

describe('fight all bosses', () => {
  const startAll = (progress: Progress) => {
    useApp.setState({ progress, screen: 'map', session: null, summary: null, pending: null, bossQueue: [], duels: [] })
    useApp.getState().startAllBosses()
  }

  it('fights every waiting boss, including older ones from other chapters, then one summary', () => {
    const p = waiting([A, B], [C, D], [X, Y])
    startAll(p)
    const seen: string[] = []
    while (useApp.getState().screen === 'battle') {
      const cur = useApp.getState().session!
      expect(cur).toMatchObject({ mode: 'boss', auto: true })
      const [q, r] = cur.pair!.map((c) => c.kanji)
      seen.push(pairId(q, r))
      useApp.getState().finish(duelResult(q, r, true))
    }
    const s = useApp.getState()
    expect(seen.sort()).toEqual([pairId(A, B), pairId(C, D), pairId(X, Y)].sort())
    expect(s.screen).toBe('summary')
    expect(s.summary!.duels).toHaveLength(3)
    expect(s.summary!.duels.every((d) => d.outcome.won && d.outcome.retired)).toBe(true)
    expect(s.pending).toBeNull()
    expect(s.bossQueue).toEqual([])
  })

  it('stops after a lost duel and leaves the rest waiting', () => {
    startAll(waiting([A, B], [C, D], [X, Y]))
    const [q, r] = useApp.getState().session!.pair!.map((c) => c.kanji)
    useApp.getState().finish(duelResult(q, r, false))
    const s = useApp.getState()
    expect(s.screen).toBe('summary')
    expect(s.summary!.duels).toHaveLength(1)
    expect(s.summary!.duels[0].outcome.won).toBe(false)
  })

  it('does nothing when no boss is waiting', () => {
    startAll(emptyProgress())
    expect(useApp.getState().screen).toBe('map')
    expect(useApp.getState().session).toBeNull()
  })
})

describe('pausing and resuming a chapter floor', () => {
  const save = (over: Partial<SavedFloor> = {}): SavedFloor => ({
    id: 'floor', sessionId: 'paused-1', chapterId: 'N5-1',
    queue: [{ kanji: A }, { kanji: B, study: true }, { kanji: C }],
    attempts: [{ kanji: D, correct: true, firstTry: true, ms: 1200, pos: 0 }],
    hp: 6, defeated: 4, xpGain: 90, elapsedMs: 45_000, savedAt: 1, ...over,
  })
  const reset = () => useApp.setState({
    progress: emptyProgress(), session: null, summary: null, saved: null, pending: null, bossQueue: [], duels: [], screen: 'map',
  })

  it('keeps the autosave when you leave for the map', () => {
    reset()
    useApp.getState().saveFloor(save())
    useApp.getState().exitToMap()
    const s = useApp.getState()
    expect(s.screen).toBe('map')
    expect(s.session).toBeNull()
    expect(s.saved).toMatchObject({ chapterId: 'N5-1', hp: 6 })
  })

  it('resumes the same floor: same session, the saved state attached', () => {
    reset()
    useApp.setState({ saved: save() })
    useApp.getState().resumeChapter()
    const s = useApp.getState()
    expect(s.screen).toBe('battle')
    expect(s.session).toMatchObject({ id: 'paused-1', mode: 'chapter', chapterId: 'N5-1' })
    expect(s.session!.resume).toMatchObject({ hp: 6, defeated: 4 })
    expect(s.session!.cards).toHaveLength(20)
  })

  it('starting the chapter over throws the paused floor away', () => {
    reset()
    useApp.setState({ saved: save() })
    useApp.getState().startChapter('N5-1')
    const s = useApp.getState()
    expect(s.saved).toBeNull()
    expect(s.session!.resume).toBeUndefined()
    expect(s.session!.id).not.toBe('paused-1')
  })

  it('finishing the floor, or losing it, clears the save', () => {
    reset()
    useApp.setState({ saved: save() })
    useApp.getState().startChapter('N5-1')
    useApp.setState({ saved: save() })
    useApp.getState().finish(floor(true))
    expect(useApp.getState().saved).toBeNull()
    reset()
    useApp.getState().startChapter('N5-1')
    useApp.setState({ saved: save() })
    useApp.getState().finish(floor(false))
    expect(useApp.getState().saved).toBeNull()
  })

  it('does nothing when there is nothing to resume', () => {
    reset()
    useApp.getState().resumeChapter()
    expect(useApp.getState().screen).toBe('map')
  })
})
