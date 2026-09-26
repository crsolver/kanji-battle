import { Pix, cachedURL, mix, ramp, rgb, type RGB } from './draw'

export const ROBOT_W = 88
export const ROBOT_H = 136

/** Where the kanji screen sits, in sprite pixels. The DOM kanji is laid over it. */
export const SCREEN = { x: 23, y: 58, w: 42, h: 42 }

export interface RobotPalette {
  body: string
  eye: string
  /** Kanji glow colour (CSS) and screen tint. */
  kanji: string
  screen: string
}

export const ROBOT_PALETTES: RobotPalette[] = [
  { body: '#d9534f', eye: '#ffe14d', kanji: '#7dffb0', screen: '#0a1f1a' },
  { body: '#4a7fd8', eye: '#ffd34d', kanji: '#ffe27d', screen: '#0d1630' },
  { body: '#8a5ad6', eye: '#7dffb0', kanji: '#ff9ee8', screen: '#1a0d2e' },
  { body: '#3fae6a', eye: '#ff6b6b', kanji: '#ffb86b', screen: '#0e1f14' },
  { body: '#e08a3c', eye: '#5cf0ff', kanji: '#8fe9ff', screen: '#22140c' },
]

export const ACCESSORIES = ['antenna', 'horns', 'twin', 'dish', 'crest'] as const
export type Accessory = (typeof ACCESSORIES)[number]

const STEEL = ramp('#8b90a8')
const IRON = ramp('#565b78')
const GOLD = ramp('#ffd34d')

/** Horizontal panel lines / ridges on a limb. */
function ridges(p: Pix, x: number, y: number, w: number, h: number, step: number, c: RGB) {
  for (let yy = y + step; yy < y + h - 1; yy += step) p.rect(x + 1, yy, w - 2, 1, c)
}

function accessory(p: Pix, kind: Accessory, body: RGB[]) {
  const cx = 44
  switch (kind) {
    case 'antenna':
      p.box(cx - 1, 5, 3, 10, STEEL, 0)
      p.ell(cx, 4, 3.5, 3.5, GOLD)
      break
    case 'twin':
      for (const x of [32, 55]) {
        p.box(x - 1, 4, 3, 11, STEEL, 0)
        p.ell(x, 3, 2.5, 2.5, GOLD)
      }
      break
    case 'horns':
      for (const s of [-1, 1]) {
        const bx = cx + s * 14
        p.box(bx - 2, 9, 5, 6, body, 1)
        p.box(bx - 2 + s * 3, 5, 4, 6, body, 1)
        p.box(bx - 2 + s * 6, 1, 3, 6, GOLD, 1)
      }
      break
    case 'dish':
      p.box(cx - 1, 8, 3, 7, STEEL, 0)
      p.ell(cx, 6, 10, 4.5, STEEL)
      p.ell(cx, 5, 3, 2, GOLD)
      break
    case 'crest':
      p.box(cx - 8, 7, 5, 8, GOLD, 1)
      p.box(cx - 2, 2, 5, 13, GOLD, 1)
      p.box(cx + 4, 7, 5, 8, GOLD, 1)
      break
  }
}

export function drawRobot(kind: Accessory, pal: RobotPalette): Pix {
  const p = new Pix(ROBOT_W, ROBOT_H)
  const body = ramp(pal.body)
  const darkBody = ramp(mix(pal.body, '#20143a', 0.35))

  // Legs, knee guards, feet
  for (const x of [24, 46]) {
    p.box(x, 108, 18, 20, IRON, 1)
    ridges(p, x, 108, 18, 20, 5, rgb('#2d3048'))
    p.box(x - 1, 115, 20, 6, body, 1)
  }
  p.box(17, 127, 28, 9, darkBody, 3)
  p.box(43, 127, 28, 9, darkBody, 3)
  p.rect(20, 129, 6, 1, darkBody[3])
  p.rect(46, 129, 6, 1, darkBody[3])
  p.box(21, 104, 46, 8, STEEL, 1) // hips

  // Arms and fists
  for (const x of [3, 75]) {
    p.box(x, 64, 10, 34, IRON, 1)
    ridges(p, x, 64, 10, 34, 4, rgb('#2d3048'))
  }
  p.ell(8, 101, 8.5, 8.5, darkBody)
  p.ell(80, 101, 8.5, 8.5, darkBody)
  p.rect(5, 100, 6, 1, darkBody[0])
  p.rect(77, 100, 6, 1, darkBody[0])

  // Torso
  p.box(14, 50, 60, 58, body, 3)
  for (const [x, y] of [[18, 54], [68, 54], [18, 101], [68, 101]]) p.ell(x, y, 2, 2, GOLD, false)

  // Kanji screen: bezel, dark glass, scanlines, corner brackets
  p.box(SCREEN.x - 2, SCREEN.y - 2, SCREEN.w + 4, SCREEN.h + 4, IRON, 1)
  const glass = rgb(pal.screen)
  const glassLit = mix(pal.screen, pal.kanji, 0.12)
  for (let y = 0; y < SCREEN.h; y++) {
    for (let x = 0; x < SCREEN.w; x++) {
      const edge = Math.min(x, SCREEN.w - 1 - x, y, SCREEN.h - 1 - y)
      let c = edge < 2 ? glass : glassLit
      if (y % 2 === 1) c = mix(c, '#000000', 0.22)
      p.set(SCREEN.x + x, SCREEN.y + y, c)
    }
  }
  const k = rgb(pal.kanji)
  for (const [cx, cy, sx, sy] of [
    [SCREEN.x + 1, SCREEN.y + 1, 1, 1],
    [SCREEN.x + SCREEN.w - 2, SCREEN.y + 1, -1, 1],
    [SCREEN.x + 1, SCREEN.y + SCREEN.h - 2, 1, -1],
    [SCREEN.x + SCREEN.w - 2, SCREEN.y + SCREEN.h - 2, -1, -1],
  ] as const) {
    for (let i = 0; i < 4; i++) {
      p.set(cx + i * sx, cy, mix(k, glass, 0.35))
      p.set(cx, cy + i * sy, mix(k, glass, 0.35))
    }
  }

  // Belt: status lights and vents
  ;['#ff5d73', '#ffd34d', '#7dffb0'].forEach((c, i) => p.ell(26 + i * 7, 106, 2, 2, ramp(c), false))
  for (let i = 0; i < 4; i++) p.rect(47 + i * 5, 103, 3, 5, rgb('#1c1430'))

  // Shoulders, ears, neck
  p.ell(10, 58, 10.5, 9.5, body)
  p.ell(78, 58, 10.5, 9.5, body)
  p.ell(9, 55, 2, 2, GOLD, false)
  p.ell(79, 55, 2, 2, GOLD, false)
  p.box(18, 25, 7, 12, STEEL, 1)
  p.box(63, 25, 7, 12, STEEL, 1)
  p.box(38, 44, 12, 8, STEEL, 1)
  p.rect(39, 46, 10, 1, rgb('#4a4e66'))
  p.rect(39, 49, 10, 1, rgb('#4a4e66'))

  // Head
  p.box(24, 14, 40, 31, body, 5)
  p.rect(30, 16, 28, 1, body[4]) // top sheen
  // Visor with glowing eyes and halo
  p.box(29, 22, 30, 16, ramp('#161326'), 2)
  p.rect(30, 23, 28, 14, rgb('#0b0918'))
  const eye = rgb(pal.eye)
  for (const ex of [32, 49]) {
    for (let y = -1; y <= 6; y++) {
      for (let x = -1; x <= 8; x++) {
        const inside = x >= 0 && x <= 7 && y >= 0 && y <= 5
        if (inside) p.set(ex + x, 27 + y, y === 1 || y === 2 ? mix(eye, '#ffffff', 0.55) : eye)
        else if ((x + y) % 2 === 0) p.set(ex + x, 27 + y, mix(eye, '#0b0918', 0.62))
      }
    }
  }
  // Mouth grille
  for (let i = 0; i < 6; i++) p.rect(33 + i * 4, 40, 2, 3, rgb('#2d3048'))
  p.rect(33, 39, 22, 1, body[1])

  accessory(p, kind, body)
  return p
}

export function robotLook(kanji: string) {
  let h = 0
  for (const ch of kanji) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0
  return {
    kind: ACCESSORIES[h % ACCESSORIES.length],
    palette: ROBOT_PALETTES[Math.floor(h / 5) % ROBOT_PALETTES.length],
  }
}

export function robotURL(kanji: string): { url: string; palette: RobotPalette } {
  const { kind, palette } = robotLook(kanji)
  return { url: cachedURL(`robot:${kind}:${palette.body}`, () => drawRobot(kind, palette)), palette }
}
