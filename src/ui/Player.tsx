import type { CSSProperties } from 'react'
import { heroURL, swordURL } from '../art/hero'

export type PlayerState = 'idle' | 'attack' | 'hurt'

/**
 * Remount with a new `key` to replay an animation. `dash` is how far the hero
 * runs to reach the target, in container-width percent.
 */
export function Player({ state, dash }: { state: PlayerState; dash: number }) {
  return (
    <div className={`player ${state}`} style={{ '--dash': `${dash}cqw` } as CSSProperties}>
      <div className="player-inner">
        <img className="sprite" src={heroURL()} alt="" draggable={false} />
        <img className="sword" src={swordURL()} alt="" draggable={false} />
      </div>
    </div>
  )
}
