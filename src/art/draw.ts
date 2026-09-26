/**
 * Tiny pixel-art toolkit. Everything draws into a plain RGBA buffer (no DOM),
 * so sprites can be unit tested in node and turned into a PNG data URL once
 * in the browser.
 */
export type RGB = [number, number, number]

const parsed = new Map<string, RGB>()
export function rgb(c: string | RGB): RGB {
  if (typeof c !== 'string') return c
  let v = parsed.get(c)
  if (!v) {
    v = [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
    parsed.set(c, v)
  }
  return v
}

export function mix(a: string | RGB, b: string | RGB, t: number): RGB {
  const A = rgb(a)
  const B = rgb(b)
  return [
    Math.round(A[0] + (B[0] - A[0]) * t),
    Math.round(A[1] + (B[1] - A[1]) * t),
    Math.round(A[2] + (B[2] - A[2]) * t),
  ]
}

/** 5 tones: [outline, shade, base, light, highlight]. Shadows lean violet, lights lean warm. */
export function ramp(base: string | RGB): RGB[] {
  return [
    mix(base, '#120a20', 0.74),
    mix(base, '#2a1858', 0.4),
    rgb(base),
    mix(base, '#fff2c4', 0.3),
    mix(base, '#fff8e0', 0.62),
  ]
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
/** Ordered-dither threshold in (0,1). */
export const bayer = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16

export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(x: number, y: number, seed: number) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2147483647)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const smooth = (t: number) => t * t * (3 - 2 * t)

export function vnoise(x: number, y: number, seed = 1) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = smooth(x - xi)
  const yf = smooth(y - yi)
  return lerp(
    lerp(hash(xi, yi, seed), hash(xi + 1, yi, seed), xf),
    lerp(hash(xi, yi + 1, seed), hash(xi + 1, yi + 1, seed), xf),
    yf,
  )
}

export function fbm(x: number, y: number, seed = 1, octaves = 4) {
  let sum = 0
  let amp = 0.5
  let f = 1
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(x * f, y * f, seed + i * 17)
    amp /= 2
    f *= 2
  }
  return sum
}

export class Pix {
  readonly w: number
  readonly h: number
  readonly data: Uint8ClampedArray<ArrayBuffer>

  constructor(w: number, h: number) {
    this.w = w
    this.h = h
    this.data = new Uint8ClampedArray(new ArrayBuffer(w * h * 4))
  }

  set(x: number, y: number, c: string | RGB) {
    x = Math.floor(x)
    y = Math.floor(y)
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
    const [r, g, b] = rgb(c)
    const i = (y * this.w + x) * 4
    this.data[i] = r
    this.data[i + 1] = g
    this.data[i + 2] = b
    this.data[i + 3] = 255
  }

  get(x: number, y: number): RGB | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null
    const i = (y * this.w + x) * 4
    return this.data[i + 3] ? [this.data[i], this.data[i + 1], this.data[i + 2]] : null
  }

  rect(x: number, y: number, w: number, h: number, c: string | RGB) {
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) this.set(x + xx, y + yy, c)
  }

  /** Vertical gradient through `colors`, dithered so it stays crisp pixel art. */
  vgrad(x: number, y: number, w: number, h: number, colors: string[]) {
    for (let yy = 0; yy < h; yy++) {
      const t = (yy / Math.max(h - 1, 1)) * (colors.length - 1)
      const i = Math.min(Math.floor(t), colors.length - 2)
      const f = t - i
      for (let xx = 0; xx < w; xx++) {
        this.set(x + xx, y + yy, bayer(x + xx, y + yy) < f ? colors[i + 1] : colors[i])
      }
    }
  }

  /** Flat filled ellipse. */
  disc(cx: number, cy: number, rx: number, ry: number, c: string | RGB) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx
        const dy = (y + 0.5 - cy) / ry
        if (dx * dx + dy * dy <= 1) this.set(x, y, c)
      }
    }
  }

  /** Shaded, outlined ellipse lit from the top-left. */
  ell(cx: number, cy: number, rx: number, ry: number, tones: RGB[], outline = true) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx
        const dy = (y + 0.5 - cy) / ry
        if (dx * dx + dy * dy > 1) continue
        if (outline) {
          const ix = (x + 0.5 - cx) / Math.max(rx - 1, 0.5)
          const iy = (y + 0.5 - cy) / Math.max(ry - 1, 0.5)
          if (ix * ix + iy * iy > 1) {
            this.set(x, y, tones[0])
            continue
          }
        }
        const d = -(dx * 0.55 + dy * 0.75) + (bayer(x, y) - 0.5) * 0.22
        this.set(x, y, tones[d > 0.6 ? 4 : d > 0.2 ? 3 : d > -0.35 ? 2 : 1])
      }
    }
  }

  /** Bevelled, outlined box: bright top-left edge, dark bottom-right, dithered lower shade. */
  box(x: number, y: number, w: number, h: number, tones: RGB[], round = 1) {
    const x1 = x + w - 1
    const y1 = y + h - 1
    for (let yy = y; yy <= y1; yy++) {
      for (let xx = x; xx <= x1; xx++) {
        const cx = Math.min(xx - x, x1 - xx)
        const cy = Math.min(yy - y, y1 - yy)
        if (cx + cy < round) continue
        if (cx === 0 || cy === 0 || cx + cy === round) {
          this.set(xx, yy, tones[0])
          continue
        }
        const top = yy - y
        const left = xx - x
        const bottom = y1 - yy
        const right = x1 - xx
        let t = 2
        const v = top / h
        if (v > 0.85) t = 1
        else if (v > 0.68) t = (xx + yy) & 1 ? 2 : 1
        if (top === 1 || left === 1) t = 3
        if (bottom === 1 || right === 1) t = 1
        if (top === 1 && left === 1) t = 4
        this.set(xx, yy, tones[t])
      }
    }
  }

  /** Fill an arbitrary polygon; `color` may vary per pixel. */
  poly(pts: [number, number][], color: (x: number, y: number) => string | RGB | null) {
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
        const px = x + 0.5
        const py = y + 0.5
        let inside = false
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i]
          const [xj, yj] = pts[j]
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
        }
        if (!inside) continue
        const c = color(x, y)
        if (c) this.set(x, y, c)
      }
    }
  }

  /** Render to a canvas (browser only). */
  toCanvas(): HTMLCanvasElement {
    const c = document.createElement('canvas')
    c.width = this.w
    c.height = this.h
    const img = new ImageData(this.data, this.w, this.h)
    c.getContext('2d')!.putImageData(img, 0, 0)
    return c
  }

  toURL(): string {
    return this.toCanvas().toDataURL('image/png')
  }
}

const urlCache = new Map<string, string>()
/** Build a sprite once per key and reuse its data URL. */
export function cachedURL(key: string, build: () => Pix): string {
  let url = urlCache.get(key)
  if (!url) {
    url = build().toURL()
    urlCache.set(key, url)
  }
  return url
}
