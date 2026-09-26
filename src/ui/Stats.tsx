import { useMemo, useState, type ReactNode } from 'react'
import { CARD_BY_KANJI } from '../data/cards'
import type { CardStatus } from '../progress/status'
import {
  accuracySeries, activitySeries, formatDuration, hardestKanji, overview, statusByLevel, todayKey, topConfusions,
  type AccuracyPoint, type DayPoint, type LevelStatus,
} from '../progress/stats'
import { MIN_ACCURACY } from '../progress/chapters'
import { levelInfo } from '../progress/xp'
import { useApp } from '../store/app'
import { Flame } from './Pixel'

/** Series colours: the dataviz reference palette's dark-mode steps (validated on the dark surface). */
const C = {
  blue: '#3987e5',
  orange: '#d95926',
  aqua: '#199e70',
  track: '#3a3360',
  surface: '#211d33',
}
const STATUS_COLOR: Record<CardStatus, string> = {
  mastered: C.aqua,
  reviewing: C.blue,
  learning: C.orange,
  new: C.track,
}
const STATUS_ORDER: CardStatus[] = ['mastered', 'reviewing', 'learning', 'new']

const pct = (n: number) => `${Math.round(n * 100)}%`
const day = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

/** Smallest round number at or above `n`, so the y axis has friendly ticks. */
export function niceMax(n: number): number {
  for (const step of [10, 20, 50, 100, 200, 500, 1000, 2000, 5000]) if (n <= step) return step
  return Math.ceil(n / 1000) * 1000
}

function Card({
  title, note, table, children,
}: {
  title: string
  note?: string
  table?: { head: string[]; rows: (string | number)[][] }
  children: ReactNode
}) {
  const [asTable, setAsTable] = useState(false)
  return (
    <section className="dialog chart-card">
      <div className="chart-head">
        <div>
          <h2 className="pixel-text">{title}</h2>
          {note && <div className="dim">{note}</div>}
        </div>
        {table && (
          <button className="small" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
            {asTable ? 'CHART' : 'TABLE'}
          </button>
        )}
      </div>
      {asTable && table ? (
        <div className="table-wrap">
          <table className="cards">
            <thead><tr>{table.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  )
}

const W = 640
const H = 190
const M = { l: 40, r: 10, t: 16, b: 26 }
const PW = W - M.l - M.r
const PH = H - M.t - M.b

function Axes({ ticks, fmt, first, last }: { ticks: number[]; fmt: (n: number) => string; first: string; last: string }) {
  const top = ticks[ticks.length - 1]
  return (
    <>
      {ticks.map((t) => {
        const y = M.t + PH - (t / top) * PH
        return (
          <g key={t}>
            <line className="grid" x1={M.l} x2={W - M.r} y1={y} y2={y} />
            <text className="axis-text" x={M.l - 6} y={y + 4} textAnchor="end">{fmt(t)}</text>
          </g>
        )
      })}
      <text className="axis-text" x={M.l} y={H - 6}>{first}</text>
      <text className="axis-text" x={W - M.r} y={H - 6} textAnchor="end">{last}</text>
    </>
  )
}

function ActivityChart({ data }: { data: DayPoint[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(...data.map((d) => d.answers))
  const top = niceMax(max)
  const col = PW / data.length
  const tallest = data.findIndex((d) => d.answers === max)
  const h = hover === null ? null : data[hover]
  return (
    <>
      {max === 0 ? (
        <p className="empty dim">No activity yet. Play a floor and it shows up here.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Answers per day, last 30 days" shapeRendering="crispEdges">
          <Axes ticks={[0, top / 2, top]} fmt={String} first={day(data[0].date)} last="today" />
          {data.map((d, i) => {
            const bh = Math.max(d.answers ? 3 : 2, (d.answers / top) * PH)
            return (
              <g key={d.date}>
                <rect
                  x={M.l + i * col + 1} y={M.t + PH - bh} width={col - 2} height={bh}
                  fill={d.answers ? C.blue : C.track} opacity={hover === null || hover === i ? 1 : 0.55}
                />
                <rect
                  x={M.l + i * col} y={M.t} width={col} height={PH} fill="transparent"
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                >
                  <title>{`${day(d.date)}: ${d.answers} answers`}</title>
                </rect>
              </g>
            )
          })}
          <text className="axis-text label" x={M.l + tallest * col + col / 2} y={M.t + PH - (max / top) * PH - 4} textAnchor="middle">
            {max}
          </text>
        </svg>
      )}
      <div className="readout">
        {h ? `${day(h.date)} · ${h.answers} answers · ${h.answers ? pct(h.correct / h.answers) : '-'} right · +${h.xp} XP` : 'Hover a bar for the day'}
      </div>
    </>
  )
}

function AccuracyChart({ data }: { data: AccuracyPoint[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const played = data.filter((d) => d.accuracy !== null)
  const col = PW / data.length
  const x = (i: number) => M.l + i * col + col / 2
  const y = (a: number) => M.t + PH - a * PH
  // One path segment per run of consecutive played days, so quiet days show as gaps.
  const segments: string[] = []
  let run = ''
  data.forEach((d, i) => {
    if (d.accuracy === null) {
      if (run) segments.push(run)
      run = ''
    } else {
      run += `${run ? 'L' : 'M'}${x(i)} ${y(d.accuracy)}`
    }
  })
  if (run) segments.push(run)
  const h = hover === null ? null : data[hover]
  return (
    <>
      {played.length === 0 ? (
        <p className="empty dim">No answers in the last 30 days.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Accuracy per day, last 30 days">
          <Axes ticks={[0, 0.5, 1]} fmt={pct} first={day(data[0].date)} last="today" />
          <line className="ref" x1={M.l} x2={W - M.r} y1={y(MIN_ACCURACY)} y2={y(MIN_ACCURACY)} />
          <text className="axis-text" x={W - M.r} y={y(MIN_ACCURACY) - 4} textAnchor="end">{pct(MIN_ACCURACY)} to pass a chapter</text>
          {segments.map((d, i) => <path key={i} d={d} fill="none" stroke={C.aqua} strokeWidth={2} />)}
          {data.map((d, i) =>
            d.accuracy === null ? null : (
              <circle key={d.date} cx={x(i)} cy={y(d.accuracy)} r={hover === i ? 5 : 4} fill={C.aqua} stroke={C.surface} strokeWidth={2} />
            ),
          )}
          {data.map((d, i) => (
            <rect
              key={`hit${d.date}`} x={M.l + i * col} y={M.t} width={col} height={PH} fill="transparent"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            >
              <title>{`${day(d.date)}: ${d.accuracy === null ? 'no answers' : pct(d.accuracy)}`}</title>
            </rect>
          ))}
        </svg>
      )}
      <div className="readout">
        {h ? `${day(h.date)} · ${h.accuracy === null ? 'no answers' : `${pct(h.accuracy)} right of ${h.answers}`}` : 'Hover a day. Days off are left as gaps.'}
      </div>
    </>
  )
}

function StatusChart({ rows }: { rows: LevelStatus[] }) {
  const [hover, setHover] = useState('')
  return (
    <>
      <div className="legend" aria-label="Legend">
        {STATUS_ORDER.map((s) => (
          <span key={s}><i style={{ background: STATUS_COLOR[s] }} />{s}</span>
        ))}
      </div>
      <div className="status-rows">
        {rows.map((r) => (
          <div key={r.level} className="status-row">
            <span className="pixel-text lvl">{r.level}</span>
            <div className="status-bar">
              {STATUS_ORDER.map((s) =>
                r.counts[s] ? (
                  <i
                    key={s}
                    style={{ flex: r.counts[s], background: STATUS_COLOR[s] }}
                    title={`${r.level} · ${s}: ${r.counts[s]}`}
                    onMouseEnter={() => setHover(`${r.level} · ${s}: ${r.counts[s]} of ${r.total} (${pct(r.counts[s] / r.total)})`)}
                    onMouseLeave={() => setHover('')}
                  />
                ) : null,
              )}
            </div>
            <span className="dim seen">{r.total - r.counts.new} / {r.total}</span>
          </div>
        ))}
      </div>
      <div className="readout">{hover || 'Hover a segment. The number on the right is kanji seen out of the level total.'}</div>
    </>
  )
}

export function StatsScreen() {
  const { progress, goto } = useApp()
  const now = Date.now()
  const today = todayKey(now)
  const o = useMemo(() => overview(progress, now), [progress]) // eslint-disable-line react-hooks/exhaustive-deps
  const activity = useMemo(() => activitySeries(progress.days, 30, today), [progress, today])
  const accuracy = useMemo(() => accuracySeries(progress.days, 30, today), [progress, today])
  const status = useMemo(() => statusByLevel(progress), [progress])
  const hard = useMemo(() => hardestKanji(progress), [progress])
  const conf = useMemo(() => topConfusions(progress), [progress])
  const lvl = levelInfo(o.xp)

  const tiles: [string, string, string?][] = [
    ['LEVEL', `${o.level}`, `${o.xp} XP · ${lvl.into}/${lvl.need}`],
    ['STREAK', `${o.streak}`, `best ${o.bestStreak}`],
    ['ANSWERS', String(o.answers), `${o.correct} right`],
    ['ACCURACY', o.accuracy === null ? '-' : pct(o.accuracy)],
    ['TIME PLAYED', formatDuration(o.timeMs)],
    ['FLOORS CLEARED', String(o.floors)],
    ['KANJI SEEN', `${o.seen}`, `of ${o.total}`],
    ['MASTERED', String(o.mastered)],
    ['BOSSES BEATEN', String(o.bossWins)],
  ]

  return (
    <div className="screen stats-screen">
      <header className="col-head">
        <button className="small" onClick={() => goto('map')}>‹ MAP</button>
        <h1>STATS</h1>
      </header>

      <div className="tiles">
        {tiles.map(([label, value, sub]) => (
          <div className="stat" key={label}>
            <span>{label}</span>
            <b>{label === 'STREAK' ? <><Flame lit={o.streak > 0} /> {value}</> : value}</b>
            {sub && <small className="dim">{sub}</small>}
          </div>
        ))}
      </div>

      <Card
        title="KANJI BY STATUS"
        note="How far along each JLPT level you are"
        table={{
          head: ['level', 'mastered', 'reviewing', 'learning', 'new'],
          rows: status.map((r) => [r.level, r.counts.mastered, r.counts.reviewing, r.counts.learning, r.counts.new]),
        }}
      >
        <StatusChart rows={status} />
      </Card>

      <Card
        title="ANSWERS PER DAY"
        note="Last 30 days"
        table={{ head: ['day', 'answers', 'right', 'xp'], rows: activity.map((d) => [day(d.date), d.answers, d.correct, d.xp]) }}
      >
        <ActivityChart data={activity} />
      </Card>

      <Card
        title="ACCURACY"
        note="Share of answers right, per day"
        table={{ head: ['day', 'answers', 'accuracy'], rows: accuracy.map((d) => [day(d.date), d.answers, d.accuracy === null ? '-' : pct(d.accuracy)]) }}
      >
        <AccuracyChart data={accuracy} />
      </Card>

      <div className="two-col">
        <Card title="HARDEST KANJI" note="Most lapses, then lowest accuracy">
          {hard.length === 0 ? (
            <p className="empty dim">No trouble spots yet.</p>
          ) : (
            <ol className="rank">
              {hard.map((r) => (
                <li key={r.card.kanji}>
                  <span className="kanji big-k">{r.card.kanji}</span>
                  <span className="grow">{r.card.meaning}</span>
                  <span className="dim">{r.lapses} lapses · {pct(r.accuracy)} of {r.seen}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card title="MOST MIXED UP" note="Pairs you confuse, and their boss">
          {conf.length === 0 ? (
            <p className="empty dim">No mix-ups recorded yet.</p>
          ) : (
            <ol className="rank">
              {conf.map((r) => (
                <li key={r.a + r.b}>
                  <span className="kanji big-k">{r.a}<i>≠</i>{r.b}</span>
                  <span className="grow">
                    {CARD_BY_KANJI.get(r.a)?.meaning} / {CARD_BY_KANJI.get(r.b)?.meaning}
                  </span>
                  <span className="dim">{r.count}×</span>
                  {r.boss !== 'none' && <span className={`boss-badge ${r.boss}`}>{r.boss === 'waiting' ? 'BOSS WAITING' : 'RETIRED'}</span>}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  )
}
