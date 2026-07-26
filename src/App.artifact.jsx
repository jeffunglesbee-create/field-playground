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

function sectionFallback(err, reset) {
  return (
    <div style="font-size:11px;color:#c44;padding:8px 0;white-space:pre-wrap">
      {err?.message ?? String(err)}
      <br />
      <button
        type="button"
        onClick={reset}
        style="margin-top:6px;font-size:10px;color:#c44;background:transparent;border:1px solid #c44;border-radius:4px;padding:3px 8px;cursor:pointer"
      >
        Retry
      </button>
    </div>
  )
}

// Same isolation fix as App.jsx: one ErrorBoundary per section instead of
// a single one wrapping the whole layout, so a future unguarded resource
// read degrades to just its own section rather than blanking everything.
function SafeSection(props) {
  return (
    <section class={props.class}>
      <ErrorBoundary fallback={sectionFallback}>{props.children}</ErrorBoundary>
    </section>
  )
}

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
        <SafeSection class={styles.ambient}>
          <AmbientPanel />
        </SafeSection>
        <SafeSection class={styles.desk}>
          <DeskCard />
        </SafeSection>
        <SafeSection class={styles.pickem}>
          <PickEm />
        </SafeSection>
        <SafeSection class={styles.seasons}>
          <Suspense fallback={<div class={shared.skeleton}><div class={`${shared.bar} ${shared.wide}`} /><div class={`${shared.bar} ${shared.medium}`} /></div>}>
            <Seasons />
          </Suspense>
        </SafeSection>
        <SafeSection class={styles.ground}>
          <Ground />
        </SafeSection>
        <SafeSection class={styles.dayComparison}>
          <DayComparison />
        </SafeSection>
        <SafeSection class={styles.suspenseDemo}>
          <SuspenseDemo />
        </SafeSection>
        <SafeSection class={styles.agreement}>
          <Agreement />
        </SafeSection>
        <SafeSection class={styles.crossCheck}>
          <CrossCheck />
        </SafeSection>
        <SafeSection class={styles.createRootDemo}>
          <CreateRootDemo />
        </SafeSection>
        <SafeSection class={styles.history}>
          <History />
        </SafeSection>
        <SafeSection class={styles.journalismBrief}>
          <JournalismBrief />
        </SafeSection>
        <SafeSection class={styles.multiDayStreak}>
          {streakTeam() && <MultiDayStreak baseDate={currentDate()} team={streakTeam()} />}
        </SafeSection>
        <SafeSection class={styles.errorBoundaryDemo}>
          <ErrorBoundaryDemo />
        </SafeSection>
        <SafeSection class={styles.drillDown}>
          <DrillDown />
        </SafeSection>
        <SafeSection class={styles.transitionDemo}>
          <TransitionDemo />
        </SafeSection>
        <SafeSection class={styles.contextDemo}>
          <ContextDemo />
        </SafeSection>
        <SafeSection class={styles.selectorDemo}>
          <SelectorDemo />
        </SafeSection>
        <SafeSection class={styles.lazyBoundaryDemo}>
          <LazyBoundaryDemo />
        </SafeSection>
        <SafeSection class={styles.propsDemo}>
          <PropsDemo />
        </SafeSection>
        <SafeSection class={styles.dateBrowserTransition}>
          <DateBrowserTransition />
        </SafeSection>
        <SafeSection class={styles.computedDemo}>
          <ComputedDemo />
        </SafeSection>
        <SafeSection class={styles.indexArrayDemo}>
          <IndexArrayDemo />
        </SafeSection>
        <ErrorBoundary fallback={sectionFallback}>
          <ToastLayer />
        </ErrorBoundary>
      </div>
    </ErrorBoundary>
  )
}
