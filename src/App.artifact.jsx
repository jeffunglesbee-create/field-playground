import { onMount, onCleanup, lazy, Suspense, ErrorBoundary, createMemo } from 'solid-js'
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
import { ErrorBoundaryDemo } from './components/ErrorBoundaryDemo'
import { DrillDown } from './components/DrillDown'
import { TransitionDemo } from './components/TransitionDemo'
import { ContextDemo } from './components/ContextDemo'
import { SelectorDemo } from './components/SelectorDemo'
import { LazyBoundaryDemo } from './components/LazyBoundaryDemo/index.artifact.jsx'
import { PropsDemo } from './components/PropsDemo'
import { DateBrowserTransition } from './components/DateBrowserTransition'
import { ComputedDemo } from './components/ComputedDemo'
import { IndexArrayDemo } from './components/IndexArrayDemo'
import { ToastLayer } from './components/Toast'
import { refetchDesk, initUrlDateSync, initBroadcastDateSync, currentDate, deskStore } from './data/relay'
import { initOutcomesSync } from './data/outcomes'
import shared from './components/shared.module.css'
import styles from './App.module.css'

// Artifact-specific entry point. Only real difference from App.jsx:
// Seasons below, and LazyBoundaryDemo's import (its own artifact variant,
// same pattern applied one level down for HeavyPanel). Everything else
// is identical -- this file exists so the standalone single-file
// artifact can be genuinely self-contained without needing to
// post-process Vite's chunked output after the fact.
import { Seasons as SeasonsComponent } from './components/Seasons'

const POLL_INTERVAL_MS = 15000

// lazy() only requires a function returning Promise<{default: Component}>
// -- it doesn't require that promise to come from a real dynamic
// import(). The actual thing being tested (does Suspense's fallback
// show while lazy's own promise is pending, does it compose with the
// skeleton pattern) still holds: lazy() introduces a microtask tick
// regardless of where the component reference came from, so Suspense
// still genuinely suspends briefly even though this promise resolves
// from an already-statically-imported reference instead of a real
// chunk download. Same primitive, same behavior under test, just no
// dynamic import for Vite to chunk in this build target.
const Seasons = lazy(() => Promise.resolve({ default: SeasonsComponent }))

export default function App() {
  onMount(() => {
    const handle = setInterval(() => { refetchDesk() }, POLL_INTERVAL_MS)
    onCleanup(() => clearInterval(handle))
    initUrlDateSync()
    initBroadcastDateSync()
    initOutcomesSync()
  })

  const streakTeam = createMemo(() => deskStore.games?.regular?.[0]?.home ?? null)

  return (
    <ErrorBoundary fallback={err => (
      <div style="padding:24px;font-family:monospace;color:#c44;white-space:pre-wrap">
        Something broke: {err?.message ?? String(err)}
      </div>
    )}>
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
        <ToastLayer />
      </div>
    </ErrorBoundary>
  )
}
