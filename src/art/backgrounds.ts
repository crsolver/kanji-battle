import type { Level } from '../data/cards'
import { Pix, bayer, cachedURL, fbm, mix, ramp, rgb, rng, vnoise, type RGB } from './draw'

/** Stage art is 308x160 (77x40 layout units of 4px). The floor starts at y=148. */
export const BG_W = 308
export const BG_H = 160
const FLOOR = 148

export const LEVEL_NAMES: Record<Level, string> = {
  N5: 'Sunny Meadow',
  N4: 'Bamboo Dusk',
  N3: 'Neon City',
  N2: 'Ember Volcano',
  N1: 'Star Station',
}

// ---------- helpers ----------

function ridge(p: Pix, base: number, amp: number, scale: number, seed: number, fill: string | RGB, top?: string | RGB) {
  for (let x = 0; x < p.w; x++) {
    const y = Math.round(base - amp * fbm(x / scale, 1.3, seed, 3))
    for (let yy = y; yy < FLOOR; yy++) p.set(x, yy, fill)
    if (top) p.set(x, y, top)
  }
}

function halo(p: Pix, cx: number, cy: number, r0: number, r1: number, color: string | RGB, strength = 0.5) {
  for (let y = Math.floor(cy - r1); y <= Math.ceil(cy + r1); y++) {
    for (let x = Math.floor(cx - r1); x <= Math.ceil(cx + r1); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      if (d < r0 || d > r1) continue
      const t = (1 - (d - r0) / (r1 - r0)) * strength
      if (bayer(x, y) < t) {
        const under = p.get(x, y)
        if (under) p.set(x, y, mix(under, color, 0.55))
      }
    }
  }
}

function sprinkle(p: Pix, n: number, seed: number, colors: string[], y0: number, y1: number, size = 1) {
  const r = rng(seed)
  for (let i = 0; i < n; i++) {
    p.rect(Math.floor(r() * p.w), Math.floor(y0 + r() * (y1 - y0)), size, size, colors[Math.floor(r() * colors.length)])
  }
}

function cloud(p: Pix, cx: number, cy: number, s: number, tones: RGB[]) {
  const blobs = [[0, 0, 12, 6], [-11, 2, 8, 4.5], [11, 2, 9, 5], [4, -4, 8, 6], [-4, 3, 13, 4]]
  for (const [dx, dy, rx, ry] of blobs) p.ell(cx + dx * s, cy + dy * s, rx * s, ry * s, tones, false)
}

function tree(p: Pix, x: number, base: number, h: number, leaf: RGB[]) {
  p.box(x - 1, base - h * 0.5, 3, h * 0.5, ramp('#6b4630'), 0)
  p.ell(x, base - h * 0.65, h * 0.42, h * 0.42, leaf)
  p.ell(x - h * 0.22, base - h * 0.5, h * 0.3, h * 0.3, leaf)
  p.ell(x + h * 0.24, base - h * 0.52, h * 0.3, h * 0.3, leaf)
}

// ---------- scenes ----------

function meadow(): Pix {
  const p = new Pix(BG_W, BG_H)
  p.vgrad(0, 0, BG_W, 112, ['#4aa8f5', '#7cc6ff', '#b4e4ff', '#e6f7ff'])
  halo(p, 236, 34, 13, 34, '#fff6c0', 0.7)
  p.ell(236, 34, 13, 13, ramp('#fff2a0'), false)
  const cl = ramp('#ffffff').map((c, i) => (i === 1 ? mix(c, '#9cc8f0', 0.55) : c)) as RGB[]
  cloud(p, 52, 26, 1, cl)
  cloud(p, 150, 42, 0.7, cl)
  cloud(p, 278, 68, 0.6, cl)
  cloud(p, 96, 64, 0.5, cl)
  ridge(p, 112, 26, 60, 3, '#86b2e6', '#a6c8f2')
  ridge(p, 124, 24, 46, 7, '#5fc07a', '#8fe39a')
  const leaf = ramp('#2f9a54')
  for (const [x, b, h] of [[30, 130, 20], [66, 126, 16], [128, 128, 22], [214, 126, 18], [262, 130, 24]] as const) tree(p, x, b, h, leaf)
  ridge(p, 138, 16, 38, 11, '#3fa25a', '#6fd17c')
  const r = rng(5)
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(r() * BG_W)
    const y = 138 + Math.floor(r() * 9)
    p.rect(x, y, 2, 2, ['#ff8fc0', '#ffffff', '#ffe066', '#ff7a7a'][i % 4])
    p.set(x, y + 2, '#2a7a3e')
  }
  // ground: grass edge over dirt
  p.rect(0, FLOOR, BG_W, BG_H - FLOOR, '#8a5a3a')
  for (let x = 0; x < BG_W; x++) {
    const blade = 1 + Math.floor(vnoise(x / 2, 0, 2) * 3)
    p.rect(x, FLOOR - 1, 1, blade + 1, x % 3 === 0 ? '#8ff08a' : '#5fc66a')
    p.rect(x, FLOOR + blade, 1, 2, '#3f8f4a')
  }
  for (let x = 0; x < BG_W; x += 22) p.rect(x, FLOOR + 6, 10, 1, '#6e4529')
  sprinkle(p, 40, 9, ['#a87850', '#5e3a22'], FLOOR + 4, BG_H, 2)
  return p
}

function bamboo(p: Pix, x: number, w: number, color: string, seed: number, leaves: boolean) {
  const t = ramp(color)
  const r = rng(seed)
  for (let y = 0; y < FLOOR; y++) {
    for (let i = 0; i < w; i++) p.set(x + i, y, i === 0 ? t[3] : i === w - 1 ? t[1] : t[2])
  }
  for (let y = 10 + Math.floor(r() * 8); y < FLOOR; y += 16 + Math.floor(r() * 8)) {
    p.rect(x - 1, y, w + 2, 2, t[0])
    p.rect(x, y - 1, w, 1, t[4])
    if (leaves && r() > 0.4) {
      const dir = r() > 0.5 ? 1 : -1
      for (let i = 0; i < 8; i++) p.rect(x + (dir > 0 ? w + i * 2 : -2 - i * 2), y - Math.floor(i * 0.6), 3, 1, i % 2 ? t[3] : t[2])
    }
  }
}

function bambooDusk(): Pix {
  const p = new Pix(BG_W, BG_H)
  p.vgrad(0, 0, BG_W, 128, ['#2b1858', '#7a2a7a', '#e0506a', '#ff9a5a', '#ffd27a'])
  halo(p, 154, 116, 28, 56, '#ffb37a', 0.7)
  // retro striped sun
  for (let y = 88; y < 132; y++) {
    if (y > 112 && (y - 112) % 5 < 2) continue
    for (let x = 122; x < 186; x++) {
      const dx = (x + 0.5 - 154) / 32
      const dy = (y + 0.5 - 116) / 32
      if (dx * dx + dy * dy <= 1) p.set(x, y, y < 104 ? '#fff4b0' : y < 116 ? '#ffd86e' : '#ffb04a')
    }
  }
  ridge(p, 110, 30, 50, 4, '#5a2a70', '#8a4a90')
  ridge(p, 128, 22, 40, 8, '#3a2058', '#5a3a78')
  const r = rng(21)
  // far -> near bamboo layers
  for (let x = 6; x < BG_W; x += 26 + Math.floor(r() * 16)) bamboo(p, x, 3, '#3a4a78', x, false)
  for (let x = 2; x < BG_W; x += 40 + Math.floor(r() * 20)) if (x < 100 || x > 210) bamboo(p, x, 4, '#2f7a6a', x + 3, true)
  for (const x of [4, 30, 272, 296]) bamboo(p, x, 7, '#3aa060', x + 9, true)
  halo(p, 154, 126, 4, 90, '#ff9a5a', 0.16)
  sprinkle(p, 26, 3, ['#ffe066', '#ffb0d0'], 60, FLOOR)
  // mossy ground with stepping stones and fallen leaves
  p.vgrad(0, FLOOR, BG_W, BG_H - FLOOR, ['#3a6a48', '#24422e'])
  for (let x = 0; x < BG_W; x++) p.set(x, FLOOR, '#6ac07a')
  for (let x = 8; x < BG_W; x += 40) {
    p.box(x, FLOOR + 3, 26, 7, ramp('#6a6a86'), 3)
  }
  sprinkle(p, 30, 12, ['#ff8fa8', '#ffb37a'], FLOOR + 2, BG_H, 2)
  return p
}

function neonCity(): Pix {
  const p = new Pix(BG_W, BG_H)
  p.vgrad(0, 0, BG_W, FLOOR, ['#080418', '#170a3c', '#3a1170', '#8a2a90'])
  sprinkle(p, 60, 2, ['#ffffff', '#b8b0ff'], 0, 70)
  halo(p, 62, 32, 12, 30, '#c8b8ff', 0.5)
  p.ell(62, 32, 12, 12, ramp('#f2eeff'), false)
  for (const [x, y, r] of [[57, 28, 2.5], [67, 36, 2], [60, 38, 1.5]] as const) p.disc(x, y, r, r, '#c9c2e6')
  const r = rng(33)
  const windows = (x: number, y: number, w: number, h: number, on: string[], offc: RGB | string) => {
    for (let yy = y + 3; yy < y + h - 2; yy += 5) {
      for (let xx = x + 3; xx < x + w - 3; xx += 5) p.rect(xx, yy, 2, 3, r() > 0.55 ? on[Math.floor(r() * on.length)] : offc)
    }
  }
  // far skyline
  for (let x = -4; x < BG_W; ) {
    const w = 16 + Math.floor(r() * 16)
    const h = 40 + Math.floor(r() * 46)
    p.rect(x, FLOOR - h, w, h, '#241452')
    p.rect(x, FLOOR - h, w, 1, '#3a2478')
    windows(x, FLOOR - h, w, h, ['#6a5ac8', '#4a8ad8'], '#1a0e3e')
    x += w + Math.floor(r() * 3)
  }
  // near buildings with neon
  const near: [number, number, number, string][] = [[6, 40, 74, '#ff4fa3'], [64, 34, 58, '#3ef0ff'], [176, 44, 84, '#ff4fa3'], [232, 36, 66, '#ffe14d'], [270, 40, 92, '#3ef0ff']]
  for (const [x, w, h, neon] of near) {
    p.rect(x, FLOOR - h, w, h, '#120a2c')
    p.rect(x, FLOOR - h, w, 2, '#2a1a5a')
    p.rect(x + w - 2, FLOOR - h, 2, h, '#0a0620')
    windows(x, FLOOR - h, w, h, ['#ffd86e', '#7ef0ff', '#ff8fd0'], '#1c1240')
    p.rect(x + 4, FLOOR - h + 10, w - 8, 3, neon)
    halo(p, x + w / 2, FLOOR - h + 11, 3, 16, neon, 0.55)
  }
  for (const [x, y] of [[26, 74], [200, 60], [284, 52]] as const) {
    p.rect(x, y - 16, 2, 16, '#1a1040')
    p.rect(x - 1, y - 18, 4, 3, '#ff3050')
    halo(p, x + 1, y - 17, 2, 8, '#ff3050', 0.6)
  }
  // road with lane dashes and reflections
  p.vgrad(0, FLOOR, BG_W, BG_H - FLOOR, ['#2a2244', '#16112c'])
  p.rect(0, FLOOR, BG_W, 1, '#3ef0ff')
  for (let x = 6; x < BG_W; x += 34) p.rect(x, FLOOR + 6, 18, 2, '#f2c14e')
  for (const [x, c] of [[46, '#ff4fa3'], [214, '#3ef0ff'], [120, '#ffe14d']] as const) {
    for (let y = FLOOR + 2; y < BG_H; y++) if ((x + y) % 2 === 0) p.rect(x - 4, y, 9, 1, mix(c, '#16112c', 0.5))
  }
  return p
}

function volcano(): Pix {
  const p = new Pix(BG_W, BG_H)
  p.vgrad(0, 0, BG_W, 128, ['#160404', '#3f0c0a', '#802010', '#d8551a'])
  halo(p, 204, 58, 8, 70, '#ff9a3a', 0.85)
  // drifting smoke plume: noisy, dithered, lit orange from below
  for (let y = 0; y < 56; y++) {
    const rise = 56 - y
    const cx = 206 + rise * 0.55 + Math.sin(rise / 7) * 5
    const half = 7 + rise * 0.5
    for (let x = Math.floor(cx - half - 4); x <= Math.ceil(cx + half + 4); x++) {
      const n = fbm(x / 7, y / 6, 12, 3)
      if (Math.abs(x - cx) / half + n * 0.7 > 1.1 || bayer(x, y) < 0.12) continue
      const lit = Math.max(0, 1 - rise / 30)
      p.set(x, y, mix(mix('#3a2626', '#7a5a52', n), '#c85a2a', lit * 0.55))
    }
  }
  ridge(p, 116, 30, 44, 6, '#4a1a14', '#6a2a1c')
  // the volcano
  const cone: [number, number][] = [[80, FLOOR], [186, 62], [196, 56], [214, 56], [224, 62], [330, FLOOR]]
  p.poly(cone, (x, y) => {
    const d = (x - 205) / 125
    const shade = d < -0.2 ? '#3a1a16' : d < 0.25 ? '#2c1512' : '#20100e'
    return bayer(x, y) < 0.15 && y > 100 ? '#1a0c0a' : shade
  })
  p.rect(188, 60, 34, 2, '#ffae3a')
  p.rect(194, 56, 22, 2, '#ffe07a')
  // lava streaks
  const r = rng(77)
  for (let s = 0; s < 8; s++) {
    let x = 196 + Math.floor(r() * 18)
    for (let y = 62; y < FLOOR - 6; y++) {
      if (r() > 0.62) x += r() > 0.5 ? 1 : -1
      const spread = (y - 56) * 0.45
      x = Math.max(205 - spread, Math.min(205 + spread, x))
      p.set(x, y, y % 9 < 6 ? '#ff7a1a' : '#ffcf4a')
      if (r() > 0.85) p.set(x + 1, y, '#a83a10')
    }
  }
  sprinkle(p, 70, 4, ['#ff9a3a', '#ffcf4a', '#ff5a1a'], 10, FLOOR - 4)
  // foreground boulders, rim-lit
  for (const [x, w, h] of [[-6, 54, 34], [270, 50, 30]] as const) {
    const rock = ['#0a0404', '#180a08', '#2a1512', '#3f2016', '#ff8a2a'].map(rgb)
    p.ell(x + w / 2, FLOOR - h / 3, w / 2, h / 1.5, rock)
  }
  // basalt floor with glowing cracks
  p.vgrad(0, FLOOR, BG_W, BG_H - FLOOR, ['#2a1512', '#160908'])
  p.rect(0, FLOOR, BG_W, 1, '#ff7a1a')
  for (let x = 0; x < BG_W; x += 38) {
    let cx = x
    for (let y = FLOOR + 2; y < BG_H; y++) {
      if (r() > 0.5) cx += r() > 0.5 ? 1 : -1
      p.set(cx, y, y % 4 < 3 ? '#ff7a1a' : '#ffcf4a')
    }
  }
  return p
}

function cosmos(): Pix {
  const p = new Pix(BG_W, BG_H)
  const deep = rgb('#05030f')
  const nebulaA = rgb('#3a1478')
  const nebulaB = rgb('#1a5a9a')
  const nebulaC = rgb('#a02a8a')
  for (let y = 0; y < FLOOR; y++) {
    for (let x = 0; x < BG_W; x++) {
      const n = fbm(x / 60, y / 40, 9, 4)
      const m = fbm(x / 50 + 30, y / 45 + 10, 3, 4)
      let c = deep
      const t = (n - 0.42) * 3.2 + (bayer(x, y) - 0.5) * 0.35
      if (t > 0) c = mix(deep, m > 0.5 ? nebulaC : nebulaA, Math.min(t, 1) > 0.5 ? 0.8 : 0.4)
      const u = (m - 0.55) * 3 + (bayer(x + 1, y) - 0.5) * 0.3
      if (u > 0.4) c = mix(c, nebulaB, 0.45)
      p.set(x, y, c)
    }
  }
  sprinkle(p, 130, 5, ['#ffffff', '#b8c8ff', '#ffe8b0', '#8090ff'], 0, FLOOR)
  const r = rng(8)
  for (let i = 0; i < 9; i++) {
    const x = 6 + Math.floor(r() * (BG_W - 12))
    const y = 6 + Math.floor(r() * 100)
    p.set(x, y, '#ffffff')
    p.rect(x - 2, y, 5, 1, '#c8d4ff')
    p.rect(x, y - 2, 1, 5, '#c8d4ff')
  }
  // ringed planet
  const cx = 78
  const cy = 62
  const R = 30
  const ring = (front: boolean) => {
    for (let y = cy - 14; y <= cy + 14; y++) {
      for (let x = cx - 58; x <= cx + 58; x++) {
        const dx = (x + 0.5 - cx) / 56
        const dy = (y + 0.5 - cy) / 11
        const d = dx * dx + dy * dy
        if (d < 0.42 || d > 1) continue
        if ((y >= cy) !== front) continue
        p.set(x, y, d < 0.62 ? '#e8c890' : d < 0.8 ? '#b88a5a' : '#8a6a4a')
      }
    }
  }
  ring(false)
  for (let y = cy - R; y <= cy + R; y++) {
    for (let x = cx - R; x <= cx + R; x++) {
      const nx = (x + 0.5 - cx) / R
      const ny = (y + 0.5 - cy) / R
      if (nx * nx + ny * ny > 1) continue
      const band = Math.sin(ny * 9 + vnoise(x / 9, y / 5, 4) * 3)
      const base = band > 0.2 ? '#d89a5a' : band > -0.4 ? '#b8683f' : '#8a3f34'
      const lit = -(nx * 0.6 + ny * 0.5) + (bayer(x, y) - 0.5) * 0.3
      p.set(x, y, lit > 0.35 ? mix(base, '#fff2c4', 0.3) : lit > -0.25 ? base : mix(base, '#1a0a30', 0.55))
    }
  }
  ring(true)
  // distant station arm on the right
  p.rect(212, 96, 96, 5, '#2a3050')
  p.rect(212, 96, 96, 1, '#5a6890')
  for (const x of [226, 262, 292]) {
    p.rect(x, 82, 8, 14, '#232a48')
    p.rect(x + 2, 86, 4, 3, '#ffd86e')
  }
  p.rect(304, 90, 4, 6, '#ff3050')
  // metal deck with hazard trim and light strip
  p.vgrad(0, FLOOR, BG_W, BG_H - FLOOR, ['#3a4068', '#232846'])
  p.rect(0, FLOOR, BG_W, 2, '#3ef0ff')
  halo(p, BG_W / 2, FLOOR, 2, 6, '#3ef0ff', 0.7)
  for (let x = 0; x < BG_W; x += 28) p.rect(x, FLOOR + 2, 1, BG_H - FLOOR - 2, '#161a30')
  for (let x = 0; x < BG_W; x += 8) p.rect(x, BG_H - 3, 4, 3, '#ffd34d')
  return p
}

const SCENES: Record<Level, () => Pix> = {
  N5: meadow,
  N4: bambooDusk,
  N3: neonCity,
  N2: volcano,
  N1: cosmos,
}

export const drawBackground = (level: Level) => SCENES[level]()
export const backgroundURL = (level: Level) => cachedURL(`bg:${level}`, () => SCENES[level]())
