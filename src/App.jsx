import { onMount, onCleanup, lazy, Suspense, createMemo } from 'solid-js'
import { AmbientPanel } from './components/AmbientPanel'
import { DeskCard } from './components/DeskCard'
import { PickEm } from './components/PickEm'
import { Ground } from './components/Ground'
import { DayComparison } from './components/DayComparison'
import { SuspenseDemo } from './components/SuspenseDemo'
import { Agreement } from './components/Agreement'
import { CrossCheck } from './components/CrossCheck'
import { CreateRootDemo } from './components/CreateRootDemo'
import { History } from './components/History'
import { JournalismBrief } from './components/JournalismBrief'
import { MultiDayStreak } from './components/MultiDayStreak'
import { ToastLayer } from './components/Toast'
import { refetchDesk, initUrlDateSync, initBroadcastDateSync, currentDate, deskStore } from './data/relay'
import { initOutcomesSync } from './data/outcomes'
import shared from './components/shared.module.css'
import styles from './App.module.css'

const POLL_INTERVAL_MS = 15000

const Seasons = lazy(() => import('./components/Seasons').then(m => ({ default: m.Seasons })))

export default function App() {
  onMount(() => {
    const handle = setInterval(() => { refetchDesk() }, POLL_INTERVAL_MS)
    onCleanup(() => clearInterval(handle))
    initUrlDateSync()
    initBroadcastDateSync()
    initOutcomesSync()
  })

  // MultiDayStreak needs a real team name to track -- dynamically read
  // from today's own first regular-season game rather than hardcoded,
  // so this doesn't silently break the moment the slate changes.
  const streakTeam = createMemo(() => deskStore.games?.regular?.[0]?.home ?? null)

  return (
    <div class={styles.layout}>
      <section class={styles.ambient}>
        <AmbientPanel />
      </section>
      <section class={styles.desk}>
        <DeskCard />
      </section>
      <section class={styles.pickem}>
        <PickEm />
      </section>
      <section class={styles.seasons}>
        <Suspense fallback={<div class={shared.skeleton}><div class={`${shared.bar} ${shared.wide}`} /><div class={`${shared.bar} ${shared.medium}`} /></div>}>
          <Seasons />
        </Suspense>
      </section>
      <section class={styles.ground}>
        <Ground />
      </section>
      <section class={styles.dayComparison}>
        <DayComparison />
      </section>
      <section class={styles.suspenseDemo}>
        <SuspenseDemo />
      </section>
      <section class={styles.agreement}>
        <Agreement />
      </section>
      <section class={styles.crossCheck}>
        <CrossCheck />
      </section>
      <section class={styles.createRootDemo}>
        <CreateRootDemo />
      </section>
      <section class={styles.history}>
        <History />
      </section>
      <section class={styles.journalismBrief}>
        <JournalismBrief />
      </section>
      <section class={styles.multiDayStreak}>
        {streakTeam() && <MultiDayStreak baseDate={currentDate()} team={streakTeam()} />}
      </section>
      <ToastLayer />
    </div>
  )
}
