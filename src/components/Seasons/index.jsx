import { For, Show, createMemo, createSignal } from 'solid-js'
import { wcStandings, mlbStandings, mlsStandings } from '../../data/relay'
import styles from './Seasons.module.css'
import shared from '../shared.module.css'

// MLB division ID -> name. Not in the API response (only numeric division
// IDs) -- verified against real live team rosters per division before
// mapping, not guessed from memory: 201=[Rays,Yankees,Red Sox,Orioles,Blue
// Jays]=AL East, 202=[White Sox,Guardians,Twins,Tigers,Royals]=AL Central,
// 200=[Rangers,Mariners,Astros,Athletics,Angels]=AL West, 204=[Braves,
// Phillies,Marlins,Nationals,Mets]=NL East, 205=[Brewers,Cubs,Pirates,
// Cardinals,Reds]=NL Central, 203=[Dodgers,D-backs,Padres,Giants,
// Rockies]=NL West.
const MLB_DIVISION_NAMES = {
  201: 'AL East', 202: 'AL Central', 200: 'AL West',
  204: 'NL East', 205: 'NL Central', 203: 'NL West',
}

// MLS conference membership -- NOT in the API (checked standings AND club
// metadata, neither has a conference field). Searched for the real, current
// 2026 breakdown rather than guess; cross-referenced every name against the
// live standings' exact team-name strings (API uses "Los Angeles Football
// Club" not "LAFC", "Red Bull New York" not "NY Red Bulls", etc. -- matched
// exactly, not fuzzy). Externally-maintained mapping, not derived from any
// FIELD or relay source -- flagged as such in the UI.
const MLS_EASTERN = new Set([
  'Nashville SC', 'Chicago Fire FC', 'Inter Miami CF', 'New York City Football Club',
  'Charlotte FC', 'Toronto FC', 'Red Bull New York', 'New England Revolution',
  'D.C. United', 'FC Cincinnati', 'Atlanta United', 'CF Montréal',
  'Columbus Crew', 'Orlando City', 'Philadelphia Union',
])
const MLS_WESTERN = new Set([
  'San Diego Football Club', 'Los Angeles Football Club', 'San Jose Earthquakes', 'FC Dallas',
  'Portland Timbers', 'Houston Dynamo FC', 'Vancouver Whitecaps FC', 'Austin FC',
  'Minnesota United FC', 'St. Louis CITY SC', 'Colorado Rapids', 'LA Galaxy',
  'Real Salt Lake', 'Seattle Sounders FC', 'Sporting Kansas City',
])

// SAMPLE — no structured, ongoing source found for either NFL (seeded
// playoff) or EPL (promotion/relegation). Kept from the original mockup
// rather than dropped, since MLB/MLS/WC only cover the division-wildcard
// and points-table currency types -- these two are the only representation
// of the other two currency types the original experiment set out to test.
const SAMPLE_TEAMS = [
  { name: 'Kansas City Chiefs', sport: 'NFL', state: 'clinched',   label: 'Clinched Division', urgency: 0.1, detail: '#1 seed locked' },
  { name: 'Denver Broncos',     sport: 'NFL', state: 'bubble',     label: 'Playoff Bubble',     urgency: 0.8, detail: '#7 seed · 1 game cushion' },
  { name: 'Las Vegas Raiders',  sport: 'NFL', state: 'eliminated', label: 'Eliminated',         urgency: 0.0, detail: 'no playoff path' },
  { name: 'Sunderland',    sport: 'EPL', state: 'promotion_race',   label: 'Promotion Race',    urgency: 0.6, detail: '3rd · 4 pts off automatic' },
  { name: 'Southampton',   sport: 'EPL', state: 'relegation_battle',label: 'Relegation Battle',  urgency: 0.9, detail: '18th · 2 pts from safety' },
  { name: 'Arsenal',       sport: 'EPL', state: 'mid_table',        label: 'Mid-Table',          urgency: 0.1, detail: '9th · nothing at stake' },
]

function Tabs(props) {
  return (
    <div class={styles.tabBar}>
      <For each={props.tabs}>
        {tab => (
          <button
            class={`${styles.tab} ${props.active() === tab.key ? styles.tabActive : ''}`}
            onClick={() => props.setActive(tab.key)}
          >
            {tab.label}
          </button>
        )}
      </For>
    </div>
  )
}

// Card format, back from the compact-row version -- state badge, urgency
// bar, detail line, one team per card.
function TeamCard(props) {
  const t = () => props.team
  return (
    <div class={styles.card}>
      <span class={styles.teamName}>{t().name}</span>
      <div class={styles.stateRow}>
        <span class={`${shared.chip} ${styles.stateBadge} ${styles[t().state]}`}>{t().label}</span>
        <div class={styles.urgencyTrack}>
          <div class={styles.urgencyFill} style={{ width: `${t().urgency * 100}%` }} />
        </div>
      </div>
      <div class={styles.detail}>{t().detail}</div>
    </div>
  )
}

function TableRow(props) {
  const t = () => props.team
  return (
    <div class={styles.wcRow}>
      <span class={styles.wcRank}>{t().rank}</span>
      <span class={styles.wcTeam}>{t().name}</span>
      <span class={styles.wcRecord}>{t().record}</span>
      <span class={styles.wcGd}>{t().gd}</span>
      <span class={styles.wcPts}>{t().pts}</span>
    </div>
  )
}

function mlbTeamState(t) {
  const rank = parseInt(t.divisionRank, 10)
  const gb = t.gamesBack === '-' ? 0 : parseFloat(t.gamesBack)
  const wcgb = t.wildCardGamesBack === '-' ? 0 : parseFloat(t.wildCardGamesBack)
  if (rank === 1) return { state: 'division_lead', label: 'Leader', urgency: Math.min(0.3, gb / 10) }
  if (!isNaN(wcgb) && wcgb <= 3) return { state: 'wildcard_race', label: 'WC Race', urgency: 0.6 + (3 - wcgb) * 0.1 }
  if (gb <= 6) return { state: 'wildcard_race', label: 'In Reach', urgency: 0.5 }
  return { state: 'eliminated', label: 'Trailing', urgency: 0.1 }
}

// --- MLB section: 7 tabs (6 divisions + Wild Card) ---
function MlbSection() {
  const [active, setActive] = createSignal(201)

  // Resources throw when READ in error state -- but a createMemo whose
  // computation throws on its first run doesn't reliably re-throw on
  // later reads; it can settle into a stale `undefined` instead, which
  // then crashes something downstream with an opaque "reading .length
  // of undefined" rather than the real fetch error. Checking `.error`
  // BEFORE calling the accessor avoids ever invoking it while errored --
  // same posture AmbientPanel/DeskCard already take with `.error`.
  const records = createMemo(() => mlbStandings.error ? [] : (mlbStandings()?.records ?? []))

  const tabs = createMemo(() =>
    records()
      .map(r => ({ key: r.division.id, label: MLB_DIVISION_NAMES[r.division.id] || `Div ${r.division.id}` }))
      .concat([{ key: 'wc', label: 'Wild Card' }])
  )

  // Detail line restored to GB + WC + streak together, matching the
  // pre-tabs build (2026-07-24) rather than the shortened GB-only version
  // that shipped with the tabs rebuild.
  const divisionTeams = createMemo(() => {
    const rec = records().find(r => r.division.id === active())
    return (rec?.teamRecords ?? []).map(t => {
      const s = mlbTeamState(t)
      return {
        name: t.team.name, ...s,
        detail: `${t.gamesBack === '-' ? 'GA' : t.gamesBack + ' GB'} · WC ${t.wildCardGamesBack} · ${t.streak?.streakCode ?? ''}`,
      }
    })
  })

  const wildCardTeams = createMemo(() => {
    const all = records().flatMap(r => r.teamRecords ?? [])
    return all
      .filter(t => parseInt(t.divisionRank, 10) !== 1)
      .sort((a, b) => parseFloat(a.wildCardGamesBack === '-' ? 0 : a.wildCardGamesBack) - parseFloat(b.wildCardGamesBack === '-' ? 0 : b.wildCardGamesBack))
      .slice(0, 8)
      .map(t => {
        const s = mlbTeamState(t)
        return {
          name: t.team.name, ...s,
          detail: `${t.gamesBack === '-' ? 'GA' : t.gamesBack + ' GB'} · WC ${t.wildCardGamesBack} · ${t.streak?.streakCode ?? ''}`,
        }
      })
  })

  return (
    <section class={styles.realSection}>
      <div class={styles.realHeader}>
        <span class={styles.sectionSubLabel}>MLB</span>
        <span class={styles.liveTag}>LIVE, DERIVED</span>
      </div>
      <Show when={records().length} fallback={<p class={styles.empty}>{mlbStandings.error ? 'Unable to load MLB standings.' : 'Loading…'}</p>}>
        <Tabs tabs={tabs()} active={active} setActive={setActive} />
        <div class={styles.cardGrid}>
          <For each={active() === 'wc' ? wildCardTeams() : divisionTeams()}>
            {team => <TeamCard team={team} />}
          </For>
        </div>
      </Show>
    </section>
  )
}

// --- MLS section: 2 tabs (Eastern / Western) ---
function MlsSection() {
  const [active, setActive] = createSignal('East')
  const tabs = [{ key: 'East', label: 'Eastern' }, { key: 'West', label: 'Western' }]

  const entries = createMemo(() => mlsStandings.error ? [] : (mlsStandings()?.tables?.[0]?.entries ?? []))

  const conferenceTeams = createMemo(() => {
    const set = active() === 'East' ? MLS_EASTERN : MLS_WESTERN
    return entries()
      .filter(t => set.has(t.team))
      .map((t, i) => ({
        rank: i + 1, name: t.team,
        record: `${t.wins}-${t.draws}-${t.losses}`,
        gd: `${t.goals_difference > 0 ? '+' : ''}${t.goals_difference}`,
        pts: t.points,
      }))
  })

  return (
    <section class={styles.realSection}>
      <div class={styles.realHeader}>
        <span class={styles.sectionSubLabel}>MLS</span>
        <span class={styles.liveTag}>LIVE</span>
      </div>
      <Show when={entries().length} fallback={<p class={styles.empty}>{mlsStandings.error ? 'Unable to load MLS standings.' : 'Loading…'}</p>}>
        <Tabs tabs={tabs} active={active} setActive={setActive} />
        <For each={conferenceTeams()}>{team => <TableRow team={team} />}</For>
      </Show>
    </section>
  )
}

// --- World Cup section: 12 tabs (one per group), full tables now that
// tabs give room -- no longer trimmed to winners-only. ---
function WcSection() {
  const groups = createMemo(() => wcStandings.error ? {} : (wcStandings()?.groups ?? {}))
  const [active, setActive] = createSignal('A')
  const tabs = createMemo(() => Object.keys(groups()).map(g => ({ key: g, label: g })))

  const groupTeams = createMemo(() =>
    (groups()[active()] ?? []).map((t, i) => ({
      rank: i + 1, name: t.team, record: `${t.won}-${t.drawn}-${t.lost}`,
      gd: `${t.gd > 0 ? '+' : ''}${t.gd}`, pts: t.points,
    }))
  )

  return (
    <section class={styles.realSection}>
      <div class={styles.realHeader}>
        <span class={styles.sectionSubLabel}>World Cup</span>
        <span class={styles.liveTag}>LIVE, CONCLUDED 7/19</span>
      </div>
      <Show when={tabs().length} fallback={<p class={styles.empty}>{wcStandings.error ? 'Unable to load World Cup standings.' : 'Loading…'}</p>}>
        <Tabs tabs={tabs()} active={active} setActive={setActive} />
        <For each={groupTeams()}>{team => <TableRow team={team} />}</For>
      </Show>
    </section>
  )
}

export function Seasons() {
  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Seasons</span>
      </header>
      <MlbSection />
      <MlsSection />
      <WcSection />
      <section class={styles.sampleSection}>
        <div class={styles.realHeader}>
          <span class={styles.sectionSubLabel}>NFL / EPL</span>
          <span class={styles.sampleTag}>SAMPLE — no source found</span>
        </div>
        <div class={styles.cardGrid}>
          <For each={SAMPLE_TEAMS}>{team => <TeamCard team={team} />}</For>
        </div>
      </section>
    </div>
  )
}
