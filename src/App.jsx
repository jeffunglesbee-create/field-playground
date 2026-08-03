import { onMount, onCleanup, lazy, Suspense, ErrorBoundary, createMemo, createSignal, Show } from 'solid-js'
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
import { QualityReport } from './components/QualityReport'
import { WcBracketOdds } from './components/WcBracketOdds'
import { BriefReconcile } from './components/BriefReconcile'
import { BriefArchive } from './components/BriefArchive'
import { AmbientWeek } from './components/AmbientWeek'
import { DramaLeaderboard } from './components/DramaLeaderboard'
import { TheUnwatched } from './components/TheUnwatched'
import { HallOfSurprises } from './components/HallOfSurprises'
import { BeatTheModel } from './components/BeatTheModel'
import { GameSymphonyArchive } from './components/GameSymphonyArchive'
import { RelaySystemStatus } from './components/RelaySystemStatus'
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
import { ReorderCost } from './components/ReorderCost'
import { ControlGroup } from './components/ControlGroup'
import { ScaleTest } from './components/ControlGroup/ScaleTest'
import { TeamAffinitySync } from './components/TeamAffinitySync'
import { WeatherPoll } from './components/WeatherPoll'
import { VenueGeocodeRace } from './components/VenueGeocodeRace'
import { ScoreTicker } from './components/ScoreTicker'
import { LiveWpTicker } from './components/LiveWpTicker'
import { DramaSoundscape } from './components/DramaSoundscape'
import { BsdXgPanel } from './components/BsdXgPanel'
import { LaLigaCrossCheck } from './components/LaLigaCrossCheck'
import { FutureFootballFixtures } from './components/FutureFootballFixtures'
import { BundesligaBroadcasters } from './components/BundesligaBroadcasters'
import { FieldIdentity } from './components/FieldIdentity'
import { Arbitrage } from './components/Arbitrage'
import { WcBracketTree } from './components/WcBracketTree'
import { Newspaper } from './components/Newspaper'
import { DeskModes } from './components/DeskModes'
import { TonightsPick } from './components/TonightsPick'
import { ToastLayer } from './components/Toast'
import { Tabs, tabId, panelId } from './components/Tabs'
import { refetchDesk, initUrlDateSync, initBroadcastDateSync, currentDate, deskStore } from './data/relay'
import { StandingRoomLazy as StandingRoom } from './lazyModules'
import { initOutcomesSync } from './data/outcomes'
import { initScoreEvents } from './data/scoreEvents'
import { initPresence } from './data/presence'
import { initTeamAffinitySync } from './data/teamAffinity'
import shared from './components/shared.module.css'
import styles from './App.module.css'

const POLL_INTERVAL_MS = 15000

// Top-level surfaces grouped by TYPE rather than build order. 44 sections
// accumulated in one flat scroll made "what kind of thing is this" a
// question you could only answer by reading each card -- these 7 tabs are
// that question answered up front. Counts are static (how many sections
// live under each tab), not live data, same optional-count support Tabs
// already has from PickEm/DayComparison.
//
// HealthPanel, AmbientPanel, and DeskCard are deliberately NOT tabbed.
// HealthPanel's own header comment already argues that a health check
// nobody has to click to see isn't monitoring anything -- putting it
// behind tab navigation would be exactly that mistake. AmbientPanel and
// DeskCard are the app's spine, not browsable content: they're tightly
// coupled to each other (AmbientPanel calls DeskCard's own
// setHighlightedGameId to cross-highlight a game) and to print.css's
// "picks on top, games below" export, which has always assumed both are
// simultaneously present -- a real constraint a single-active-tab system
// can't satisfy for two components that would otherwise land in
// different tabs (Journalism and Games). Keeping this trio always-on
// preserves that behavior with zero print.css changes needed.
const TOP_NAV_ID = 'app'

const TOP_TABS = [
  { key: 'games', label: 'Games', count: 15 },
  { key: 'picks', label: 'Picks', count: 7 },
  { key: 'stats', label: 'Stats', count: 7 },
  { key: 'journalism', label: 'Journalism', count: 2 },
  { key: 'social', label: 'Social', count: 3 },
  { key: 'system', label: 'System', count: 2 },
  { key: 'lab', label: 'Lab', count: 18 },
]

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

// Confirmed live 2026-07-26: a single un-guarded resource (WeatherPoll's
// weatherData, read directly in a <Show when={...}> before checking
// .error) threw on render, and with only ONE ErrorBoundary wrapping the
// entire app, that one throw blanked all 54 sections -- not just its
// own. The WeatherPoll bug itself is fixed (check .error before ever
// calling the resource accessor, same pattern as StandingRoom/
// DrillDown), but the architecture that let one section's failure
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
  const [activeTab, setActiveTab] = createSignal('games')

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
        <div class={styles.spine}>
          <SafeSection class={styles.healthPanel}>
            <HealthPanel />
          </SafeSection>
          <SafeSection class={styles.ambient}>
            <AmbientPanel />
          </SafeSection>
          <SafeSection class={styles.desk}>
            <DeskCard />
          </SafeSection>
        </div>

        <nav class={styles.tabNav}>
          <Tabs id={TOP_NAV_ID} tabs={TOP_TABS} active={activeTab} setActive={setActiveTab} hasPanel />
        </nav>

        {/* Unmounting an inactive tab's sections (rather than hiding them
            with CSS) is deliberate, not incidental -- it's the same
            pattern StandingRoom/PickEm/DayComparison/Stats already use
            for their own internal tabs, proven live in this repo. Every
            polling loop below (WeatherPoll's own setInterval,
            JournalismBrief's 5m cadence, etc.) genuinely stops via its own
            onCleanup while its tab isn't active, and resumes correctly on
            remount -- fewer live polls for content nobody's looking at,
            not a cosmetic hide. The same unmount also drops each
            section's own local state (ScoreFeed's filter selection,
            Multiview/ReorderCost's counters, LazyBoundaryDemo's already-
            loaded chunk), not just its poll loop -- switching away and
            back genuinely resets a section to its initial state. That's
            the same tradeoff StandingRoom/PickEm/DayComparison/Stats
            already accepted for their own tabs, worth naming here so it
            doesn't read as a bug later. */}
        <div
          class={styles.tabbedContent}
          role="tabpanel"
          id={panelId(TOP_NAV_ID, activeTab())}
          aria-labelledby={tabId(TOP_NAV_ID, activeTab())}
        >
          <Show when={activeTab() === 'games'}>
            {/* TonightsPick now leads the Games tab: it's the synthesis
                of what everything below separately measures (drama,
                line movement, cost to watch, weather) into one ranked
                answer to "what's worth watching" -- the actual product
                question, ahead of the mechanism demos that prove each
                signal is real. ScoreTicker follows: it is the only
                surface here that updates sub-second, so among the
                per-signal panels it's the one thing worth seeing
                first. Neither is added to the spine alongside
                HealthPanel/AmbientPanel/DeskCard -- that trio is a
                reasoned set (spine = always-on, tightly coupled,
                print.css depends on it) and quietly growing it would
                undo that reasoning. */}
            <SafeSection class={styles.tonightsPick}>
              <TonightsPick />
            </SafeSection>
            <SafeSection class={styles.scoreTicker}>
              <ScoreTicker />
            </SafeSection>
            <SafeSection class={styles.liveWpTicker}>
              <LiveWpTicker />
            </SafeSection>
            <SafeSection class={styles.dramaSoundscape}>
              <DramaSoundscape />
            </SafeSection>
            <SafeSection class={styles.gameSymphonyArchive}>
              <GameSymphonyArchive />
            </SafeSection>
            <SafeSection class={styles.bsdXgPanel}>
              <BsdXgPanel />
            </SafeSection>
            <SafeSection class={styles.arbitrage}>
              <Arbitrage />
            </SafeSection>
            <SafeSection class={styles.bundesligaBroadcasters}>
              <BundesligaBroadcasters />
            </SafeSection>
            <SafeSection class={styles.deskModes}>
              <DeskModes />
            </SafeSection>
            <SafeSection class={styles.drillDown}>
              <DrillDown />
            </SafeSection>
            <SafeSection class={styles.multiview}>
              <Multiview />
            </SafeSection>
            <SafeSection class={styles.weatherPoll}>
              <WeatherPoll />
            </SafeSection>
            <SafeSection class={styles.venueGeocodeRace}>
              <VenueGeocodeRace />
            </SafeSection>
            <SafeSection class={styles.scoreFeed}>
              <ScoreFeed />
            </SafeSection>
            <SafeSection class={styles.pollDeltaFeed}>
              <PollDeltaFeed />
            </SafeSection>
            <SafeSection class={styles.localNoteLayer}>
              <LocalNoteLayer />
            </SafeSection>
            <SafeSection class={styles.dayComparison}>
              <DayComparison />
            </SafeSection>
          </Show>

          <Show when={activeTab() === 'picks'}>
            <SafeSection class={styles.pickem}>
              <PickEm />
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
            <SafeSection class={styles.agreement}>
              <Agreement />
            </SafeSection>
            <SafeSection class={styles.crossCheck}>
              <CrossCheck />
            </SafeSection>
            <SafeSection class={styles.history}>
              <History />
            </SafeSection>
          </Show>

          <Show when={activeTab() === 'stats'}>
            <SafeSection class={styles.standingRoom}>
              <Suspense fallback={<div class={shared.skeleton}><div class={`${shared.bar} ${shared.wide}`} /><div class={`${shared.bar} ${shared.medium}`} /></div>}>
                <StandingRoom />
              </Suspense>
            </SafeSection>
            <SafeSection class={styles.wcBracketOdds}>
              <WcBracketOdds />
            </SafeSection>
            <SafeSection class={styles.laligaCrossCheck}>
              <LaLigaCrossCheck />
            </SafeSection>
            <SafeSection class={styles.futureFootballFixtures}>
              <FutureFootballFixtures />
            </SafeSection>
            <SafeSection class={styles.wcBracketTree}>
              <WcBracketTree />
            </SafeSection>
            <SafeSection class={styles.stats}>
              <Stats />
            </SafeSection>
            <SafeSection class={styles.multiDayStreak}>
              {streakTeam() && <MultiDayStreak baseDate={currentDate()} team={streakTeam()} />}
            </SafeSection>
            <SafeSection class={styles.multiDateTrend}>
              <MultiDateTrend />
            </SafeSection>
          </Show>

          <Show when={activeTab() === 'journalism'}>
            <SafeSection class={styles.newspaper}>
              <Newspaper />
            </SafeSection>
            <SafeSection class={styles.journalismBrief}>
              <JournalismBrief />
            </SafeSection>
            <SafeSection class={styles.qualityReport}>
              <QualityReport />
            </SafeSection>
            <SafeSection class={styles.briefReconcile}>
              <BriefReconcile />
            </SafeSection>
            <SafeSection class={styles.briefArchive}>
              <BriefArchive />
            </SafeSection>
            <SafeSection class={styles.ambientWeek}>
              <AmbientWeek />
            </SafeSection>
          </Show>

          <Show when={activeTab() === 'social'}>
            <SafeSection class={styles.presence}>
              <Presence />
            </SafeSection>
            <SafeSection class={styles.teamAffinitySync}>
              <TeamAffinitySync />
            </SafeSection>
            <SafeSection class={styles.dramaLeaderboard}>
              <DramaLeaderboard />
            </SafeSection>
            <SafeSection class={styles.theUnwatched}>
              <TheUnwatched />
            </SafeSection>
            <SafeSection class={styles.hallOfSurprises}>
              <HallOfSurprises />
            </SafeSection>
            <SafeSection class={styles.beatTheModel}>
              <BeatTheModel />
            </SafeSection>
            <SafeSection class={styles.ground}>
              <Ground />
            </SafeSection>
          </Show>

          <Show when={activeTab() === 'system'}>
            <SafeSection class={styles.relaySystemStatus}>
              <RelaySystemStatus />
            </SafeSection>
            <SafeSection class={styles.reactivePerfPanel}>
              <ReactivePerfPanel />
            </SafeSection>
            <SafeSection class={styles.latencyHistogram}>
              <LatencyHistogram />
            </SafeSection>
          </Show>

          <Show when={activeTab() === 'lab'}>
            <SafeSection class={styles.fieldIdentity}>
              <FieldIdentity />
            </SafeSection>
            <SafeSection class={styles.controlGroup}>
              <ControlGroup />
            </SafeSection>
            <SafeSection class={styles.scaleTest}>
              <ScaleTest />
            </SafeSection>
            <SafeSection class={styles.suspenseDemo}>
              <SuspenseDemo />
            </SafeSection>
            <SafeSection class={styles.createRootDemo}>
              <CreateRootDemo />
            </SafeSection>
            <SafeSection class={styles.errorBoundaryDemo}>
              <ErrorBoundaryDemo />
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
            <SafeSection class={styles.undoStackDemo}>
              <UndoStackDemo />
            </SafeSection>
            <SafeSection class={styles.workerBridgeDemo}>
              <WorkerBridgeDemo />
            </SafeSection>
            <SafeSection class={styles.replayDemo}>
              <ReplayDemo />
            </SafeSection>
            <SafeSection class={styles.reorderCost}>
              <ReorderCost />
            </SafeSection>
          </Show>
        </div>

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
