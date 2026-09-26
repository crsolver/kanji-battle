import { useEffect } from 'react'
import { sfx } from '../audio/sfx'
import { CARD_BY_KANJI } from '../data/cards'
import { BOSS_STREAK, BOSS_WINS_TO_RETIRE, activeBosses } from '../progress/bosses'
import { CHAPTER_BY_ID, MIN_ACCURACY, MIN_REMEMBERED } from '../progress/chapters'
import { useApp } from '../store/app'
import { Stars } from './Pixel'
import { XpBlock } from './XpBlock'

const pct = (n: number) => `${Math.round(n * 100)}%`
const meaningOf = (k: string) => CARD_BY_KANJI.get(k)?.meaning ?? ''

function Stat({ label, value, need, ok }: { label: string; value: string; need?: string; ok?: boolean }) {
  return (
    <div className={`stat${ok === undefined ? '' : ok ? ' ok' : ' bad'}`}>
      <span>{label}</span>
      <b>{value}</b>
      {need && <small>{ok ? 'OK' : `need ${need}`}</small>}
    </div>
  )
}

export function SummaryScreen() {
  const { summary, progress, goto, startChapter, startReview, startBoss, startAllBosses } = useApp()

  // One jingle for how it went, then a flourish for anything newly unlocked.
  useEffect(() => {
    if (!summary) return
    const { outcome, result } = summary
    const ok = outcome.boss ? outcome.boss.won : outcome.chapter ? outcome.chapter.cleared : result.hpLeft > 0
    // A won duel already played its fanfare on the killing blow.
    if (!outcome.boss?.won) (ok ? sfx.pass : sfx.fail)()
    const timers: ReturnType<typeof setTimeout>[] = []
    if (outcome.newlyUnlockedChapters.length || outcome.newlyUnlockedWorlds.length) timers.push(setTimeout(sfx.unlock, 900))
    if (outcome.newBosses.length) timers.push(setTimeout(sfx.bossAppear, 1300))
    if (outcome.xp.levelAfter > outcome.xp.levelBefore) timers.push(setTimeout(sfx.levelUp, 700))
    return () => timers.forEach(clearTimeout)
  }, [summary])

  if (!summary) return null
  const { result, outcome, session } = summary
  const ch = outcome.chapter
  const boss = outcome.boss
  const graded = result.attempts.filter((a) => !a.study)
  const defeated = graded.filter((a) => a.correct).length
  const firstTries = graded.filter((a) => a.firstTry)
  const firstRight = firstTries.filter((a) => a.correct).length
  const dead = result.hpLeft <= 0
  const duels = summary.duels ?? []
  // A FIGHT ALL run: several duels in a row and no floor.
  const rush = !!boss && duels.length > 1
  const remaining = activeBosses(progress).length

  let title = 'DONE'
  let tone = ''
  if (rush) {
    if (duels.every((d) => d.outcome.won)) title = 'ALL BOSSES DOWN!'
    else [title, tone] = ['BOSS RUSH OVER', 'warn']
  } else if (boss) {
    if (boss.won) title = boss.retired ? 'BOSS RETIRED!' : 'BOSS DEFEATED!'
    else [title, tone] = [dead ? 'BOSS WINS' : 'DUEL ABANDONED', 'bad']
  } else if (session.mode === 'chapter' && ch) {
    if (!ch.cleared) [title, tone] = [dead ? 'DEFEATED' : 'FLOOR ABANDONED', 'bad']
    else if (ch.passed && !ch.wasPassed) title = 'CHAPTER PASSED!'
    else if (ch.passed) title = 'CLEARED AGAIN'
    else [title, tone] = ['ALMOST THERE', 'warn']
  } else if (dead) {
    ;[title, tone] = ['DEFEATED', 'bad']
  } else {
    title = session.mode === 'review' ? 'REVIEW DONE' : 'DRILL DONE'
  }

  const nextChapter = outcome.newlyUnlockedChapters.find(
    (id) => CHAPTER_BY_ID.get(id)?.level === CHAPTER_BY_ID.get(ch?.id ?? '')?.level,
  )
  // New bosses are announced here only if they were not already fought automatically.
  const newBoss = duels.length ? undefined : outcome.newBosses[0]?.split('|')
  const [ba, bb] = result.pair ?? ['', '']

  return (
    <div className="screen title summary">
      <h1 className={tone}>{title}</h1>

      {boss && !rush && (
        <>
          <p className="pixel-text boss-line">
            <span className="kanji">{ba}</span> vs <span className="kanji">{bb}</span>
          </p>
          <p className="hint">
            {meaningOf(ba)} / {meaningOf(bb)}
          </p>
          <div className="stats">
            <Stat label="DUEL WINS" value={`${boss.wins}/${BOSS_WINS_TO_RETIRE}`} />
            <Stat label="HEARTS LEFT" value={`${result.hpLeft}/${result.maxHp}`} />
          </div>
          <p className="hint">
            {boss.retired
              ? `You can tell these two apart now. It comes back only if you start mixing them up again.`
              : boss.won
                ? `One more win and this pair retires.`
                : `Get ${BOSS_STREAK} in a row to win. Any miss resets the streak.`}
          </p>
        </>
      )}

      {ch && (
        <>
          <p className="pixel-text">CHAPTER {ch.id}</p>
          <Stars n={ch.stars} />
          <div className="stats">
            <Stat label="ACCURACY" value={pct(ch.accuracy)} need={pct(MIN_ACCURACY)} ok={ch.accuracy >= MIN_ACCURACY} />
            <Stat label="REMEMBERED" value={pct(ch.remembered)} need={pct(MIN_REMEMBERED)} ok={ch.remembered >= MIN_REMEMBERED} />
          </div>
          {ch.cleared && !ch.passed && (
            <p className="hint">
              {ch.accuracy < MIN_ACCURACY
                ? 'Too many first-try misses. Play it again and aim for 80% right on the first go.'
                : 'Some kanji are not sticking yet. Practise the chapter again.'}
            </p>
          )}
        </>
      )}

      {!ch && !boss && (
        <div className="stats">
          <Stat label="FIRST TRY" value={`${firstRight}/${firstTries.length}`} />
          <Stat label="DEFEATED" value={String(defeated)} />
        </div>
      )}

      {!boss && (
        <div className="stats">
          <Stat label="HEARTS LEFT" value={`${result.hpLeft}/${result.maxHp}`} />
          <Stat label="NEW KANJI" value={String(outcome.newKanji)} />
        </div>
      )}

      <XpBlock xp={outcome.xp} />

      {outcome.newlyUnlockedWorlds.length > 0 && (
        <p className="unlock">NEW WORLD OPEN: {outcome.newlyUnlockedWorlds.join(', ')}</p>
      )}
      {outcome.newlyUnlockedChapters.length > 0 && (
        <p className="unlock">UNLOCKED: {outcome.newlyUnlockedChapters.join(', ')}</p>
      )}
      {newBoss && (
        <p className="unlock boss-line">
          A BOSS APPEARED: <span className="kanji">{newBoss[0]}</span> vs <span className="kanji">{newBoss[1]}</span>
        </p>
      )}

      {duels.length > 0 && (
        <div className="mixups">
          <div className="pixel-text">BOSS DUELS</div>
          {duels.map((d) => (
            <span key={d.outcome.id} className={`pair duel-result ${d.outcome.won ? 'won' : 'lost'}`}>
              <span className="kanji">{d.pair[0]}</span> vs <span className="kanji">{d.pair[1]}</span>
              <i>{d.outcome.won ? (d.outcome.retired ? 'RETIRED' : `WON ${d.outcome.wins}/${BOSS_WINS_TO_RETIRE}`) : 'LOST'}</i>
            </span>
          ))}
        </div>
      )}

      {!boss && outcome.pairs.length > 0 && (
        <div className="mixups">
          <div className="pixel-text">MIXED UP</div>
          {outcome.pairs.map(([a, b]) => (
            <span key={a + b} className="pair">
              <span className="kanji">{a}</span> {meaningOf(a)}
              <i> ≠ </i>
              <span className="kanji">{b}</span> {meaningOf(b)}
            </span>
          ))}
        </div>
      )}

      <div className="actions">
        {newBoss && <button onClick={() => startBoss(outcome.newBosses[0])}>FIGHT THE BOSS</button>}
        {boss && remaining > 0 && (rush || boss.retired) && <button onClick={startAllBosses}>FIGHT ALL ({remaining})</button>}
        {boss && !rush && !boss.retired && <button onClick={() => startBoss(boss.id)}>{boss.won ? 'FIGHT AGAIN' : 'REMATCH'}</button>}
        {nextChapter && <button onClick={() => startChapter(nextChapter)}>NEXT CHAPTER</button>}
        {ch && !ch.passed && <button onClick={() => startChapter(ch.id)}>TRY AGAIN</button>}
        {session.mode === 'review' && !dead && <button onClick={startReview}>MORE REVIEW</button>}
        <button onClick={() => goto('map')}>MAP</button>
      </div>
    </div>
  )
}
