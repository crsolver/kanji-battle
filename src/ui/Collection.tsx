import { useMemo, useState } from 'react'
import { LEVELS } from '../data/cards'
import { CHAPTERS_BY_LEVEL } from '../progress/chapters'
import {
  buildRows, collectionStats, defaultFilters, filterRows, formatDue, type Filters, type SortKey,
} from '../progress/collection'
import { PRACTICE_LIMIT } from '../progress/sessions'
import type { CardStatus } from '../progress/status'
import { useApp } from '../store/app'

const PAGE = 150
const STATUSES: CardStatus[] = ['new', 'learning', 'reviewing', 'mastered']

export function CollectionScreen() {
  const { progress, goto, startPractice } = useApp()
  const [f, setF] = useState<Filters>(defaultFilters)
  const [shown, setShown] = useState(PAGE)
  const now = Date.now()
  const rows = useMemo(() => buildRows(progress), [progress])
  const stats = useMemo(() => collectionStats(rows, now), [rows, now])
  const list = useMemo(() => filterRows(rows, f, now), [rows, f, now])

  const set = (patch: Partial<Filters>) => {
    setF((old) => ({ ...old, ...patch }))
    setShown(PAGE)
  }
  const chapters = f.level === 'all' ? [] : CHAPTERS_BY_LEVEL[f.level]
  const drillable = list.filter((r) => r.state)

  return (
    <div className="screen collection">
      <header className="col-head">
        <button className="small" onClick={() => goto('map')}>‹ MAP</button>
        <h1>COLLECTION</h1>
      </header>

      <div className="col-stats">
        <span><b>{stats.seen}</b> / {stats.total} seen</span>
        <span><b>{stats.dueToday}</b> due</span>
        <span><b>{stats.leeches}</b> leeches</span>
        <span><b>{stats.mastered}</b> mastered</span>
      </div>

      <div className="filters dialog">
        <input
          className="search"
          placeholder="search kanji or meaning…"
          value={f.query}
          onChange={(e) => set({ query: e.target.value })}
        />
        <select value={f.level} onChange={(e) => set({ level: e.target.value as Filters['level'], chapter: 'all' })}>
          <option value="all">all levels</option>
          {LEVELS.map((l) => <option key={l}>{l}</option>)}
        </select>
        <select value={f.chapter} disabled={!chapters.length} onChange={(e) => set({ chapter: e.target.value })}>
          <option value="all">all chapters</option>
          {chapters.map((c) => <option key={c.id} value={c.id}>{c.id}</option>)}
        </select>
        <select value={f.status} onChange={(e) => set({ status: e.target.value as Filters['status'] })}>
          <option value="all">any status</option>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={f.sort} onChange={(e) => set({ sort: e.target.value as SortKey })}>
          <option value="due">sort: next due</option>
          <option value="lapses">sort: most lapses</option>
          <option value="recent">sort: recently seen</option>
          <option value="order">sort: book order</option>
        </select>
        <label><input type="checkbox" checked={f.dueOnly} onChange={(e) => set({ dueOnly: e.target.checked })} /> due</label>
        <label><input type="checkbox" checked={f.leechOnly} onChange={(e) => set({ leechOnly: e.target.checked })} /> leeches</label>
        <label><input type="checkbox" checked={f.confusedOnly} onChange={(e) => set({ confusedOnly: e.target.checked })} /> mixed up</label>
        <label><input type="checkbox" checked={f.showUnseen} onChange={(e) => set({ showUnseen: e.target.checked })} /> show unseen</label>
      </div>

      <div className="col-bar">
        <span className="dim">{list.length} kanji</span>
        <button
          disabled={!drillable.length}
          onClick={() => startPractice(drillable.map((r) => r.card))}
          title={`Drills the first ${PRACTICE_LIMIT}`}
        >
          DRILL {Math.min(drillable.length, PRACTICE_LIMIT)}
        </button>
      </div>

      {list.length === 0 ? (
        <p className="empty dim">
          {stats.seen === 0 ? 'No kanji yet. Play a chapter and they will show up here.' : 'No kanji match these filters.'}
        </p>
      ) : (
        <table className="cards">
          <thead>
            <tr><th /><th>meaning</th><th>chapter</th><th>status</th><th>due</th><th>lapses</th><th>right</th><th>mixed up with</th></tr>
          </thead>
          <tbody>
            {list.slice(0, shown).map((r) => (
              <tr key={r.card.kanji} className={r.state ? '' : 'unseen'}>
                <td className="k kanji">{r.card.kanji}</td>
                <td>{r.card.meaning}</td>
                <td>{r.chapterId}</td>
                <td><span className={`pill ${r.status}${r.leech ? ' leech' : ''}`}>{r.leech ? 'leech' : r.status}</span></td>
                <td>{formatDue(r.due, now)}</td>
                <td>{r.state ? r.state.lapses : '-'}</td>
                <td>{r.accuracy === null ? '-' : `${Math.round(r.accuracy * 100)}%`}</td>
                <td className="kanji">{r.confusedWith.join(' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {list.length > shown && <button className="small" onClick={() => setShown((n) => n + PAGE)}>SHOW MORE</button>}
    </div>
  )
}
