import { For, Show, createMemo } from 'solid-js'
import { wcStandings } from '../../data/relay'
import styles from './Seasons.module.css'
import shared from '../shared.module.css'

// SAMPLE DATA — see docs/EXPERIMENT-seasons-ground-mockups.md. The relay's
// /context/date/{date} standings field is pre-rendered prose, not a
// structured per-team model — that finding holds. /wc/standings is real
// (confirmed live, checked 2026-07-24), but scoped to World Cup group
// stage only, and the tournament ended 2026-07-19 -- a final table, not
// an ongoing race. Doesn't cover the cross-sport, ongoing-stakes question
// this experiment actually asks. So: real World Cup section below, sample
// cards for everything else, kept visibly separate rather than blended.

const SAMPLE_TEAMS = [
  // Division/wild-card sport (MLB)
  { team: 'Milwaukee Brewers', sport: 'MLB', state: 'division_lead', label: 'Division Leader', urgency: 0.2, detail: '6.5 GA · 41 remaining' },
  { team: 'Cincinnati Reds',   sport: 'MLB', state: 'wildcard_race', label: 'Wild Card Race',   urgency: 0.7, detail: '1.5 GB WC3 · 39 remaining' },
  { team: 'Colorado Rockies',  sport: 'MLB', state: 'eliminated',    label: 'Eliminated',        urgency: 0.0, detail: '31 GB · mathematically out' },

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
// actual advancement rule, which was never confirmed. Plain, honest table:
// rank, team, record, goal difference, points. Nothing invented.
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

export function Seasons() {
  const bySport = createMemo(() => {
    const map = {}
    for (const t of SAMPLE_TEAMS) {
      if (!map[t.sport]) map[t.sport] = []
      map[t.sport].push(t)
    }
    return Object.entries(map)
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Seasons</span>
      </header>

      <section class={styles.realSection}>
        <div class={styles.realHeader}>
          <span class={styles.sectionSubLabel}>World Cup — Group Stage</span>
          <span class={styles.liveTag}>LIVE — /wc/standings</span>
        </div>
        <p class={styles.note}>
          Real, structured data — the one genuinely queryable standings
          source that exists. Tournament ended 2026-07-19, so this is a
          final table, not an ongoing race.
        </p>
        <Show when={wcStandings()} fallback={<p class={styles.empty}>Loading…</p>}>
          <For each={Object.entries(wcStandings().groups || {})}>
            {([groupId, teams]) => <WcGroupTable groupId={groupId} teams={teams} />}
          </For>
        </Show>
      </section>

      <section class={styles.sampleSection}>
        <div class={styles.realHeader}>
          <span class={styles.sectionSubLabel}>Ongoing Competition State</span>
          <span class={styles.sampleTag}>SAMPLE — no real endpoint yet</span>
        </div>
        <p class={styles.note}>
          Same shape (state, label, urgency, detail) applied across three
          structurally different, currently-ongoing season formats —
          division/wild-card, seeded playoff, promotion/relegation. This is
          the actual experiment question; nothing above with a LIVE tag
          answers it, since a concluded group stage has no urgency left.
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
