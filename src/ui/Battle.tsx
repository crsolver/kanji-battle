import { useCallback, useEffect, useRef, useState } from 'react'
import { backgroundURL } from '../art/backgrounds'
import { sfx } from '../audio/sfx'
import { XP, answerXp } from '../progress/xp'
import { ALL_CARDS, type Card } from '../data/cards'
import { judge, mistakenFor } from '../game/answerMatch'
import { buildQueue, type QueueItem } from '../game/floor'
import { PICK_KEYS, makeQuestion, type Question } from '../game/questions'
import { CARD_BY_KANJI } from '../data/cards'
import type { Attempt, SavedFloor, Session, SessionResult } from '../progress/types'
import { Hearts } from './Pixel'
import { Player, type PlayerState } from './Player'
import { Robot } from './Robot'

/** Chapter floors are long and gate progress, so they get more hearts. */
const heartsFor = (mode: Session['mode']) => (mode === 'chapter' ? 8 : 5)
const HIT_MS = 300
const ENTER_DELAY_S = 0.18
const TYPE_DASH = 46
/** How far the hero runs (in % of stage width) to reach each of the 4 tiles. */
const PICK_DASH = [20, 37, 54, 71]
const PICK_X = [30, 47, 64, 81]

interface Reveal {
  card: Card
  mistaken?: Card
}

interface Dying {
  id: number
  question: Question
  correctIndex: number
}

const correctIndexOf = (q: Question) =>
  q.kind === 'pick' ? q.options.findIndex((o) => o.kanji === q.card.kanji) : 0

function Enemies({
  question,
  phase,
  picked = null,
  showAnswer = false,
  lunge = false,
  onPick,
}: {
  question: Question
  phase: 'live' | 'dying'
  picked?: number | null
  showAnswer?: boolean
  lunge?: boolean
  onPick?: (i: number) => void
}) {
  const correct = correctIndexOf(question)
  if (question.kind !== 'pick') {
    return (
      <div className={`slot single ${phase}`}>
        <Robot
          card={question.card}
          className={phase === 'dying' ? 'explode' : lunge ? 'lunge' : ''}
          burst={phase === 'dying'}
        />
      </div>
    )
  }
  return (
    <div className={`slot row ${phase}`}>
      {question.options.map((o, i) => {
        let cls = ''
        if (phase === 'dying') cls = i === correct ? 'explode' : 'vanish'
        else {
          if (i === picked) cls += ' wrong'
          if (showAnswer && i === correct) cls += ' answer'
        }
        return (
          <Robot
            key={o.kanji}
            card={o}
            mini
            className={cls}
            keyLabel={PICK_KEYS[i].toUpperCase()}
            onPick={phase === 'live' && onPick ? () => onPick(i) : undefined}
            burst={phase === 'dying' && i === correct}
          />
        )
      })}
    </div>
  )
}

export function Battle({
  session,
  partnersOf,
  onFinish,
  onSave,
  onExit,
}: {
  session: Session
  /** Kanji this one has been mistaken for (or mistaken for it) before. */
  partnersOf: (kanji: string) => Card[]
  onFinish: (result: SessionResult) => void
  /** Autosave a chapter floor after every answer so it can be resumed later. */
  onSave: (floor: SavedFloor) => void
  /** Leave for the map, keeping the autosave. */
  onExit: () => void
}) {
  const resume = session.resume
  const [queue, setQueue] = useState<QueueItem[]>(() =>
    resume
      ? resume.queue.flatMap((q) => {
          const card = CARD_BY_KANJI.get(q.kanji)
          return card ? [{ card, study: q.study }] : []
        })
      : buildQueue(session.cards, session.rounds, session.newKanji),
  )
  const [nudge, setNudge] = useState(0)
  const [question, setQuestion] = useState<Question | null>(null)
  const [qid, setQid] = useState(0)
  const [input, setInput] = useState('')
  const MAX_HP = heartsFor(session.mode)
  const [hp, setHp] = useState(resume?.hp ?? MAX_HP)
  const [combo, setCombo] = useState(0)
  const [defeated, setDefeated] = useState(resume?.defeated ?? 0)
  const [hit, setHit] = useState(false)
  const [xpGain, setXpGain] = useState(resume?.xpGain ?? 0)
  const [reveal, setReveal] = useState<Reveal | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const [player, setPlayer] = useState<{ state: PlayerState; seq: number; dash: number }>({
    state: 'idle', seq: 0, dash: TYPE_DASH,
  })
  const [dying, setDying] = useState<Dying | null>(null)
  const [floaters, setFloaters] = useState<{ id: number; text: string; x: number }[]>([])
  const [enterDelay, setEnterDelay] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const seq = useRef(0)
  const attempts = useRef<Attempt[]>(resume ? [...resume.attempts] : [])
  const tried = useRef(new Set<string>(resume ? resume.attempts.filter((a) => !a.study).map((a) => a.kanji) : []))
  const startedAt = useRef(0)
  const finished = useRef(false)
  const sessionStart = useRef(Date.now() - (resume?.elapsedMs ?? 0))

  const outOfHp = hp <= 0
  const cleared = queue.length === 0 && !question

  const shake = useCallback((px: number, ms: number) => {
    stageRef.current?.animate(
      [
        { transform: 'translate(0,0)' },
        { transform: `translate(${-px}px,${px / 2}px)` },
        { transform: `translate(${px}px,${-px / 2}px)` },
        { transform: `translate(${-px / 2}px,${px / 3}px)` },
        { transform: 'translate(0,0)' },
      ],
      { duration: ms, easing: 'steps(5)' },
    )
  }, [])

  const next = useCallback(
    (q: QueueItem[]) => {
      if (q.length === 0) return setQuestion(null)
      const item = q[0]
      setQuestion(item.study ? { kind: 'study', card: item.card } : makeQuestion(item.card, session.distractors, partnersOf(item.card.kanji)))
      setQid((n) => n + 1)
      setQueue(q.slice(1))
      setInput('')
      startedAt.current = Date.now()
    },
    [session, partnersOf],
  )

  const record = useCallback((card: Card, correct: boolean, mistaken?: Card, study = false) => {
    // A study card is not a test: it never uses up the kanji's first try.
    const firstTry = !study && !tried.current.has(card.kanji)
    if (!study) tried.current.add(card.kanji)
    attempts.current.push({
      kanji: card.kanji,
      correct,
      firstTry,
      study: study || undefined,
      ms: Date.now() - startedAt.current,
      pos: attempts.current.length,
      mistakenFor: mistaken?.kanji,
    })
  }, [])

  const finish = useCallback(
    (cleared: boolean) => {
      if (finished.current) return
      finished.current = true
      onFinish({
        sessionId: session.id,
        mode: session.mode,
        chapterId: session.chapterId,
        attempts: attempts.current,
        durationMs: Date.now() - sessionStart.current,
        hpLeft: Math.max(hp, 0),
        maxHp: MAX_HP,
        cleared,
      })
    },
    [onFinish, session, hp, MAX_HP],
  )

  // Autosave a chapter floor after each answer, so closing the tab loses nothing.
  useEffect(() => {
    if (session.mode !== 'chapter' || !question || finished.current || hp <= 0) return
    onSave({
      id: 'floor',
      sessionId: session.id,
      chapterId: session.chapterId!,
      queue: [
        { kanji: question.card.kanji, study: question.kind === 'study' || undefined },
        ...queue.map((i) => ({ kanji: i.card.kanji, study: i.study })),
      ],
      attempts: attempts.current,
      hp,
      defeated,
      xpGain,
      elapsedMs: Date.now() - sessionStart.current,
      savedAt: Date.now(),
    })
  }, [qid, hp]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!question && queue.length) next(queue)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cleared || outOfHp) return
    const t = setTimeout(() => finish(true), 900)
    return () => clearTimeout(t)
  }, [cleared, outOfHp, finish])

  /** Finishing a free study card: the robot goes down, but no combo, XP or KO is earned. */
  const studyDone = useCallback(() => {
    if (!question) return
    const id = ++seq.current
    record(question.card, true, undefined, true)
    sfx.select()
    sfx.explode()
    setPlayer({ state: 'attack', seq: id, dash: TYPE_DASH })
    setDying({ id, question, correctIndex: 0 })
    setTimeout(() => setDying((d) => (d?.id === id ? null : d)), 900)
    setTimeout(() => shake(5, 160), 90)
    setEnterDelay(ENTER_DELAY_S)
    next(queue)
  }, [question, next, queue, shake, record])

  const win = useCallback(() => {
    if (!question) return
    const id = ++seq.current
    const idx = correctIndexOf(question)
    const dmg = 10 + combo * 5
    record(question.card, true)
    sfx.hit(combo)
    setXpGain((x) => x + answerXp(attempts.current[attempts.current.length - 1], combo) * (session.mode === 'practice' ? XP.practiceFactor : 1))
    sfx.explode()
    if ((combo + 1) % 5 === 0) setTimeout(sfx.combo, 260)

    setPlayer({ state: 'attack', seq: id, dash: question.kind === 'pick' ? PICK_DASH[idx] : TYPE_DASH })
    setDying({ id, question, correctIndex: idx })
    setTimeout(() => setDying((d) => (d?.id === id ? null : d)), 900)
    setFloaters((f) => [...f, { id, text: `-${dmg}`, x: question.kind === 'pick' ? PICK_X[idx] : 72 }])
    setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 1100)
    setTimeout(() => shake(7, 200), 90)

    setCombo((c) => c + 1)
    setDefeated((d) => d + 1)
    setHit(true)
    setTimeout(() => setHit(false), HIT_MS + 90)
    setEnterDelay(ENTER_DELAY_S)
    next(queue)
  }, [question, combo, next, queue, shake, record])

  const lose = useCallback(
    (card: Card, mistaken?: Card, pickedIndex?: number) => {
      const id = ++seq.current
      record(card, false, mistaken)
      sfx.miss()
      setPlayer({ state: 'hurt', seq: id, dash: 0 })
      setPicked(pickedIndex ?? null)
      setTimeout(() => shake(14, 360), 200)
      setCombo(0)
      setHp((h) => h - 1)
      setReveal({ card, mistaken })
      setQueue((q) => [...q, { card }]) // it comes back later in the run
    },
    [shake, record],
  )

  const answerTyped = useCallback(
    (card: Card, text: string) => {
      // Compare against every kanji, not just this floor: the one you confused
      // it with can be from any level.
      const result = judge(text, card, ALL_CARDS)
      if (result !== 'wrong') return win()
      lose(card, mistakenFor(text, card, ALL_CARDS))
    },
    [win, lose],
  )

  // A study card takes the meaning typed in (or Enter on an empty box to skip). A slip costs nothing.
  const answerStudy = useCallback(
    (card: Card, text: string) => {
      if (!text.trim() || judge(text, card, ALL_CARDS) !== 'wrong') return studyDone()
      setNudge((n) => n + 1)
    },
    [studyDone],
  )

  const pickTile = useCallback(
    (i: number) => {
      if (question?.kind !== 'pick' || reveal || !question.options[i]) return
      const chosen = question.options[i]
      if (chosen.kanji === question.card.kanji) win()
      else lose(question.card, chosen, i)
    },
    [question, reveal, win, lose],
  )

  // Tile keys (D F J K) for meaning -> kanji questions.
  useEffect(() => {
    if (question?.kind !== 'pick' || reveal) return
    const onKey = (e: KeyboardEvent) => {
      const i = PICK_KEYS.indexOf(e.key.toLowerCase() as (typeof PICK_KEYS)[number])
      if (i < 0 || !question.options[i]) return
      // Stop the key from being typed into the next question's input.
      e.preventDefault()
      if (e.repeat) return
      pickTile(i)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [question, reveal, pickTile])

  // Enter continues after a wrong answer. The listener is attached a tick late
  // so the Enter that submitted the wrong answer can't also dismiss the reveal.
  const goOn = useCallback(() => {
    setReveal(null)
    setPicked(null)
    setEnterDelay(0)
    if (hp <= 0) return finish(false)
    next(queue)
  }, [next, queue, hp, finish])

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

  useEffect(() => {
    if (!reveal && (question?.kind === 'type' || question?.kind === 'study')) inputRef.current?.focus()
  }, [question, reveal])

  const left = queue.length + (question ? 1 : 0)

  return (
    <div className="screen battle">
      {reveal && <div className="miss-flash" key={seq.current} />}
      {hit && !reveal && <div className="hit-flash" key={defeated} />}

      <header className="hud">
        <Hearts hp={hp} max={MAX_HP} />
        <span className="pixel-text">KO {defeated}</span>
        <span className="pixel-text xp-tally">+{Math.round(xpGain)} XP</span>
        <span className="pixel-text">LEFT {left}</span>
        {session.mode === 'chapter' ? (
          <button className="quit" onClick={onExit} title="Your place is saved. Resume from the map.">SAVE &amp; EXIT</button>
        ) : (
          <button className="quit" onClick={() => finish(false)}>QUIT</button>
        )}
      </header>

      <div className="stage-wrap">
        <div className="stage" ref={stageRef}>
          <img className="bg" src={backgroundURL(session.level)} alt="" draggable={false} />
          <Player key={`p${player.seq}`}state={player.state} dash={player.dash} />

          {dying && <Enemies key={`d${dying.id}`} question={dying.question} phase="dying" />}
          {question && (
            <div
              key={`q${qid}`}
              className="live-wrap"
              style={{ '--delay': `${enterDelay}s` } as React.CSSProperties}
            >
              <Enemies
                question={question}
                phase="live"
                picked={picked}
                showAnswer={!!reveal}
                lunge={!!reveal && question.kind === 'type'}
                onPick={reveal ? undefined : pickTile}
              />
            </div>
          )}

          {floaters.map((f) => (
            <div key={`f${f.id}`} className="floater" style={{ left: `${f.x}%` }}>
              {f.text}
            </div>
          ))}

          {combo >= 2 && !reveal && (
            <div
              key={`c${combo}`}
              className="combo-text"
              style={{ fontSize: `calc(var(--u) * ${Math.min(1.6 + combo * 0.12, 3.4)})` }}
            >
              {combo} COMBO!
            </div>
          )}
        </div>
      </div>

      <div className="dialog">
        {reveal ? (
          <div className="reveal">
            <div className="answer">{reveal.card.meaning}</div>
            <div className="readings">
              <span className="kanji">{reveal.card.kanji}</span> · {[...reveal.card.onyomi, ...reveal.card.kunyomi].join(' · ')}
            </div>
            {reveal.mistaken && (
              <div className="contrast">
                You mixed it up with <span className="kanji">{reveal.mistaken.kanji}</span> ={' '}
                {reveal.mistaken.meaning}
              </div>
            )}
            <button className="continue blink" onClick={goOn}>PRESS ENTER</button>
          </div>
        ) : question?.kind === 'study' ? (
          <div className="ask study">
            <div className="pixel-text study-tag">NEW KANJI</div>
            <div className="prompt">{question.card.meaning}</div>
            <div className="readings">
              <span className="kanji">{question.card.kanji}</span> · {[...question.card.onyomi, ...question.card.kunyomi].join(' · ')}
            </div>
            <input
              key={nudge}
              ref={inputRef}
              className={nudge ? 'nudge' : ''}
              value={input}
              autoFocus
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={`type “${question.card.meaning}” to continue`}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') answerStudy(question.card, input)
              }}
            />
            <div className="hint">Not a test yet: just learn it. Enter on an empty box skips.</div>
          </div>
        ) : question?.kind === 'type' ? (
          <div className="ask">
            {question.card.ambiguous && question.card.hint && (
              <div className="hint">also: {question.card.hint}</div>
            )}
            <input
              ref={inputRef}
              value={input}
              autoFocus
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="type the meaning…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') answerTyped(question.card, input)
              }}
            />
          </div>
        ) : question?.kind === 'pick' ? (
          <div className="ask">
            <div className="prompt">{question.card.meaning}</div>
            <div className="hint">which robot? tap it, or press D · F · J · K</div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
