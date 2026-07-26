import { onMount, onCleanup, lazy, Suspense, ErrorBoundary, createMemo } from 'solid-js'
import { AmbientPanel } from './components/AmbientPanel'
import { DeskCard, initExtendedUrlSync } from './components/DeskCard'
import { PickEm } from './components/PickEm'
import { Stats } from './components/Stats'
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
import { UndoStackDemo } from './components/UndoStackDemo'
import { WorkerBridgeDemo } from './components/WorkerBridgeDemo'
import { PollDeltaFeed } from './components/PollDeltaFeed'
import { ReplayDemo } from './components/ReplayDemo'
import { LatencyHistogram } from './components/LatencyHistogram'
import { HealthPanel } from './components/HealthPanel'
import { CommandPalette } from './components/CommandPalette'
import { Presence } from './components/Presence'
import { ScoreFeed } from './components/ScoreFeed'
import { ReactivePerfPanel } from './components/ReactivePerfPanel'
import { ToastLayer } from './components/Toast'
import { refetchDesk, initUrlDateSync, initBroadcastDateSync, currentDate, deskStore } from './data/relay'
import { SeasonsLazy as Seasons } from './lazyModules'
import { initOutcomesSync } from './data/outcomes'
import { initScoreEvents } from './data/scoreEvents'
import { initPresence } from './data/presence'
import shared from './components/shared.module.css'
import styles from './App.module.css'

const POLL_INTERVAL_MS = 15000

export default function App() {
  onMount(() => {
    const handle = setInterval(() => { refetchDesk() }, POLL_INTERVAL_MS)
    onCleanup(() => clearInterval(handle))
    initUrlDateSync()
    initBroadcastDateSync()
    initOutcomesSync()
    initExtendedUrlSync()
    initScoreEvents()
    initPresence()
  })

  // MultiDayStreak needs a real team name to track -- dynamically read
  // from today's own first regular-season game rather than hardcoded,
  // so this doesn't silently break the moment the slate changes.
  const streakTeam = createMemo(() => deskStore.games?.regular?.[0]?.home ?? null)

  return (
    <ErrorBoundary fallback={err => (
      <div style="padding:24px;font-family:monospace;color:#c44;white-space:pre-wrap">
        Something broke: {err?.message ?? String(err)}
      </div>
    )}>
      <div class={styles.layout}>
        <section class={styles.healthPanel}>
          <HealthPanel />
        </section>
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
        <section class={styles.stats}>
          <Stats />
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
        <section class={styles.undoStackDemo}>
          <UndoStackDemo />
        </section>
        <section class={styles.workerBridgeDemo}>
          <WorkerBridgeDemo />
        </section>
        <section class={styles.pollDeltaFeed}>
          <PollDeltaFeed />
        </section>
        <section class={styles.replayDemo}>
          <ReplayDemo />
        </section>
        <section class={styles.latencyHistogram}>
          <LatencyHistogram />
        </section>
        <section class={styles.presence}>
          <Presence />
        </section>
        <section class={styles.scoreFeed}>
          <ScoreFeed />
        </section>
        <section class={styles.reactivePerfPanel}>
          <ReactivePerfPanel />
        </section>
        <ToastLayer />
        <CommandPalette />
      </div>
    </ErrorBoundary>
  )
}
