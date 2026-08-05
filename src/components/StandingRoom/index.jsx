import { For, Show, createMemo, createSignal } from 'solid-js'
import { wcStandings, mlbStandings, mlsStandings, deskStore } from '../../data/relay'
import { Tabs } from '../Tabs'
import styles from './StandingRoom.module.css'
import shared from '../shared.module.css'

// StandingRoom -- formerly two separate top-level sections, Seasons and
// StandingsDrawer, which read the exact same live resources
// (mlbStandings/mlsStandings) to answer two genuinely different
// questions -- "what does the whole league table look like" (League
// Tables, below) vs "how are the two teams in THIS specific game doing"
// (Today's Games, further down). Split across two App sections despite
// being the same underlying information, same data source, same
// "standings" subject. Merged 2026-07-26 into one component with a view
// toggle rather than deleting either mechanism: League Tables'
// division/conference/group browsing and Today's Games' lazy per-row
// join (computed only when a row is expanded, zero new fetch --
// StandingsDrawer's whole reason to exist) are both real, distinct, and
// worth keeping. What moved is presentation, not data.

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

  // Real, plain-language payoff -- names the tightest real division race
  // (smallest real gamesBack gap between the division leader and the
  // second-place team) and, if one of those two teams is riding a real
  // winning streak, names that too, instead of leaving 6 divisions of
  // gamesBack numbers for the reader to scan and compare unaided.
  const verdict = createMemo(() => {
    let tightest = null
    for (const r of records()) {
      const teams = r.teamRecords ?? []
      const leader = teams.find(t => parseInt(t.divisionRank, 10) === 1)
      const second = teams.find(t => parseInt(t.divisionRank, 10) === 2)
      if (!leader || !second) continue
      const gap = second.gamesBack === '-' ? 0 : parseFloat(second.gamesBack)
      if (isNaN(gap)) continue
      if (!tightest || gap < tightest.gap) {
        tightest = {
          divisionName: MLB_DIVISION_NAMES[r.division.id] || `Div ${r.division.id}`,
          gap, leader, second,
        }
      }
    }
    if (!tightest) return null
    const gapText = tightest.gap === 0 ? 'tied at the top' : `just ${tightest.gap.toFixed(1)} games back`
    let text = `Tightest real division race: ${tightest.divisionName} -- ${tightest.second.team.name} trails ${tightest.leader.team.name} by ${gapText}.`
    let hottest = null
    for (const t of [tightest.leader, tightest.second]) {
      const m = t.streak?.streakCode?.match(/^W(\d+)$/)
      if (m) {
        const n = parseInt(m[1], 10)
        if (!hottest || n > hottest.n) hottest = { name: t.team.name, n, code: t.streak.streakCode }
      }
    }
    if (hottest) text += ` ${hottest.name} is riding a real ${hottest.code} streak into it.`
    return text
  })

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
        <Show when={verdict()}>
          <p class={styles.verdict}>{verdict()}</p>
        </Show>
        <Tabs id="standing-room-mlb" tabs={tabs()} active={active} setActive={setActive} />
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
        <Tabs id="standing-room-mls" tabs={tabs} active={active} setActive={setActive} />
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
        <Tabs id="standing-room-wc" tabs={tabs()} active={active} setActive={setActive} />
        <For each={groupTeams()}>{team => <TableRow team={team} />}</For>
      </Show>
    </section>
  )
}

// --- Today's Games: StandingsDrawer's own mechanism, absorbed verbatim.
// Production's gamecard has a collapsible "▼ Standings" control per game.
// This is a lazy per-row JOIN, not a new fetch: mlbStandings/mlsStandings
// are the exact same already-resident resources League Tables (above)
// already holds, cross-referenced here against deskStore's own game list
// by team name. A createMemo (or any derived accessor) is never evaluated
// until something actually reads it -- before a row is ever expanded,
// this row's lookup literally never runs, no cost, and there is nothing
// here that could trigger a network request even if it did (both source
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

  // Plain accessors, not createMemo -- createMemo computes its initial
  // value EAGERLY at creation (confirmed against SolidJS's own docs, not
  // assumed), so a memo here would run standingInfo()'s mlbLine/mlsLine
  // scan for every row the moment <For> mounts it, regardless of whether
  // that row is ever expanded. That directly contradicts this section's
  // whole reason to exist -- "before a row is ever expanded, this row's
  // lookup literally never runs." A plain function only runs when
  // actually called, which only happens inside the `expanded()` Show
  // below -- genuine lazy evaluation, not memoized-but-still-eager.
  const homeInfo = () => standingInfo(g().sport, g().home)
  const awayInfo = () => standingInfo(g().sport, g().away)

  return (
    <div class={styles.drawerRow}>
      <button
        type="button"
        class={styles.drawerRowHead}
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
              <span class={styles.drawerTeamName}>{g().home}</span>
              <span class={styles.teamDetail}>{homeInfo().line ?? 'not found in current standings'}</span>
            </div>
            <div class={styles.teamLine}>
              <span class={styles.drawerTeamName}>{g().away}</span>
              <span class={styles.teamDetail}>{awayInfo().line ?? 'not found in current standings'}</span>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )
}

function TodaysGamesSection() {
  const games = createMemo(allGames)

  return (
    <section class={styles.realSection}>
      <div class={styles.realHeader}>
        <span class={styles.sectionSubLabel}>Today's Games</span>
        <span class={styles.liveTag}>PER-GAME JOIN, ZERO NEW FETCH</span>
      </div>
      <p class={styles.drawerNote}>
        Same wcStandings/mlbStandings/mlsStandings resources League Tables already holds live —
        joined here against each real game's own home/away team names, computed only when a row
        is expanded. No new request; the data is already resident.
      </p>
      <Show when={games().length} fallback={<p class={styles.empty}>No games today.</p>}>
        <div class={styles.drawerRowList}>
          <For each={games()}>{g => <GameDrawerRow game={g} />}</For>
        </div>
      </Show>
    </section>
  )
}

const VIEW_TABS = [
  { key: 'leagues', label: 'League Tables' },
  { key: 'today', label: "Today's Games" },
]

export function StandingRoom() {
  const [view, setView] = createSignal('leagues')

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Standing Room</span>
      </header>
      <Tabs id="standing-room-view" tabs={VIEW_TABS} active={view} setActive={setView} />
      <Show when={view() === 'leagues'}>
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
      </Show>
      <Show when={view() === 'today'}>
        <TodaysGamesSection />
      </Show>
    </div>
  )
}
