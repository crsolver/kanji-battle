import { memo, useMemo, type CSSProperties } from 'react'
import {
  FLAME_GRID, HEART_GRID, LOCK_GRID, STAR_GRID, gridToPaths, type Grid, type Palette,
} from './sprites'

export const PixelSprite = memo(function PixelSprite({
  grid,
  palette,
  className,
  style,
}: {
  grid: Grid
  palette: Palette
  className?: string
  style?: CSSProperties
}) {
  const paths = useMemo(() => gridToPaths(grid), [grid])
  return (
    <svg
      viewBox={`0 0 ${grid[0].length} ${grid.length}`}
      shapeRendering="crispEdges"
      className={className}
      style={style}
      aria-hidden
    >
      {Object.entries(paths).map(([key, d]) =>
        palette[key] ? <path key={key} d={d} fill={palette[key]} /> : null,
      )}
    </svg>
  )
})

const FULL = { r: '#ff4d6d', w: '#ffc2cf' }
const EMPTY = { r: '#3a2f52', w: '#3a2f52' }

export function Hearts({ hp, max }: { hp: number; max: number }) {
  return (
    <div className="hearts" aria-label={`${hp} of ${max} hearts`}>
      {Array.from({ length: max }, (_, i) => (
        <PixelSprite key={i} grid={HEART_GRID} palette={i < hp ? FULL : EMPTY} className="heart" />
      ))}
    </div>
  )
}

const STAR_ON = { y: '#ffd34d' }
const STAR_OFF = { y: '#3a2f52' }

export function Stars({ n, max = 3 }: { n: number; max?: number }) {
  return (
    <span className="stars" aria-label={`${n} of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <PixelSprite key={i} grid={STAR_GRID} palette={i < n ? STAR_ON : STAR_OFF} className="star" />
      ))}
    </span>
  )
}

const FLAME_ON = { r: '#ff6a3d', y: '#ffd34d' }
const FLAME_OFF = { r: '#3a2f52', y: '#4a3f66' }
export const Flame = ({ lit = true }: { lit?: boolean }) => (
  <PixelSprite grid={FLAME_GRID} palette={lit ? FLAME_ON : FLAME_OFF} className="flame" />
)

const LOCK_PAL = { o: '#dcd6f5', y: '#ffd34d' }
export const Lock = ({ className = 'lock' }: { className?: string }) => (
  <PixelSprite grid={LOCK_GRID} palette={LOCK_PAL} className={className} />
)
