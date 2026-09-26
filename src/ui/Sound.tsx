import { useEffect, useState } from 'react'
import { sfx } from '../audio/sfx'
import { music, type ThemeId } from '../audio/music'
import { getSound, setSound, subscribeSound } from '../audio/settings'
import { useApp } from '../store/app'

/** SFX / music switches, fixed in the corner of every screen. */
export function SoundControls() {
  const [s, setS] = useState(getSound)
  useEffect(() => subscribeSound(() => setS(getSound())), [])
  return (
    <div className="sound">
      <button className="small" aria-pressed={s.sfx} onClick={() => setSound({ sfx: !s.sfx })}>
        SFX {s.sfx ? 'ON' : 'OFF'}
      </button>
      <button className="small" aria-pressed={s.music} onClick={() => setSound({ music: !s.music })}>
        MUSIC {s.music ? 'ON' : 'OFF'}
      </button>
    </div>
  )
}

/** Picks the music for the current screen and clicks for every button. Renders nothing. */
export function SoundDirector() {
  const screen = useApp((s) => s.screen)
  const world = useApp((s) => s.world)
  const session = useApp((s) => s.session)

  const theme: ThemeId =
    screen === 'battle' && session ? (session.mode === 'boss' ? 'boss' : session.level) : world
  useEffect(() => music.play(theme), [theme])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('button')
      if (!btn) return
      if (btn.classList.contains('locked')) sfx.lock()
      else sfx.select()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  return null
}
