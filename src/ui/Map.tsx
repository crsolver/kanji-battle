import { useMemo, useRef, useState } from 'react'
import { LEVEL_NAMES, backgroundURL } from '../art/backgrounds'
import { CARD_BY_KANJI, LEVELS } from '../data/cards'
import {
  CHAPTERS_BY_LEVEL, MIN_ACCURACY, MIN_REMEMBERED, chapterRemembered, chapterStatus, isPassed,
  isWorldUnlocked, unlockRequirement, type Chapter,
} from '../progress/chapters'
import { activeBosses } from '../progress/bosses'
import { dueCards } from '../progress/sessions'
import { useApp } from '../store/app'
import { levelInfo } from '../progress/xp'
import { liveStreak } from '../progress/streak'
import { Flame, Lock, Stars } from './Pixel'

const pct = (n: number) => `${Math.round(n * 100)}%`

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function MapScreen() {
  const { progress, world, setWorld, startChapter, startReview, startBoss, startAllBosses, saved, resumeChapter, goto, exportBackup, importBackup, resetAll } = useApp()
  const [picked, setPicked] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const due = useMemo(() => dueCards(progress, Date.now()).length, [progress])
  const allBosses = useMemo(() => activeBosses(progress), [progress])
  const bosses = allBosses.slice(0, 5)
  const lvl = levelInfo(progress.player.xp)
  const streak = liveStreak(progress.player.streak, Date.now())
  const chapters = CHAPTERS_BY_LEVEL[world]
  const passedCount = chapters.filter((c) => isPassed(progress, c)).length
  const selected: Chapter | undefined = chapters.find((c) => c.id === picked) ?? chapters.find((c) => c.id === saved?.chapterId) ?? chapters.find((c) => chapterStatus(progress, c) === 'available' || chapterStatus(progress, c) === 'cleared') ?? chapters[0]

  const onImport = async (file?: File) => {
    if (!file) return
    try {
      await importBackup(await file.text())
      setMessage('Backup restored.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not read that file.')
    }
  }

  return (
    <div className="screen map">
      <h1>KANJI<br />BATTLE</h1>

      <div className="player-bar" title="Level, XP and daily streak">
        <span className="pixel-text lv">LV {lvl.level}</span>
        <div className="xpbar" role="progressbar" aria-valuenow={lvl.into} aria-valuemax={lvl.need}>
          <i style={{ width: `${Math.round(lvl.pct * 100)}%` }} />
        </div>
        <span className="dim">{lvl.into} / {lvl.need} XP</span>
        <span className={`streak${streak ? '' : ' cold'}`} title={streak ? `${streak} day streak` : 'No streak yet: play today'}>
          <Flame lit={streak > 0} /> {streak}
        </span>
      </div>

      <div className="actions">
        <button onClick={startReview} disabled={!due} title={due ? '' : 'Nothing is due right now'}>
          DAILY REVIEW <span className="badge">{due}</span>
        </button>
        <button onClick={() => goto('collection')}>COLLECTION</button>
        <button onClick={() => goto('stats')}>STATS</button>
      </div>

      {bosses.length > 0 && (
        <section className="bosses dialog">
          <div className="boss-head">
            <div className="pixel-text boss-tag">BOSS WAITING</div>
            {allBosses.length > 1 && <button className="small" onClick={startAllBosses}>FIGHT ALL ({allBosses.length})</button>}
          </div>
          {allBosses.length > bosses.length && (
            <div className="dim">and {allBosses.length - bosses.length} more, worst first</div>
          )}
          {bosses.map((b) => (
            <div key={b.id} className="boss-row">
              <span className="boss-pair">
                <span className="kanji">{b.a}</span>
                <i>vs</i>
                <span className="kanji">{b.b}</span>
              </span>
              <span className="dim">{CARD_BY_KANJI.get(b.a)?.meaning} / {CARD_BY_KANJI.get(b.b)?.meaning} · mixed up {b.count}×</span>
              <button className="small" onClick={() => startBoss(b.id)}>FIGHT</button>
            </div>
          ))}
        </section>
      )}

      <div className="worlds">
        {LEVELS.map((l) => {
          const open = isWorldUnlocked(progress, l)
          const total = CHAPTERS_BY_LEVEL[l].length
          const passed = CHAPTERS_BY_LEVEL[l].filter((c) => isPassed(progress, c)).length
          return (
            <button
              key={l}
              className={`world${l === world ? ' current' : ''}${open ? '' : ' locked'}`}
              onClick={() => open && setWorld(l)}
              aria-disabled={!open}
              title={open ? '' : `Pass every ${LEVELS[LEVELS.indexOf(l) - 1]} chapter to open ${l}`}
            >
              <img src={backgroundURL(l)} alt="" draggable={false} />
              {!open && <Lock />}
              <span>{l}</span>
              <small>{LEVEL_NAMES[l]}</small>
              <em>{open ? `${passed}/${total} passed` : 'LOCKED'}</em>
            </button>
          )
        })}
      </div>

      <section className="dialog chapters">
        <h2 className="pixel-text">
          {world} · {LEVEL_NAMES[world]} <span className="dim">{passedCount}/{chapters.length} passed</span>
        </h2>
        <div className="nodes">
          {chapters.map((c) => {
            const status = chapterStatus(progress, c)
            const rec = progress.chapters[c.id]
            return (
              <button
                key={c.id}
                className={`node ${status}${selected?.id === c.id ? ' picked' : ''}`}
                onClick={() => setPicked(c.id)}
                aria-label={`Chapter ${c.index}, ${status}`}
              >
                <b>{c.index}</b>
                {status === 'locked' ? <Lock className="lock small" /> : <Stars n={rec?.stars ?? 0} />}
              </button>
            )
          })}
        </div>

        {selected && (() => {
          const status = chapterStatus(progress, selected)
          const need = unlockRequirement(progress, selected)
          const rec = progress.chapters[selected.id]
          return (
            <div className="detail">
              <div className="pixel-text">CHAPTER {selected.id}</div>
              <p>
                {selected.cards.length} kanji ·{' '}
                <span className="kanji">{selected.cards.slice(0, 8).map((c) => c.kanji).join('')}…</span>
              </p>
              {need ? (
                <p className="need"><Lock className="lock small" /> {need}</p>
              ) : (
                <>
                  <p className="dim">
                    Pass it with {pct(MIN_ACCURACY)} accuracy and {pct(MIN_REMEMBERED)} of its kanji remembered.
                    {' '}Remembered now: {pct(chapterRemembered(selected, progress))}
                    {rec ? ` · best accuracy ${pct(rec.bestAccuracy)}` : ''}
                  </p>
                  {saved?.chapterId === selected.id ? (
                    <div className="paused">
                      <p className="need">Paused: {saved.queue.length} questions left, {saved.hp} hearts.</p>
                      <div className="actions">
                        <button onClick={resumeChapter}>RESUME</button>
                        <button className="small" onClick={() => startChapter(selected.id)}>START OVER</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        if (saved && !window.confirm(`This will throw away your paused floor in ${saved.chapterId}. Continue?`)) return
                        startChapter(selected.id)
                      }}
                    >
                      {status === 'passed' ? 'PLAY AGAIN' : status === 'cleared' ? 'PRACTISE' : 'PLAY'}
                    </button>
                  )}
                </>
              )}
            </div>
          )
        })()}
      </section>

      <footer className="data-tools">
        <button className="small" onClick={async () => download('kanji-battle-backup.json', await exportBackup())}>EXPORT</button>
        <button className="small" onClick={() => fileRef.current?.click()}>IMPORT</button>
        <button
          className="small danger"
          onClick={() => window.confirm('Erase all progress? This cannot be undone.') && resetAll()}
        >
          RESET
        </button>
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => onImport(e.target.files?.[0])} />
        {message && <span className="dim">{message}</span>}
      </footer>
    </div>
  )
}
