import { For, Show, createMemo } from 'solid-js'
import { wcStandings, mlbStandings, mlsStandings } from '../../data/relay'
import styles from './Seasons.module.css'
import shared from '../shared.module.css'

// SAMPLE DATA for NFL/EPL — see docs/EXPERIMENT-seasons-ground-mockups.md.
// No structured, ongoing source found for either. MLB and MLS below are
// real as of 2026-07-24.
const SAMPLE_TEAMS = [
  // Seeded-playoff sport (NFL) — different currency (seed, not games back)
  { team: 'Kansas City Chiefs',   sport: 'NFL', state: 'clinched',   label: 'Clinched Division', urgency: 0.1, detail: '#1 seed locked' },
  { team: 'Denver Broncos',       sport: 'NFL', state: 'bubble',     label: 'Playoff Bubble',     urgency: 0.8, detail: '#7 seed · 1 game cushion' },
  { team: 'Las Vegas Raiders',    sport: 'NFL', state: 'eliminated', label: 'Eliminated',         urgency: 0.0, detail: 'no playoff path' },

  // Promotion/relegation sport (EPL) — a state the other two don't have at all
  { team: 'Sunderland',      sport: 'EPL', state: 'promotion_race',   label: 'Promotion Race',    urgency: 0.6, detail: '3rd · 4 pts off automatic' },
  { team: 'Southampton',     sport: 'EPL', state: 'relegation_battle',label: 'Relegation Battle',  urgency: 0.9, detail: '18th · 2 pts from safety' },
  { team: 'Arsenal',         sport: 'EPL', state: 'mid_table',        label: 'Mid-Table',          urgency: 0.1, detail: '9th · nothing at stake' },
]

function SeasonCard(props) {
  const t = () => props.team
  return (
    <div class={styles.card}>
      <div class={styles.cardHead}>
        <span class={styles.sportTag}>{t().sport}</span>
        <span class={styles.teamName}>{t().team}</span>
      </div>
      <div class={styles.stateRow}>
        <span class={`${shared.chip} ${styles.stateBadge} ${styles[t().state]}`}>
          {t().label}
        </span>
        <div class={styles.urgencyTrack}>
          <div
            class={styles.urgencyFill}
            style={{ width: `${t().urgency * 100}%` }}
          />
        </div>
      </div>
      <div class={styles.detail}>{t().detail}</div>
    </div>
  )
}

// Real data, deliberately NOT run through the state/urgency model above --
// a concluded group stage doesn't have "urgency" to show, and inventing an
// "advanced"/"eliminated" label here would mean guessing this tournament's
// actual advancement rule, which was never confirmed. Plain, honest table.
function WcGroupTable(props) {
  return (
    <div class={styles.wcGroup}>
      <div class={styles.wcGroupLabel}>Group {props.groupId}</div>
      <For each={props.teams}>
        {(t, i) => (
          <div class={styles.wcRow}>
            <span class={styles.wcRank}>{i() + 1}</span>
            <span class={styles.wcTeam}>{t.team}</span>
            <span class={styles.wcRecord}>{t.won}-{t.drawn}-{t.lost}</span>
            <span class={styles.wcGd}>{t.gd > 0 ? '+' : ''}{t.gd}</span>
            <span class={styles.wcPts}>{t.points}</span>
          </div>
        )}
      </For>
    </div>
  )
}

// MLB: real, ongoing (gamesPlayed ~102, mid-season). Derives a state from
// unambiguous real fields only (divisionRank, gamesBack, wildCardGamesBack)
// -- deliberately conservative. Does NOT claim "clinched" or "eliminated,"
// since those require magic-number/elimination-number fields not confirmed
// present or correctly parsed here. Labeled DERIVED, not the league's own
// official classification.
function mlbTeamState(t) {
  const rank = parseInt(t.divisionRank, 10)
  const gb = t.gamesBack === '-' ? 0 : parseFloat(t.gamesBack)
  const wcgb = t.wildCardGamesBack === '-' ? 0 : parseFloat(t.wildCardGamesBack)
  if (rank === 1) return { state: 'division_lead', label: 'Division Leader', urgency: Math.min(0.3, gb / 10) }
  if (!isNaN(wcgb) && wcgb <= 3) return { state: 'wildcard_race', label: 'Wild Card Race', urgency: 0.6 + (3 - wcgb) * 0.1 }
  if (gb <= 6) return { state: 'wildcard_race', label: 'Within Reach', urgency: 0.5 }
  return { state: 'eliminated', label: 'Trailing', urgency: 0.1 }
}

function MlbCard(props) {
  const t = () => props.team
  const s = createMemo(() => mlbTeamState(t()))
  return (
    <div class={styles.card}>
      <div class={styles.cardHead}>
        <span class={styles.sportTag}>MLB</span>
        <span class={styles.teamName}>{t().team.name}</span>
      </div>
      <div class={styles.stateRow}>
        <span class={`${shared.chip} ${styles.stateBadge} ${styles[s().state]}`}>{s().label}</span>
        <div class={styles.urgencyTrack}>
          <div class={styles.urgencyFill} style={{ width: `${s().urgency * 100}%` }} />
        </div>
      </div>
      <div class={styles.detail}>
        {t().gamesBack === '-' ? 'GA' : `${t().gamesBack} GB`} · WC {t().wildCardGamesBack} · {t().streak?.streakCode}
      </div>
    </div>
  )
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
    (mlbStandings()?.records ?? []).flatMap(r => r.teamRecords ?? [])
  )

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Seasons</span>
      </header>

      <section class={styles.realSection}>
        <div class={styles.realHeader}>
          <span class={styles.sectionSubLabel}>MLB — Ongoing</span>
          <span class={styles.liveTag}>LIVE, DERIVED — /mlb-stats/standings</span>
        </div>
        <p class={styles.note}>
          Real, current standings (mid-season). State/urgency derived from
          real fields (division rank, games back, wild-card games back) —
          conservative on purpose, doesn't claim clinched/eliminated since
          that needs magic-number fields not confirmed here.
        </p>
        <Show when={mlbTeams().length} fallback={<p class={styles.empty}>Loading…</p>}>
          <For each={mlbTeams()}>{team => <MlbCard team={team} />}</For>
        </Show>
      </section>

      <section class={styles.realSection}>
        <div class={styles.realHeader}>
          <span class={styles.sectionSubLabel}>MLS — Ongoing</span>
          <span class={styles.liveTag}>LIVE — /mls/stats</span>
        </div>
        <p class={styles.note}>
          Real, current table (match day 17 of the season). No state
          derived here — MLS playoff-line position isn't confirmed with
          enough confidence to label; plain table instead, same choice as
          World Cup.
        </p>
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
          <span class={styles.sectionSubLabel}>World Cup — Group Stage</span>
          <span class={styles.liveTag}>LIVE — /wc/standings</span>
        </div>
        <p class={styles.note}>Concluded 2026-07-19 — a final table, not an ongoing race.</p>
        <Show when={wcStandings()} fallback={<p class={styles.empty}>Loading…</p>}>
          <For each={Object.entries(wcStandings().groups || {})}>
            {([groupId, teams]) => <WcGroupTable groupId={groupId} teams={teams} />}
          </For>
        </Show>
      </section>

      <section class={styles.sampleSection}>
        <div class={styles.realHeader}>
          <span class={styles.sectionSubLabel}>NFL / EPL — Ongoing Competition State</span>
          <span class={styles.sampleTag}>SAMPLE — no real endpoint found yet</span>
        </div>
        <p class={styles.note}>
          Same shape as the MLB section above, applied to a seeded-playoff
          format and a promotion/relegation format — the two currency
          types MLB/MLS/World Cup don't cover. Still sample, since no
          structured source was found for either.
        </p>
        <For each={bySport()}>
          {([sport, teams]) => (
            <div class={styles.sportGroup}>
              <div class={styles.sportLabel}>{sport}</div>
              <For each={teams}>{team => <SeasonCard team={team} />}</For>
            </div>
          )}
        </For>
      </section>
    </div>
  )
}
