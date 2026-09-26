import { Pix, cachedURL, ramp, rgb } from './draw'

export const HERO_W = 48
export const HERO_H = 64
export const SWORD_W = 20
export const SWORD_H = 48

const ARMOR = ramp('#4f86e0')
const CAPE = ramp('#d63a55')
const SKIN = ramp('#ffd0a8')
const LEATHER = ramp('#7a4a2e')
const GOLD = ramp('#ffd34d')
const DARK = ramp('#2b2350')

export function drawHero(): Pix {
  const p = new Pix(HERO_W, HERO_H)

  // Cape flowing behind (to the left), folded with vertical shading.
  p.poly(
    [[19, 27], [30, 27], [28, 55], [3, 58], [8, 46]],
    (x, y) => {
      const fold = (x + Math.floor(y / 6)) % 5
      const c = fold === 0 ? CAPE[3] : fold < 3 ? CAPE[2] : CAPE[1]
      return c
    },
  )
  // cape outline: dark edge along the bottom and left
  for (let i = 0; i < 26; i++) p.set(3 + i, 58 - Math.round((i * 3) / 25), CAPE[0])

  // Far arm
  p.box(13, 31, 6, 13, DARK, 1)
  p.ell(15, 45, 3, 3, SKIN)

  // Legs
  p.box(17, 46, 7, 12, DARK, 0)
  p.box(25, 46, 7, 12, ramp('#3a3168'), 0)
  // Boots
  p.box(14, 56, 11, 8, LEATHER, 2)
  p.box(24, 56, 14, 8, LEATHER, 2)
  p.rect(26, 58, 8, 1, LEATHER[4])

  // Torso armor + belt + emblem
  p.box(15, 28, 19, 20, ARMOR, 3)
  p.box(15, 43, 19, 5, LEATHER, 1)
  p.rect(23, 44, 3, 3, GOLD[3])
  // gold diamond emblem
  const diamond = [[24, 1], [23, 3], [22, 5], [23, 3], [24, 1]] as const
  diamond.forEach(([x, w], i) => p.rect(x, 33 + i, w, 1, GOLD[i === 2 ? 4 : 3]))

  // Scarf
  p.box(15, 25, 19, 5, CAPE, 1)
  p.box(5, 27, 12, 4, CAPE, 1)
  p.rect(6, 28, 9, 1, CAPE[3])

  // Near arm (sword arm), pauldron, glove
  p.box(31, 31, 6, 13, ARMOR, 1)
  p.ell(33, 30, 5.5, 4.5, ARMOR)
  p.ell(36, 45, 3.5, 3.5, ramp('#f2ead8'))

  // Head: face first, helmet dome over it
  p.ell(25, 19, 9, 9, SKIN)
  p.ell(24, 13, 11, 9, ARMOR)
  p.rect(14, 15, 22, 3, ARMOR[1])
  p.rect(14, 15, 22, 1, ARMOR[0])
  p.ell(26, 20, 7, 6, SKIN, false)
  // Eye, blush, mouth
  p.rect(29, 18, 3, 4, rgb('#1a1030'))
  p.set(29, 18, rgb('#ffffff'))
  p.set(30, 18, rgb('#ffffff'))
  p.rect(26, 23, 3, 1, rgb('#ff9a9a'))
  p.rect(30, 25, 2, 1, rgb('#a3503f'))
  // Helmet plume
  p.ell(13, 10, 6, 3, CAPE)
  p.ell(8, 13, 5, 2.5, CAPE)
  p.ell(4, 16, 3.5, 2, CAPE)
  p.ell(24, 6, 3, 2, GOLD, false)
  return p
}

export function drawSword(): Pix {
  const p = new Pix(SWORD_W, SWORD_H)
  const blade = ramp('#e8f0ff')
  // Blade: tapered tip, lit left edge, shaded right edge, bright fuller.
  for (let y = 0; y < 34; y++) {
    const half = y < 5 ? 1 + Math.floor(y / 2) : 3
    for (let x = 10 - half; x <= 9 + half; x++) {
      const edge = x === 10 - half ? 0 : x === 9 + half ? 0 : x < 10 ? 3 : 1
      p.set(x, y, y === 0 ? blade[0] : edge === 0 ? blade[0] : blade[edge])
    }
    if (y > 4) p.set(9, y, blade[4])
  }
  p.box(3, 34, 14, 4, GOLD, 1) // guard
  p.box(8, 38, 4, 7, LEATHER, 0) // grip
  for (let y = 39; y < 45; y += 2) p.rect(8, y, 4, 1, LEATHER[0])
  p.ell(10, 46, 3, 2, GOLD)
  return p
}

export const heroURL = () => cachedURL('hero', drawHero)
export const swordURL = () => cachedURL('sword', drawSword)
