import Dexie, { type Table } from 'dexie'
import type { Changes } from '../progress/applyResults'
import { emptyPlayer, type SavedFloor, type BossRecord, type CardState, type ChapterRecord, type Confusion, type DayRecord, type PlayerState, type Progress } from '../progress/types'

/** The player's single row in the `player` table. */
type PlayerRow = PlayerState & { id: 'me' }

class KanjiDB extends Dexie {
  cards!: Table<CardState, string>
  chapters!: Table<ChapterRecord, string>
  confusions!: Table<Confusion, string>
  bosses!: Table<BossRecord, string>
  player!: Table<PlayerRow, string>
  days!: Table<DayRecord, string>
  saves!: Table<SavedFloor, string>

  constructor() {
    super('kanji-battle')
    this.version(1).stores({
      cards: 'kanji, due',
      chapters: 'id',
      confusions: 'id',
    })
    this.version(2).stores({ bosses: 'id' })
    this.version(3).stores({ player: 'id', days: 'date' })
    this.version(4).stores({ saves: 'id' })
  }
}

export const db = new KanjiDB()

const byKey = <T>(rows: T[], key: (r: T) => string): Record<string, T> =>
  Object.fromEntries(rows.map((r) => [key(r), r]))

export async function loadProgress(): Promise<Progress> {
  const [cards, chapters, confusions, bosses, playerRow, days] = await Promise.all([
    db.cards.toArray(),
    db.chapters.toArray(),
    db.confusions.toArray(),
    db.bosses.toArray(),
    db.player.get('me'),
    db.days.toArray(),
  ])
  const { id: _id, ...player } = playerRow ?? { id: 'me' as const, ...emptyPlayer() }
  return {
    cards: byKey(cards, (c) => c.kanji),
    chapters: byKey(chapters, (c) => c.id),
    confusions: byKey(confusions, (c) => c.id),
    bosses: byKey(bosses, (b) => b.id),
    player,
    days: byKey(days, (d) => d.date),
  }
}

export const loadSave = (): Promise<SavedFloor | undefined> => db.saves.get('floor')
export const writeSave = (s: SavedFloor) => db.saves.put(s)
export const deleteSave = () => db.saves.delete('floor')

export async function persist(changes: Changes): Promise<void> {
  await db.transaction('rw', [db.cards, db.chapters, db.confusions, db.bosses, db.player, db.days], async () => {
    if (changes.player) await db.player.put({ id: 'me', ...changes.player })
    await db.days.bulkPut(changes.days)
    await db.cards.bulkPut(changes.cards)
    await db.chapters.bulkPut(changes.chapters)
    await db.confusions.bulkPut(changes.confusions)
    await db.bosses.bulkPut(changes.bosses)
  })
}

export async function replaceProgress(p: Progress): Promise<void> {
  await db.transaction('rw', [db.cards, db.chapters, db.confusions, db.bosses, db.player, db.days, db.saves], async () => {
    await Promise.all([db.cards.clear(), db.chapters.clear(), db.confusions.clear(), db.bosses.clear(), db.player.clear(), db.days.clear(), db.saves.clear()])
    await db.player.put({ id: 'me', ...p.player })
    await db.days.bulkPut(Object.values(p.days))
    await db.cards.bulkPut(Object.values(p.cards))
    await db.chapters.bulkPut(Object.values(p.chapters))
    await db.confusions.bulkPut(Object.values(p.confusions))
    await db.bosses.bulkPut(Object.values(p.bosses))
  })
}

export const exportProgress = async (): Promise<string> =>
  JSON.stringify({ app: 'kanji-battle', version: 1, progress: await loadProgress() }, null, 2)

/** Parse a backup file. Throws with a readable message when it is not one. */
export function parseBackup(json: string): Progress {
  const data = JSON.parse(json)
  const p = data?.progress
  if (data?.app !== 'kanji-battle' || !p || typeof p.cards !== 'object' || typeof p.chapters !== 'object') {
    throw new Error('This is not a Kanji Battle backup file.')
  }
  // Backups made before XP existed have no player or days: start those fresh.
  return {
    cards: p.cards,
    chapters: p.chapters,
    confusions: p.confusions ?? {},
    bosses: p.bosses ?? {},
    player: { ...emptyPlayer(), ...(p.player ?? {}) },
    days: p.days ?? {},
  }
}
