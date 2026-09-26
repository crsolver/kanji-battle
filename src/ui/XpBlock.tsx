import { useEffect, useState } from 'react'
import type { XpOutcome } from '../progress/applyResults'
import { levelInfo } from '../progress/xp'

/** XP earned in a session: each line, the total, and the level bar filling up (with a level-up flourish). */
export function XpBlock({ xp }: { xp: XpOutcome }) {
  const before = levelInfo(xp.xpBefore)
  const after = levelInfo(xp.xpAfter)
  const leveled = after.level > before.level
  const [shown, setShown] = useState({ level: before.level, pct: before.pct, animate: false })

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    // Fill the bar; on a level-up fill it to the top, then start the new level from empty.
    timers.push(setTimeout(() => setShown({ level: before.level, pct: leveled ? 1 : after.pct, animate: true }), 300))
    if (leveled) {
      timers.push(setTimeout(() => setShown({ level: after.level, pct: 0, animate: false }), 1200))
      timers.push(setTimeout(() => setShown({ level: after.level, pct: after.pct, animate: true }), 1350))
    }
    return () => timers.forEach(clearTimeout)
  }, [xp]) // eslint-disable-line react-hooks/exhaustive-deps

  if (xp.total <= 0) return null

  return (
    <div className="xp-block">
      <div className="pixel-text">XP EARNED</div>
      <ul className="xp-lines">
        {xp.lines.map((l) => (
          <li key={l.label}>
            <span>{l.label}</span>
            <b>+{l.xp}</b>
          </li>
        ))}
        <li className="xp-total">
          <span>TOTAL</span>
          <b>+{xp.total}</b>
        </li>
      </ul>
      <div className="xp-level">
        <span className="pixel-text">LV {shown.level}</span>
        <div className={`xpbar${shown.animate ? ' animate' : ''}`}>
          <i style={{ width: `${Math.round(shown.pct * 100)}%` }} />
        </div>
      </div>
      {leveled && <div className="level-up pixel-text">LEVEL UP! LV {after.level}</div>}
    </div>
  )
}
