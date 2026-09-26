import { useMemo, type CSSProperties } from 'react'
import { SCREEN, ROBOT_H, ROBOT_W, robotURL } from '../art/robot'
import type { Card } from '../data/cards'

/** Pixel debris that flies out when a robot is destroyed. */
function Burst({ color }: { color: string }) {
  const bits = useMemo(
    () =>
      Array.from({ length: 32 }, (_, i) => ({
        dx: (Math.random() - 0.5) * 34,
        dy: -6 - Math.random() * 16,
        size: 0.6 + Math.random() * 1.4,
        delay: Math.random() * 0.05,
        color: i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? color : '#ffd34d',
      })),
    [color],
  )
  return (
    <div className="burst" aria-hidden>
      {bits.map((b, i) => (
        <span
          key={i}
          className="bit"
          style={
            {
              '--dx': `calc(var(--u) * ${b.dx})`,
              '--dy': `calc(var(--u) * ${b.dy})`,
              width: `calc(var(--u) * ${b.size})`,
              height: `calc(var(--u) * ${b.size})`,
              background: b.color,
              animationDelay: `calc(var(--impact) + ${b.delay}s)`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}

const pct = (n: number, of: number) => `${(n / of) * 100}%`

export function Robot({
  card,
  mini,
  className = '',
  keyLabel,
  burst,
  onPick,
}: {
  card: Card
  mini?: boolean
  className?: string
  keyLabel?: string
  burst?: boolean
  /** Tap / click to choose this robot (touch screens have no D F J K). */
  onPick?: () => void
}) {
  const look = useMemo(() => robotURL(card.kanji), [card.kanji])
  return (
    <div
      className={`robot${mini ? ' mini' : ''}${onPick ? ' pickable' : ''} ${className}`}
      onPointerDown={onPick ? (e) => { e.preventDefault(); onPick() } : undefined}
      style={{ '--kanji': look.palette.kanji } as CSSProperties}
    >
      <div className="robot-inner">
        <img className="sprite" src={look.url} alt="" draggable={false} />
        <div
          className="robot-screen"
          style={{
            left: pct(SCREEN.x, ROBOT_W),
            top: pct(SCREEN.y, ROBOT_H),
            width: pct(SCREEN.w, ROBOT_W),
            height: pct(SCREEN.h, ROBOT_H),
          }}
        >
          <span className="kanji">{card.kanji}</span>
        </div>
      </div>
      {keyLabel && <div className="keycap">{keyLabel}</div>}
      {burst && <Burst color={look.palette.body} />}
    </div>
  )
}
