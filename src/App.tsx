import { useEffect, useMemo } from 'react'
import { partnerLookup } from './progress/confusions'
import { useApp } from './store/app'
import { Battle } from './ui/Battle'
import { Duel } from './ui/Duel'
import { CollectionScreen } from './ui/Collection'
import { MapScreen } from './ui/Map'
import { SoundControls, SoundDirector } from './ui/Sound'
import { StatsScreen } from './ui/Stats'
import { SummaryScreen } from './ui/Summary'

export function App() {
  const { ready, screen, session, progress, init, finish, saveFloor, exitToMap } = useApp()
  useEffect(() => {
    init()
  }, [init])
  // Confusions are read once when a floor starts; they do not change mid-battle.
  const partnersOf = useMemo(() => partnerLookup(progress), [session]) // eslint-disable-line react-hooks/exhaustive-deps

  let body
  if (!ready) body = <div className="screen title"><p className="pixel-text blink">LOADING…</p></div>
  else if (screen === 'battle' && session?.mode === 'boss') body = <Duel key={session.id} session={session} onFinish={finish} />
  else if (screen === 'battle' && session) body = <Battle key={session.id} session={session} partnersOf={partnersOf} onFinish={finish} onSave={saveFloor} onExit={exitToMap} />
  else if (screen === 'summary') body = <SummaryScreen />
  else if (screen === 'collection') body = <CollectionScreen />
  else if (screen === 'stats') body = <StatsScreen />
  else body = <MapScreen />

  return (
    <>
      {body}
      <SoundDirector />
      <SoundControls />
    </>
  )
}
