import { For, Show, createSignal, createMemo } from 'solid-js'
import { deskStore, mlbStandings, mlsStandings } from '../../data/relay'
import styles from './StandingsDrawer.module.css'

// Production's gamecard has a collapsible "▼ Standings" control per game.
// This is a lazy per-row JOIN, not a new fetch: mlbStandings/mlsStandings
// are the exact same already-resident resources Seasons and Stats already
// hold, cross-referenced here against deskStore's own game list by team
// name. A createMemo (or any derived accessor) is never evaluated until
// something actually reads it -- before a row is ever expanded, this
// row's lookup literally never runs, no cost, and there is nothing here
// that could trigger a network request even if it did (both source
// resources are already fetched). Distinct from DrillDown (a genuinely
// NEW chained fetch, resource B sourced from resource A) -- this proves
// the complementary case: an ad-hoc join across two ALREADY-LIVE
// resources needs zero fetch machinery, just a lookup gated by whether
// anyone asked for it yet.

function allGames() {
  return [...(deskStore.games?.regular ?? []), ...(deskStore.games?.postseason ?? [])]
}

function gameStatus(g) {
  if (g.home_score === null) return 'pre'
  if (g.finalized_at) return g.went_to_ot ? 'final_ot' : 'final'
  return 'live'
}

function mlbLine(teamName) {
  if (mlbStandings.error) return null
  const rec = (mlbStandings()?.records ?? []).flatMap(r => r.teamRecords ?? []).find(t => t.team.name === teamName)
  if (!rec) return null
  const gb = rec.gamesBack === '-' ? 'leads division' : `${rec.gamesBack} GB`
  return `${gb} · WC ${rec.wildCardGamesBack} · ${rec.streak?.streakCode ?? ''}`
}

function mlsLine(teamName) {
  if (mlsStandings.error) return null
  const rec = (mlsStandings()?.tables?.[0]?.entries ?? []).find(t => t.team === teamName)
  if (!rec) return null
  return `${rec.wins}-${rec.draws}-${rec.losses} · GD ${rec.goals_difference > 0 ? '+' : ''}${rec.goals_difference} · ${rec.points} pts`
}

// {supported, line} rather than overloading null/undefined -- "this
// sport has no standings source wired into this playground at all" and
// "this specific team wasn't found in an otherwise-supported sport's
// current standings" are genuinely different states and read the same
// way if collapsed into one nullable value.
function standingInfo(sport, teamName) {
  if (sport === 'MLB') return { supported: true, line: mlbLine(teamName) }
  if (sport === 'MLS') return { supported: true, line: mlsLine(teamName) }
  return { supported: false, line: null }
}

function GameDrawerRow(props) {
  const [expanded, setExpanded] = createSignal(false)
  const g = () => props.game

  const homeInfo = createMemo(() => standingInfo(g().sport, g().home))
  const awayInfo = createMemo(() => standingInfo(g().sport, g().away))

  return (
    <div class={styles.row}>
      <button
        type="button"
        class={styles.rowHead}
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded()}
      >
        <span class={`${styles.dot} ${styles[gameStatus(g())]}`} />
        <span class={styles.matchup}>{g().away} @ {g().home}</span>
        <span class={styles.chevron}>{expanded() ? '▾' : '▸'}</span>
      </button>
      <Show when={expanded()}>
        <div class={styles.drawer}>
          <Show
            when={homeInfo().supported}
            fallback={<p class={styles.noSource}>No standings source wired for {g().sport} in this playground.</p>}
          >
            <div class={styles.teamLine}>
              <span class={styles.teamName}>{g().home}</span>
              <span class={styles.teamDetail}>{homeInfo().line ?? 'not found in current standings'}</span>
            </div>
            <div class={styles.teamLine}>
              <span class={styles.teamName}>{g().away}</span>
              <span class={styles.teamDetail}>{awayInfo().line ?? 'not found in current standings'}</span>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )
}

export function StandingsDrawer() {
  const games = createMemo(allGames)

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Standings Drawer</span>
        <span class={styles.sublabel}>per-game lookup, zero new fetch</span>
      </header>
      <p class={styles.note}>
        Same wcStandings/mlbStandings/mlsStandings resources Seasons and Stats already hold live —
        joined here against each real game's own home/away team names, computed only when a row is
        expanded. No new request; the data is already resident.
      </p>
      <Show when={games().length} fallback={<p class={styles.empty}>No games today.</p>}>
        <div class={styles.rowList}>
          <For each={games()}>{g => <GameDrawerRow game={g} />}</For>
        </div>
      </Show>
    </div>
  )
}
