import { useCallback, useEffect, useRef, useState } from 'react'
import { backgroundURL } from '../art/backgrounds'
import { sfx } from '../audio/sfx'
import type { Card } from '../data/cards'
import { shuffle } from '../game/questions'
import { BOSS_STREAK } from '../progress/bosses'
import { answerXp } from '../progress/xp'
import type { Attempt, Session, SessionResult } from '../progress/types'
import { Hearts } from './Pixel'
import { Player, type PlayerState } from './Player'
import { Robot } from './Robot'

const HEARTS = 5
/** Left robot = D, right robot = K. */
const KEYS = ['d', 'k'] as const
/** How far the hero runs (% of stage width) to reach each robot. */
const DASH = [18, 52]
const FLOATER_X = [44, 78]
/** Pause after a hit so the blow lands before the robots swap places. */
const HIT_PAUSE_MS = 380
const FLASH_MS = 320
const INTRO_MS = 1700

interface Q {
  target: Card
  order: [Card, Card]
}

/** Ask about either kanji at random, but never the same one three times running. */
function nextQuestion(pair: [Card, Card], recent: string[]): Q {
  let target = pair[Math.random() < 0.5 ? 0 : 1]
  const last = recent.slice(-2)
  if (last.length === 2 && last[0] === last[1] && last[0] === target.kanji) {
    target = pair[0].kanji === target.kanji ? pair[1] : pair[0]
  }
  return { target, order: shuffle(pair) as [Card, Card] }
}

export function Duel({ session, onFinish }: { session: Session; onFinish: (r: SessionResult) => void }) {
  const pair = session.pair as [Card, Card]
  const recent = useRef<string[]>([])
  const [q, setQ] = useState<Q>(() => {
    const first = nextQuestion(pair, [])
    recent.current.push(first.target.kanji)
    return first
  })
  const [hp, setHp] = useState(HEARTS)
  const [streak, setStreak] = useState(0)
  const [reveal, setReveal] = useState<{ target: Card; chosen: Card } | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const [won, setWon] = useState(false)
  const [xpGain, setXpGain] = useState(0)
  const [intro, setIntro] = useState(!!session.auto)
  const [flash, setFlash] = useState<string | null>(null)
  const [player, setPlayer] = useState<{ state: PlayerState; seq: number; dash: number }>({ state: 'idle', seq: 0, dash: DASH[0] })
  const [floaters, setFloaters] = useState<{ id: number; text: string; x: number }[]>([])
  const attempts = useRef<Attempt[]>([])
  const startedAt = useRef(Date.now())
  const busy = useRef(!!session.auto)
  const finished = useRef(false)
  const sessionStart = useRef(Date.now())
  const seq = useRef(0)
  const stageRef = useRef<HTMLDivElement>(null)

  const shake = useCallback((px: number, ms: number) => {
    stageRef.current?.animate(
      [
        { transform: 'translate(0,0)' },
        { transform: `translate(${-px}px,${px / 2}px)` },
        { transform: `translate(${px}px,${-px / 2}px)` },
        { transform: 'translate(0,0)' },
      ],
      { duration: ms, easing: 'steps(4)' },
    )
  }, [])

  const finish = useCallback(
    (cleared: boolean, hpLeft: number) => {
      if (finished.current) return
      finished.current = true
      onFinish({
        sessionId: session.id,
        mode: 'boss',
        pair: [pair[0].kanji, pair[1].kanji],
        attempts: attempts.current,
        durationMs: Date.now() - sessionStart.current,
        hpLeft: Math.max(hpLeft, 0),
        maxHp: HEARTS,
        cleared,
      })
    },
    [onFinish, session.id, pair],
  )

  const answer = useCallback(
    (i: number) => {
      if (reveal || won || busy.current) return
      const chosen = q.order[i]
      const correct = chosen.kanji === q.target.kanji
      attempts.current.push({
        kanji: q.target.kanji,
        correct,
        firstTry: true,
        ms: Date.now() - startedAt.current,
        pos: attempts.current.length,
        mistakenFor: correct ? undefined : chosen.kanji,
      })
      const id = ++seq.current
      busy.current = true

      if (correct) {
        const s = streak + 1
        setStreak(s)
        setPlayer({ state: 'attack', seq: id, dash: DASH[i] })
        setFloaters((f) => [...f, { id, text: `${s}/${BOSS_STREAK}`, x: FLOATER_X[i] }])
        setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 1100)
        setTimeout(() => shake(6, 180), 90)
        sfx.hit(s)
        setXpGain((x) => x + answerXp(attempts.current[attempts.current.length - 1], streak))
        if (s >= BOSS_STREAK) {
          setWon(true)
          setTimeout(() => sfx.bossWin(), 200)
          setTimeout(() => finish(true, hp), 1600)
          return
        }
        setFlash(chosen.kanji)
        setTimeout(() => setFlash(null), FLASH_MS)
        setTimeout(() => {
          const next = nextQuestion(pair, recent.current)
          recent.current.push(next.target.kanji)
          setQ(next)
          startedAt.current = Date.now()
          busy.current = false
        }, HIT_PAUSE_MS)
      } else {
        setStreak(0)
        setHp((h) => h - 1)
        setPicked(i)
        setPlayer({ state: 'hurt', seq: id, dash: 0 })
        setReveal({ target: q.target, chosen })
        setTimeout(() => shake(12, 320), 200)
        sfx.miss()
        busy.current = false
      }
    },
    [reveal, won, q, streak, hp, pair, finish, shake],
  )

  // Automatic duels open with a short "boss appears" banner before any input is accepted.
  useEffect(() => {
    if (!session.auto) return
    sfx.bossAppear()
    const t = setTimeout(() => {
      setIntro(false)
      busy.current = false
      startedAt.current = Date.now()
    }, INTRO_MS)
    return () => clearTimeout(t)
  }, [session.auto])

  // D / K choose the left / right robot.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = KEYS.indexOf(e.key.toLowerCase() as (typeof KEYS)[number])
      if (i < 0) return
      e.preventDefault()
      if (!e.repeat) answer(i)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [answer])

  // Enter continues after a miss (attached a tick late so it can't fire on the same key press).
  const goOn = useCallback(() => {
    setReveal(null)
    setPicked(null)
    if (hp <= 0) return finish(false, 0)
    const next = nextQuestion(pair, recent.current)
    recent.current.push(next.target.kanji)
    setQ(next)
    startedAt.current = Date.now()
  }, [hp, pair, finish])

  useEffect(() => {
    if (!reveal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat) return
      e.preventDefault()
      goOn()
    }
    const t = setTimeout(() => window.addEventListener('keydown', onKey), 0)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [reveal, goOn])

  const correctIndex = q.order.findIndex((c) => c.kanji === q.target.kanji)

  return (
    <div className="screen battle duel">
      {reveal && <div className="miss-flash" key={seq.current} />}

      <header className="hud">
        <Hearts hp={hp} max={HEARTS} />
        <span className="pixel-text boss-tag">BOSS DUEL</span>
        <span className="pixel-text xp-tally">+{xpGain} XP</span>
        <button className="quit" onClick={() => finish(false, hp)}>QUIT</button>
      </header>

      <div className="stage-wrap">
        <div className="stage boss" ref={stageRef}>
          <img className="bg" src={backgroundURL(session.level)} alt="" draggable={false} />
          <div className="pips" aria-label={`${streak} of ${BOSS_STREAK} in a row`}>
            {Array.from({ length: BOSS_STREAK }, (_, i) => <i key={i} className={i < streak ? 'on' : ''} />)}
          </div>
          <Player key={`p${player.seq}`} state={player.state} dash={player.dash} />

          <div className="slot row duel">
            {q.order.map((card, i) => {
              let cls = 'duel'
              if (won) cls += ' explode'
              else if (flash === card.kanji) cls += ' struck'
              if (reveal) {
                if (i === picked) cls += ' wrong'
                if (i === correctIndex) cls += ' answer'
              }
              return <Robot key={card.kanji} card={card} className={cls} keyLabel={KEYS[i].toUpperCase()} burst={won} onPick={reveal || won ? undefined : () => answer(i)} />
            })}
          </div>

          {floaters.map((f) => (
            <div key={`f${f.id}`} className="floater" style={{ left: `${f.x}%` }}>{f.text}</div>
          ))}
          {won && <div className="combo-text boss-down">BOSS DOWN!</div>}
          {intro && (
            <div className="boss-intro">
              <div className="pixel-text">A BOSS APPEARS!</div>
              <div className="boss-intro-pair">
                <span className="kanji">{pair[0].kanji}</span>
                <i>vs</i>
                <span className="kanji">{pair[1].kanji}</span>
              </div>
              <div className="dim">you keep mixing these two up</div>
            </div>
          )}
        </div>
      </div>

      <div className="dialog">
        {reveal ? (
          <div className="reveal">
            <div className="duel-contrast">
              {q.order.map((c) => (
                <div key={c.kanji} className={c.kanji === reveal.target.kanji ? 'right' : ''}>
                  <span className="kanji">{c.kanji}</span>
                  <span>{c.meaning}</span>
                </div>
              ))}
            </div>
            <div className="hint">The answer for “{reveal.target.meaning}” is {reveal.target.kanji}. Streak reset.</div>
            <button className="continue blink" onClick={goOn}>PRESS ENTER</button>
          </div>
        ) : (
          <div className="ask">
            <div className="prompt">{q.target.meaning}</div>
            <div className="hint">tap a robot, or D = left · K = right — {BOSS_STREAK - streak} more in a row</div>
          </div>
        )}
      </div>
    </div>
  )
}
