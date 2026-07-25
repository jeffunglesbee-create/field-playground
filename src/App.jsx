import { onMount, onCleanup, lazy, Suspense, ErrorBoundary, createMemo } from 'solid-js'
import { AmbientPanel } from './components/AmbientPanel'
import { DeskCard, initExtendedUrlSync } from './components/DeskCard'
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
import { ErrorBoundaryDemo } from './components/ErrorBoundaryDemo'
import { DrillDown } from './components/DrillDown'
import { TransitionDemo } from './components/TransitionDemo'
import { ContextDemo } from './components/ContextDemo'
import { SelectorDemo } from './components/SelectorDemo'
import { LazyBoundaryDemo } from './components/LazyBoundaryDemo'
import { PropsDemo } from './components/PropsDemo'
import { DateBrowserTransition } from './components/DateBrowserTransition'
import { ComputedDemo } from './components/ComputedDemo'
import { IndexArrayDemo } from './components/IndexArrayDemo'
import { PickStreak } from './components/PickStreak'
import { Calibration } from './components/Calibration'
import { CompareToRelay } from './components/CompareToRelay'
import { LocalNoteLayer } from './components/LocalNoteLayer'
import { MultiDateTrend } from './components/MultiDateTrend'
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
    initExtendedUrlSync()
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
          <ErrorBoundary fallback={err => <div style="font-size:11px;color:#c44;padding:8px 0">{err.message}</div>}>
            <Seasons />
          </ErrorBoundary>
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
      <section class={styles.errorBoundaryDemo}>
        <ErrorBoundaryDemo />
      </section>
      <section class={styles.drillDown}>
        <DrillDown />
      </section>
      <section class={styles.transitionDemo}>
        <TransitionDemo />
      </section>
      <section class={styles.contextDemo}>
        <ContextDemo />
      </section>
      <section class={styles.selectorDemo}>
        <SelectorDemo />
      </section>
      <section class={styles.lazyBoundaryDemo}>
        <LazyBoundaryDemo />
      </section>
      <section class={styles.propsDemo}>
        <PropsDemo />
      </section>
      <section class={styles.dateBrowserTransition}>
        <DateBrowserTransition />
      </section>
      <section class={styles.computedDemo}>
        <ComputedDemo />
      </section>
      <section class={styles.indexArrayDemo}>
        <IndexArrayDemo />
      </section>
      <section class={styles.pickStreak}>
        <PickStreak />
      </section>
      <section class={styles.calibration}>
        <Calibration />
      </section>
      <section class={styles.compareToRelay}>
        <CompareToRelay />
      </section>
      <section class={styles.localNoteLayer}>
        <LocalNoteLayer />
      </section>
      <section class={styles.multiDateTrend}>
        <MultiDateTrend />
      </section>
      <ToastLayer />
    </div>
  )
}
