export interface SoundSettings {
  sfx: boolean
  music: boolean
}

const KEY = 'kanji-battle:sound'
const DEFAULTS: SoundSettings = { sfx: true, music: true }

function load(): SoundSettings {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    // storage blocked or corrupt: fall back to defaults
  }
  return { ...DEFAULTS }
}

let state = load()
const listeners = new Set<() => void>()

export const getSound = (): SoundSettings => state

export function setSound(patch: Partial<SoundSettings>) {
  state = { ...state, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // not fatal: the choice just will not survive a reload
  }
  listeners.forEach((fn) => fn())
}

export function subscribeSound(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
