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
import { Multiview } from './components/Multiview'
import { StandingsDrawer } from './components/StandingsDrawer'
import { ReorderCost } from './components/ReorderCost'
import { TeamAffinitySync } from './components/TeamAffinitySync'
import { WeatherPoll } from './components/WeatherPoll'
import { ToastLayer } from './components/Toast'
import { refetchDesk, initUrlDateSync, initBroadcastDateSync, currentDate, deskStore } from './data/relay'
import { SeasonsLazy as Seasons } from './lazyModules'
import { initOutcomesSync } from './data/outcomes'
import { initScoreEvents } from './data/scoreEvents'
import { initPresence } from './data/presence'
import { initTeamAffinitySync } from './data/teamAffinity'
import shared from './components/shared.module.css'
import styles from './App.module.css'

const POLL_INTERVAL_MS = 15000

function sectionFallback(err) {
  return (
    <div style="font-size:11px;color:#c44;padding:8px 0;white-space:pre-wrap">
      {err?.message ?? String(err)}
    </div>
  )
}

// Confirmed live 2026-07-26: a single un-guarded resource (WeatherPoll's
// weatherData, read directly in a <Show when={...}> before checking
// .error) threw on render, and with only ONE ErrorBoundary wrapping the
// entire app, that one throw blanked all 54 sections -- not just its
// own. The WeatherPoll bug itself is fixed (check .error before ever
// calling the resource accessor, same pattern as Seasons/DrillDown/
// StandingsDrawer), but the architecture that let one section's failure
// take down every other section is the actual root cause worth fixing
// too. Every section below now gets its OWN boundary: a future bug
// anywhere degrades to that one section showing its error message, with
// every other section continuing to render and poll normally.
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
    initExtendedUrlSync()
    initScoreEvents()
    initPresence()
    initTeamAffinitySync()
  })

  // MultiDayStreak needs a real team name to track -- dynamically read
  // from today's own first regular-season game rather than hardcoded,
  // so this doesn't silently break the moment the slate changes.
  const streakTeam = createMemo(() => deskStore.games?.regular?.[0]?.home ?? null)

  return (
    // Kept as the outermost safety net -- SafeSection isolates each
    // section from every OTHER section, but something thrown outside any
    // section (e.g. in App's own render body, or in ToastLayer/
    // CommandPalette below, which are deliberately global overlays, not
    // per-section) still needs somewhere to land.
    <ErrorBoundary fallback={err => (
      <div style="padding:24px;font-family:monospace;color:#c44;white-space:pre-wrap">
        Something broke: {err?.message ?? String(err)}
      </div>
    )}>
      <div class={styles.layout}>
        <SafeSection class={styles.healthPanel}>
          <HealthPanel />
        </SafeSection>
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
        <SafeSection class={styles.stats}>
          <Stats />
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
        <SafeSection class={styles.pickStreak}>
          <PickStreak />
        </SafeSection>
        <SafeSection class={styles.calibration}>
          <Calibration />
        </SafeSection>
        <SafeSection class={styles.compareToRelay}>
          <CompareToRelay />
        </SafeSection>
        <SafeSection class={styles.localNoteLayer}>
          <LocalNoteLayer />
        </SafeSection>
        <SafeSection class={styles.multiDateTrend}>
          <MultiDateTrend />
        </SafeSection>
        <SafeSection class={styles.undoStackDemo}>
          <UndoStackDemo />
        </SafeSection>
        <SafeSection class={styles.workerBridgeDemo}>
          <WorkerBridgeDemo />
        </SafeSection>
        <SafeSection class={styles.pollDeltaFeed}>
          <PollDeltaFeed />
        </SafeSection>
        <SafeSection class={styles.replayDemo}>
          <ReplayDemo />
        </SafeSection>
        <SafeSection class={styles.latencyHistogram}>
          <LatencyHistogram />
        </SafeSection>
        <SafeSection class={styles.presence}>
          <Presence />
        </SafeSection>
        <SafeSection class={styles.scoreFeed}>
          <ScoreFeed />
        </SafeSection>
        <SafeSection class={styles.reactivePerfPanel}>
          <ReactivePerfPanel />
        </SafeSection>
        <SafeSection class={styles.multiview}>
          <Multiview />
        </SafeSection>
        <SafeSection class={styles.standingsDrawer}>
          <StandingsDrawer />
        </SafeSection>
        <SafeSection class={styles.reorderCost}>
          <ReorderCost />
        </SafeSection>
        <SafeSection class={styles.teamAffinitySync}>
          <TeamAffinitySync />
        </SafeSection>
        <SafeSection class={styles.weatherPoll}>
          <WeatherPoll />
        </SafeSection>
        <ErrorBoundary fallback={sectionFallback}>
          <ToastLayer />
        </ErrorBoundary>
        <ErrorBoundary fallback={sectionFallback}>
          <CommandPalette />
        </ErrorBoundary>
      </div>
    </ErrorBoundary>
  )
}
