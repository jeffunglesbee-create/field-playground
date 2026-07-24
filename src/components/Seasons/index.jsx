import { For, Show, createMemo } from 'solid-js'
import { wcStandings, mlbStandings, mlsStandings } from '../../data/relay'
import styles from './Seasons.module.css'
import shared from '../shared.module.css'

// SAMPLE DATA for NFL/EPL — see docs/EXPERIMENT-seasons-ground-mockups.md.
// No structured, ongoing source found for either. MLB and MLS below are
// real as of 2026-07-24.
const SAMPLE_TEAMS = [
  { team: 'Kansas City Chiefs',   sport: 'NFL', state: 'clinched',   label: 'Clinched Division', urgency: 0.1, detail: '#1 seed locked' },
  { team: 'Denver Broncos',       sport: 'NFL', state: 'bubble',     label: 'Playoff Bubble',     urgency: 0.8, detail: '#7 seed · 1 game cushion' },
  { team: 'Las Vegas Raiders',    sport: 'NFL', state: 'eliminated', label: 'Eliminated',         urgency: 0.0, detail: 'no playoff path' },
  { team: 'Sunderland',      sport: 'EPL', state: 'promotion_race',   label: 'Promotion Race',    urgency: 0.6, detail: '3rd · 4 pts off automatic' },
  { team: 'Southampton',     sport: 'EPL', state: 'relegation_battle',label: 'Relegation Battle',  urgency: 0.9, detail: '18th · 2 pts from safety' },
  { team: 'Arsenal',         sport: 'EPL', state: 'mid_table',        label: 'Mid-Table',          urgency: 0.1, detail: '9th · nothing at stake' },
]

// Compact row shared by MLB and sample cards — replaces the old padded
// .card layout, which took ~3 lines of vertical space per team.
function StateRow(props) {
  const t = () => props.team
  return (
    <div class={styles.stateRow}>
      <span class={styles.rowSport}>{t().sport}</span>
      <span class={styles.rowTeam}>{t().name}</span>
      <span class={`${shared.chip} ${styles.stateBadge} ${styles[t().state]}`}>{t().label}</span>
      <div class={styles.urgencyTrack}>
        <div class={styles.urgencyFill} style={{ width: `${t().urgency * 100}%` }} />
      </div>
      <span class={styles.rowDetail}>{t().detail}</span>
    </div>
  )
}

// Group winners only -- real data has 12 groups / 59 rows, far too much
// for a compact panel. Winner per group is a meaningful real subset (who
// actually won), not an arbitrary truncation.
function mlbTeamState(t) {
  const rank = parseInt(t.divisionRank, 10)
  const gb = t.gamesBack === '-' ? 0 : parseFloat(t.gamesBack)
  const wcgb = t.wildCardGamesBack === '-' ? 0 : parseFloat(t.wildCardGamesBack)
  if (rank === 1) return { state: 'division_lead', label: 'Leader', urgency: Math.min(0.3, gb / 10) }
  if (!isNaN(wcgb) && wcgb <= 3) return { state: 'wildcard_race', label: 'WC Race', urgency: 0.6 + (3 - wcgb) * 0.1 }
  if (gb <= 6) return { state: 'wildcard_race', label: 'In Reach', urgency: 0.5 }
  return { state: 'eliminated', label: 'Trailing', urgency: 0.1 }
}

export function Seasons() {
  const bySport = createMemo(() => {
    const map = {}
    for (const t of SAMPLE_TEAMS) {
      if (!map[t.sport]) map[t.sport] = []
      map[t.sport].push(t)
    }
    return Object.entries(map)
  })

  const mlbTeams = createMemo(() =>
    (mlbStandings()?.records ?? []).flatMap(r => r.teamRecords ?? []).map(t => {
      const s = mlbTeamState(t)
      return {
        sport: 'MLB', name: t.team.name, state: s.state, label: s.label, urgency: s.urgency,
        detail: `${t.gamesBack === '-' ? 'GA' : t.gamesBack + ' GB'} · ${t.streak?.streakCode ?? ''}`,
      }
    })
  )

  const sampleRows = createMemo(() =>
    bySport().flatMap(([sport, teams]) => teams.map(t => ({ ...t, name: t.team })))
  )

  const wcWinners = createMemo(() =>
    Object.entries(wcStandings()?.groups ?? {}).map(([g, teams]) => ({ group: g, winner: teams[0] }))
  )

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Seasons</span>
      </header>

      <section class={styles.realSection}>
        <div class={styles.realHeader}>
          <span class={styles.sectionSubLabel}>MLB</span>
          <span class={styles.liveTag}>LIVE, DERIVED</span>
        </div>
        <Show when={mlbTeams().length} fallback={<p class={styles.empty}>Loading…</p>}>
          <For each={mlbTeams()}>{team => <StateRow team={team} />}</For>
        </Show>
      </section>

      <section class={styles.realSection}>
        <div class={styles.realHeader}>
          <span class={styles.sectionSubLabel}>MLS</span>
          <span class={styles.liveTag}>LIVE</span>
        </div>
        <Show when={mlsStandings()?.tables?.[0]?.entries} fallback={<p class={styles.empty}>Loading…</p>}>
          <For each={mlsStandings().tables[0].entries}>
            {t => (
              <div class={styles.wcRow}>
                <span class={styles.wcRank}>{t.position}</span>
                <span class={styles.wcTeam}>{t.team}</span>
                <span class={styles.wcRecord}>{t.wins}-{t.draws}-{t.losses}</span>
                <span class={styles.wcGd}>{t.goals_difference > 0 ? '+' : ''}{t.goals_difference}</span>
                <span class={styles.wcPts}>{t.points}</span>
              </div>
            )}
          </For>
        </Show>
      </section>

      <section class={styles.realSection}>
        <div class={styles.realHeader}>
          <span class={styles.sectionSubLabel}>World Cup — Group Winners</span>
          <span class={styles.liveTag}>LIVE</span>
        </div>
        <p class={styles.note}>Concluded 2026-07-19 · 12 groups, winner shown per group (59 rows compressed to 12).</p>
        <Show when={wcStandings()} fallback={<p class={styles.empty}>Loading…</p>}>
          <For each={wcWinners()}>
            {g => (
              <div class={styles.wcRow}>
                <span class={styles.wcRank}>{g.group}</span>
                <span class={styles.wcTeam}>{g.winner.team}</span>
                <span class={styles.wcRecord}>{g.winner.won}-{g.winner.drawn}-{g.winner.lost}</span>
                <span class={styles.wcGd}>{g.winner.gd > 0 ? '+' : ''}{g.winner.gd}</span>
                <span class={styles.wcPts}>{g.winner.points}</span>
              </div>
            )}
          </For>
        </Show>
      </section>

      <section class={styles.sampleSection}>
        <div class={styles.realHeader}>
          <span class={styles.sectionSubLabel}>NFL / EPL</span>
          <span class={styles.sampleTag}>SAMPLE</span>
        </div>
        <For each={sampleRows()}>{team => <StateRow team={team} />}</For>
      </section>
    </div>
  )
}
