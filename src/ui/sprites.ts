/**
 * Small grid-authored pixel art (the HUD hearts). '.' is transparent; every
 * other character is a palette key. Bigger art is generated in src/art.
 */
export type Grid = string[]
export type Palette = Record<string, string>

export const HEART_GRID: Grid = [
  '.rr.rr.',
  'rwrrrrr',
  'rrrrrrr',
  '.rrrrr.',
  '..rrr..',
  '...r...',
]

export const STAR_GRID: Grid = [
  '...y...',
  '...y...',
  'yyyyyyy',
  '.yyyyy.',
  '..yyy..',
  '.yy.yy.',
  'yy...yy',
]

export const FLAME_GRID: Grid = [
  '...r...',
  '..rr...',
  '..rry..',
  '.rryyr.',
  'rryyyrr',
  'rryyyrr',
  '.rryyr.',
  '..rrr..',
]

export const LOCK_GRID: Grid = [
  '..ooo..',
  '.o...o.',
  '.o...o.',
  'ooooooo',
  'oyyyyyo',
  'oyyoyyo',
  'oyyoyyo',
  'ooooooo',
]

/** One SVG path per palette key: horizontal runs of pixels. */
export function gridToPaths(grid: Grid): Record<string, string> {
  const paths: Record<string, string> = {}
  grid.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const c = row[x]
      let end = x
      while (end < row.length && row[end] === c) end++
      if (c !== '.') paths[c] = (paths[c] ?? '') + `M${x} ${y}h${end - x}v1h${x - end}z`
      x = end
    }
  })
  return paths
}
