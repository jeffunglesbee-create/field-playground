import { For, createMemo } from 'solid-js'
import styles from './Seasons.module.css'
import shared from '../shared.module.css'

// SAMPLE DATA — see docs/EXPERIMENT-seasons-ground-mockups.md. The relay's
// real /context/date/{date} standings field is pre-rendered prose, not a
// structured per-team model, so there's nothing real to fetch yet. This
// exists to test whether ONE shape can honestly describe competition
// state across structurally different sports -- not to look like live
// data, which is why every card below says SAMPLE DATA directly in the UI.

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
        <span class={styles.sampleTag}>SAMPLE DATA — no real endpoint yet</span>
      </header>
      <p class={styles.note}>
        Same shape (state, label, urgency, detail) applied across three
        structurally different season formats — division/wild-card,
        seeded playoff, promotion/relegation. Testing whether one model
        actually fits all three.
      </p>
      <For each={bySport()}>
        {([sport, teams]) => (
          <div class={styles.sportGroup}>
            <div class={styles.sportLabel}>{sport}</div>
            <For each={teams}>{team => <SeasonCard team={team} />}</For>
          </div>
        )}
      </For>
    </div>
  )
}
