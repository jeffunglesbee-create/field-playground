import { For, Show, createMemo, createSignal } from 'solid-js'
import { wcStandings, mlbStandings, mlsStandings } from '../../data/relay'
import { PARK_FACTORS } from '../../data/parkFactors'
import { UMPIRE_WATCH, UMP_WATCH_THRESHOLD } from '../../data/umpireWatch'
import { Tabs } from '../Tabs'
import styles from './Stats.module.css'

// Production's real Stats tab (jubilant-bassoon's renderStatsSection) is a
// cross-sport analytics surface with two genuinely different content
// shapes: cross-game LEADERBOARDS (MLB Pythagorean gap, NFL CPOE, MLS
// second-assist share/shot-selection/counter-attacks/cross-accuracy, each
// top-8 sorted by a computed metric) and a separate "Today's Games"
// PER-GAME sub-section (scouting report, standings, milestone alerts, BSD
// pitch, comeback probability) that deliberately does NOT force per-game
// content into the leaderboard shape -- confirmed directly from
// docs/CC-CMD-2026-07-19-bottom-sheet-stats-reconciliation.md in the
// production repo, read via FIELD_Handoff before writing any of this.
//
// This reproduces the LEADERBOARD-STYLE half only, honestly scoped. The
// per-game scouting-report content and MLS's real novel metrics (second-
// assist share, shot-selection quality, counter-attacks, cross accuracy)
// depend on relay endpoints not confirmed reachable from here --
// /mls/stats/team-metrics is not on FIELD_Handoff's self-probe allow-list,
// and per-game scouting data has no confirmed source in this repo at all.
// Building against an unverified shape would repeat the exact mistake
// production's own carry-forward note warns about ("this session
// repeatedly proved that assuming a data shape from a name is wrong").
// What IS real and tested here: the same wcStandings/mlbStandings/
// mlsStandings resources Seasons already proves live, recomposed into a
// genuinely different shape -- a ranked CROSS-GAME leaderboard instead of
// a per-division/per-conference table. That recomposition (a createMemo
// flattening three independent resources into one ranked list) is new to
// this repo; nothing here fabricates data production doesn't serve.
//
// Park factor and ump watch (added 2026-07-26, on direct request to check
// FIELD_Handoff for real values): both are static baked JS constants
// inside jubilant-bassoon/index.html (PARK_FACTORS, UMPIRE_ABS_RATINGS --
// confirmed via CODE_MAP.json), not served over any field-relay-nba route,
// so they can't be live resources like weather.js's Open-Meteo fetch --
// see src/data/parkFactors.js and src/data/umpireWatch.js for the full
// source trail. Neither dataset overlaps this repo's own 3-team MLB mock
// slate (Phillies/Yankees/Rangers), so these render as a small reference
// leaderboard of confirmed real values, explicitly labeled as such rather
// than presented as if they described today's games.

function parseStreak(code) {
  const m = String(code ?? '').match(/^([WL])(\d+)$/)
  if (!m) return { kind: null, length: 0 }
  return { kind: m[1] === 'W' ? 'win' : 'loss', length: Number(m[2]) }
}

function LeaderRow(props) {
  const [expanded, setExpanded] = createSignal(false)
  return (
    <div class={styles.leaderRow}>
      <button
        type="button"
        class={styles.leaderMain}
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded()}
      >
        <span class={styles.leaderRank}>{props.rank}</span>
        <span class={styles.leaderName}>{props.name}</span>
        <span class={styles.leaderMetric}>{props.metric}</span>
      </button>
      <Show when={expanded()}>
        <div class={styles.leaderDetail}>
          <For each={props.detail}>
            {d => (
              <div class={styles.detailRow}>
                <span class={styles.detailLabel}>{d.label}</span>
                <span class={styles.detailValue}>{d.value}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

function LeaderboardSection(props) {
  return (
    <Show when={props.rows().length} fallback={<p class={styles.empty}>{props.emptyText}</p>}>
      <div class={styles.sectionLabel}>{props.title}</div>
      <div class={styles.leaderList}>
        <For each={props.rows()}>{(row, i) => <LeaderRow rank={i() + 1} name={row.name} metric={row.metric} detail={row.detail} />}</For>
      </div>
    </Show>
  )
}

function MlbLeaders() {
  const records = createMemo(() => mlbStandings.error ? [] : (mlbStandings()?.records ?? []))
  const allTeams = createMemo(() => records().flatMap(r => r.teamRecords ?? []))
  const streaksOfKind = kind => createMemo(() =>
    allTeams()
      .map(t => ({ t, s: parseStreak(t.streak?.streakCode) }))
      .filter(x => x.s.kind === kind)
      .sort((a, b) => b.s.length - a.s.length)
      .slice(0, 8)
      .map(x => ({
        name: x.t.team.name,
        metric: `${kind === 'win' ? 'W' : 'L'}${x.s.length}`,
        detail: [
          { label: 'games back', value: x.t.gamesBack },
          { label: 'wild card gb', value: x.t.wildCardGamesBack },
        ],
      }))
  )
  const winStreaks = streaksOfKind('win')
  const lossStreaks = streaksOfKind('loss')

  const parkFactorLeaders = () =>
    [...PARK_FACTORS]
      .sort((a, b) => b.runsPct - a.runsPct)
      .map(p => ({
        name: p.venue,
        metric: `${p.runsPct > 0 ? '+' : ''}${p.runsPct}% runs${p.badge ? ` · ${p.badge}` : ''}`,
        detail: [
          { label: 'team', value: p.team },
          { label: 'hr factor', value: p.hrFactor ?? 'not confirmed' },
        ],
      }))

  const umpWatchLeaders = () =>
    [...UMPIRE_WATCH]
      .sort((a, b) => b.rate - a.rate)
      .map(u => ({
        name: u.name,
        metric: `${Math.round(u.rate * 100)}% overturn${u.rate >= UMP_WATCH_THRESHOLD ? ' · UMP WATCH' : ''}`,
        detail: [
          { label: 'record', value: u.record ?? 'not confirmed' },
          { label: 'weakness', value: u.weakness },
        ],
      }))

  return (
    <>
      <Show when={records().length} fallback={<p class={styles.empty}>{mlbStandings.error ? 'Unable to load MLB standings.' : 'Loading…'}</p>}>
        <LeaderboardSection title="Longest active win streaks" rows={winStreaks} emptyText="No active win streaks." />
        <LeaderboardSection title="Longest active losing streaks" rows={lossStreaks} emptyText="No active losing streaks." />
      </Show>
      <LeaderboardSection
        title="Park factor -- confirmed real values, not today's slate"
        rows={parkFactorLeaders}
        emptyText="No data."
      />
      <LeaderboardSection
        title="Ump watch -- confirmed real values, ≥65% overturn flagged"
        rows={umpWatchLeaders}
        emptyText="No data."
      />
    </>
  )
}

function MlsLeaders() {
  const entries = createMemo(() => mlsStandings.error ? [] : (mlsStandings()?.tables?.[0]?.entries ?? []))
  const goalDiffLeaders = createMemo(() =>
    [...entries()]
      .sort((a, b) => b.goals_difference - a.goals_difference)
      .slice(0, 8)
      .map(t => ({
        name: t.team,
        metric: `${t.goals_difference > 0 ? '+' : ''}${t.goals_difference}`,
        detail: [
          { label: 'record', value: `${t.wins}-${t.draws}-${t.losses}` },
          { label: 'points', value: t.points },
        ],
      }))
  )

  return (
    <Show when={entries().length} fallback={<p class={styles.empty}>{mlsStandings.error ? 'Unable to load MLS standings.' : 'Loading…'}</p>}>
      <LeaderboardSection
        title="Goal difference leaders (Eastern + Western combined)"
        rows={goalDiffLeaders}
        emptyText="No data."
      />
    </Show>
  )
}

function WcLeaders() {
  const groups = createMemo(() => wcStandings.error ? {} : (wcStandings()?.groups ?? {}))
  const allTeams = createMemo(() => Object.values(groups()).flat())
  const goalDiffLeaders = createMemo(() =>
    [...allTeams()]
      .sort((a, b) => b.gd - a.gd)
      .slice(0, 8)
      .map(t => ({
        name: t.team,
        metric: `${t.gd > 0 ? '+' : ''}${t.gd}`,
        detail: [
          { label: 'record', value: `${t.won}-${t.drawn}-${t.lost}` },
          { label: 'points', value: t.points },
        ],
      }))
  )

  return (
    <Show when={allTeams().length} fallback={<p class={styles.empty}>{wcStandings.error ? 'Unable to load World Cup standings.' : 'Loading…'}</p>}>
      <LeaderboardSection title="Goal difference leaders (all groups combined)" rows={goalDiffLeaders} emptyText="No data." />
    </Show>
  )
}

const TABS = [
  { key: 'mlb', label: 'MLB' },
  { key: 'mls', label: 'MLS' },
  { key: 'wc', label: 'World Cup' },
]

export function Stats() {
  const [active, setActive] = createSignal('mlb')

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Stats</span>
        <span class={styles.sublabel}>cross-game leaderboards, not per-division tables</span>
      </header>
      <p class={styles.note}>
        Same standings data as Seasons, recomposed: ranked across every division/conference/group
        instead of shown per-group. Production's real Stats tab also includes per-game scouting
        reports and sport-specific novel metrics sourced from endpoints not yet verified reachable
        from this playground — this tests the leaderboard-recomposition pattern only.
      </p>
      <Tabs tabs={TABS} active={active} setActive={setActive} />
      <Show when={active() === 'mlb'}><MlbLeaders /></Show>
      <Show when={active() === 'mls'}><MlsLeaders /></Show>
      <Show when={active() === 'wc'}><WcLeaders /></Show>
    </div>
  )
}
