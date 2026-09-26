import { describe, expect, it } from 'vitest'
import { BG_H, BG_W, drawBackground } from '../art/backgrounds'
import { HERO_H, HERO_W, SWORD_H, SWORD_W, drawHero, drawSword } from '../art/hero'
import { ACCESSORIES, ROBOT_H, ROBOT_PALETTES, ROBOT_W, SCREEN, drawRobot, robotLook } from '../art/robot'
import { LEVELS } from '../data/cards'
import { HEART_GRID, gridToPaths } from './sprites'

const opaque = (p: { data: Uint8ClampedArray }) => {
  let n = 0
  for (let i = 3; i < p.data.length; i += 4) if (p.data[i]) n++
  return n
}

describe('sprites', () => {
  it('every robot variant draws inside its canvas and fills the screen area', () => {
    for (const kind of ACCESSORIES) {
      for (const pal of ROBOT_PALETTES) {
        const p = drawRobot(kind, pal)
        expect(p.w).toBe(ROBOT_W)
        expect(p.h).toBe(ROBOT_H)
        expect(opaque(p)).toBeGreaterThan(ROBOT_W * ROBOT_H * 0.3)
        // Every pixel of the kanji screen is painted. Away from the corner
        // brackets it is dark glass, so the glowing kanji stays readable.
        for (let y = SCREEN.y; y < SCREEN.y + SCREEN.h; y++) {
          for (let x = SCREEN.x; x < SCREEN.x + SCREEN.w; x++) {
            const c = p.get(x, y)
            expect(c).not.toBeNull()
            const inCorner = (x - SCREEN.x < 6 || SCREEN.x + SCREEN.w - x <= 6) && (y - SCREEN.y < 6 || SCREEN.y + SCREEN.h - y <= 6)
            if (!inCorner) expect(Math.max(...c!)).toBeLessThan(120)
          }
        }
        // the sprite touches its bottom edge so it stands on the floor
        expect(p.get(30, ROBOT_H - 2)).not.toBeNull()
      }
    }
  })

  it('hero and sword draw at their declared sizes', () => {
    const h = drawHero()
    const s = drawSword()
    expect([h.w, h.h]).toEqual([HERO_W, HERO_H])
    expect([s.w, s.h]).toEqual([SWORD_W, SWORD_H])
    expect(opaque(h)).toBeGreaterThan(600)
    expect(opaque(s)).toBeGreaterThan(100)
  })

  it('every level has a fully opaque, distinct background', () => {
    const sums = new Set<number>()
    for (const level of LEVELS) {
      const bg = drawBackground(level)
      expect([bg.w, bg.h]).toEqual([BG_W, BG_H])
      expect(opaque(bg)).toBe(BG_W * BG_H)
      let sum = 0
      for (let i = 0; i < bg.data.length; i += 97) sum += bg.data[i]
      sums.add(sum)
    }
    expect(sums.size).toBe(LEVELS.length)
  })

  it('picks a stable look per kanji', () => {
    expect(robotLook('日')).toEqual(robotLook('日'))
  })

  it('gridToPaths skips transparent pixels', () => {
    expect(gridToPaths(['.a', 'aa'])).toEqual({ a: 'M1 0h1v1h-1zM0 1h2v1h-2z' })
    expect(HEART_GRID.every((r) => r.length === 7)).toBe(true)
  })
})
