import { Show, For, createMemo, onMount } from 'solid-js'
import { createStore } from 'solid-js/store'
import { deskData, deskStore } from '../../data/relay'
import styles from './DeskCard.module.css'
import shared from '../shared.module.css'

function Skeleton() {
  return (
    <div class={shared.skeleton}>
      <div class={`${shared.bar} ${shared.wide}`} />
      <div class={`${shared.bar} ${shared.medium}`} />
      <div class={`${shared.bar} ${shared.wide}`} />
      <div class={`${shared.bar} ${shared.narrow}`} />
      <div class={`${shared.bar} ${shared.medium}`} />
    </div>
  )
}

function gameStatus(g) {
  if (g.home_score === null) return 'pre'
  if (g.finalized_at) return g.went_to_ot ? 'final_ot' : 'final'
  return 'live'
}

// Individual-athlete sports (golf confirmed live; may not be the only
// one) don't have a home/away TEAM matchup at all -- checked the real
// relay payload rather than guess: sport is 'golf' (lowercase), home
// holds the tournament name, away holds the round label ("R2"),
// away_score is genuinely, permanently null, and there's already a
// real human-readable summary in `note` ("Ben Kohles -11") that this
// component wasn't reading at all. This is what produced the literal
// "null–11" text -- away_score interpolated as the string "null", not
// a missing-data edge case, a wrong data-model assumption.
const NON_MATCHUP_SPORTS = new Set(['golf'])

// Live-reconciliation instrumentation (EXPERIMENT-live-reconciliation.md):
// a real, per-id mount counter, not a console.log someone has to remember to
// open devtools for. If reconciliation is working, every game's count stays
// at 1 across every poll cycle, forever, no matter how many times its score
// changes. If it climbs, GameRow is remounting instead of updating in place.
const mountCounts = {}

// Collapsible sport groups (Claude Code's suggestion, 2026-07-24). The real
// risk: `grouped()` below does Object.entries(map), producing brand-new
// [sport, games] tuple references on every poll -- <For> keys by reference
// by default (same fact the live-reconciliation experiment already
// confirmed), so a signal owned locally inside SportGroup would get wiped
// every 15s along with the remount. Fix: expansion state lives here, in a
// module-level store keyed by sport NAME (a stable string, immune to
// grouped()'s reference churn), not inside the component that re-renders.
const [collapsed, setCollapsed] = createStore({})

function toggleGroup(sport) {
  setCollapsed(sport, c => !c)
}

function GameRow(props) {
  const g = () => props.game
  const status = () => gameStatus(g())
  const isIndividual = () => NON_MATCHUP_SPORTS.has(g().sport)
  const scoreStr = () => `${g().away_score}–${g().home_score}`

  onMount(() => {
    const id = g().id
    mountCounts[id] = (mountCounts[id] || 0) + 1
    if (import.meta.env.DEV) {
      console.log(`[reconcile-check] GameRow mounted: ${id} (mount #${mountCounts[id]})`)
    }
  })

  return (
    <div class={styles.gameRow}>
      <span class={`${styles.statusDot} ${styles[status()]}`} />
      <span class={styles.matchup}>
        <Show when={isIndividual()} fallback={<>{g().away} @ {g().home}</>}>
          {g().home} — {g().away}
        </Show>
      </span>
      <span class={styles.scoreArea}>
        <Show
          when={!isIndividual()}
          fallback={
            <span class={styles.finalScore}>
              {g().note || (g().home_score != null ? `${g().home_score > 0 ? '+' : ''}${g().home_score}` : '—')}
            </span>
          }
        >
          <Show when={status() === 'pre'} fallback={
            <Show when={status() === 'live'} fallback={
              <>
                <span class={styles.finalScore}>{scoreStr()}</span>
                <span class={styles.badge}>{status() === 'final_ot' ? 'F/OT' : 'F'}</span>
              </>
            }>
              <span class={styles.liveScore}>{scoreStr()}</span>
            </Show>
          }>
            <span class={styles.pre}>—</span>
          </Show>
        </Show>
      </span>
      <Show when={g().venue}>
        <span class={styles.venue}>{g().venue}</span>
      </Show>
      <Show when={import.meta.env.DEV}>
        <span class={styles.mountDebug} title="mount count -- should never exceed 1 if reconciliation is working">
          m{mountCounts[g().id] || 1}
        </span>
      </Show>
    </div>
  )
}

function SportGroup(props) {
  const isCollapsed = () => !!collapsed[props.sport]
  return (
    <div class={styles.sportGroup}>
      <div
        class={styles.sportLabel}
        onClick={() => toggleGroup(props.sport)}
        role="button"
        tabIndex={0}
      >
        <span class={styles.collapseIcon}>{isCollapsed() ? '▸' : '▾'}</span>
        {props.sport}
        <span class={styles.groupCount}>{props.games.length}</span>
      </div>
      <Show when={!isCollapsed()}>
        <For each={props.games}>{game => <GameRow game={game} />}</For>
      </Show>
    </div>
  )
}

function Content() {
  const allGames = createMemo(() => [
    ...(deskStore.games?.regular ?? []),
    ...(deskStore.games?.postseason ?? []),
  ])

  const grouped = createMemo(() => {
    const map = {}
    for (const g of allGames()) {
      if (!map[g.sport]) map[g.sport] = []
      map[g.sport].push(g)
    }
    return Object.entries(map)
  })

  return (
    <div>
      <header class={styles.header}>
        <span class={styles.label}>Desk</span>
        <span class={styles.dateMeta}>{deskStore.date}</span>
      </header>

      <Show when={grouped().length} fallback={<p class={styles.empty}>No games today.</p>}>
        <div class={styles.gameList}>
          <For each={grouped()}>
            {([sport, games]) => <SportGroup sport={sport} games={games} />}
          </For>
        </div>
      </Show>
    </div>
  )
}

export function DeskCard() {
  // Was: <Switch><Match when={deskData.loading}>. createResource's
  // .loading flips true on EVERY refetch by default, not just the first
  // load -- meaning Content (and every GameRow inside it) was unmounting
  // and remounting on every single poll, regardless of whether
  // deskStore's own reconcile() was working correctly underneath. This
  // masked the real answer this whole experiment exists to measure.
  // Fixed: check deskData() (the resolved VALUE) instead of .loading.
  // The value stays truthy across a refetch -- Content only unmounts on
  // the genuine first load, before any data has ever resolved.
  return (
    <div class={styles.root}>
      <Show when={deskData.error}>
        <p class={styles.error}>{String(deskData.error)}</p>
      </Show>
      <Show when={!deskData.error}>
        <Show when={deskData()} fallback={<Skeleton />}>
          <Content />
        </Show>
      </Show>
    </div>
  )
}
