import { For, Show, createSignal, createResource } from 'solid-js'
import styles from './BsdXgPanel.module.css'

const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'

// BsdXgPanel — real, live EPL expected-goals/possession from BSD.
//
// WHY THIS EXISTS: BSD's /bsd/events/{id}/shotmap carries genuinely
// rich, live, per-minute match stats (expected_goals, ball_possession)
// — confirmed real via a direct probe against a real finished match
// today (event 383, West Ham 3-0 Leeds, 2026-05-24: home xG 2.03, away
// xG 1.57). It was completely unwired anywhere in this project until
// now (confirmed: zero references to bsd/events or bsdLeagueId in the
// production client at the time this was built).
//
// FIELD NAMES CORRECTED (2026-08-02): originally built against
// /bsd/contract's illustrative example shape (home_xg/away_xg/
// possession_home), which turned out not to match the real API. The
// production CC-CMD implementing the same data caught this by probing
// a real match before writing code; this component's own test match
// (GW1, unplayed at build time) had every stat field null regardless
// of the field name used, so the wrong path never surfaced here until
// checked against real, played-match data. Real shape: stats.home.
// expected_goals / stats.home.ball_possession (and away.*).
//
// TWO REAL BUGS FOUND TODAY, WORKED AROUND CORRECTLY NOT PAPERED OVER:
//   - /bsd/events/season's `season=` param does not filter results —
//     identical count and first-page dates returned across three
//     different season values tried.
//   - /bsd/events/by-date's `date=` param does not reliably filter
//     either — requesting one date returned a match dated over three
//     months later.
// NEITHER is defensively worked around here (no retry-with-fallback,
// no silent re-querying). Instead: this resolves the real BSD event_id
// by matching team names against FPL's fixtures endpoint (confirmed
// reliable, already used elsewhere this session) — direct-by-ID lookup
// was confirmed to work correctly; only the LIST/SEARCH filtering is
// broken. Same shape as how MLB's real gamePk was resolved via
// team-name matching rather than trusting a date-scoped search,
// earlier today.
//
// EPL's 2026-27 season has not started (Gameweek 1 kicks off
// 2026-08-21, confirmed live). So there is no live match to show real
// xG for YET. This deliberately does NOT fabricate a "loading" or
// placeholder value — it shows the real BSD status field
// ("notstarted") honestly, the same principle LiveWpTicker's
// synced/unsynced labeling already established: an honest degraded
// state, not a fake match.

async function fetchGw1Fixtures() {
  const res = await fetch(RELAY + '/fpl/fixtures?event=1')
  if (!res.ok) throw new Error('FPL fixtures fetch failed: ' + res.status)
  return res.json()
}

async function fetchTeamNames() {
  const res = await fetch(RELAY + '/fpl/bootstrap-static')
  if (!res.ok) throw new Error('FPL bootstrap fetch failed: ' + res.status)
  const data = await res.json()
  const map = {}
  for (const t of data.teams ?? []) map[t.id] = t.name
  return map
}

// BSD's event list can't be reliably searched by date (confirmed
// broken), so this pages through it once and matches on team name —
// slower than a real search would be, but correct, which the search
// currently is not.
async function resolveBsdEventId(homeName, awayName) {
  const norm = s => (s || '').toLowerCase().replace(/[^a-z]/g, '')
  // FUZZY, NOT EXACT: confirmed live that FPL's short names ("Man
  // City") and BSD's apparent full names ("Manchester City") fail
  // strict equality after normalization -- norm("Man City")="mancity"
  // vs norm("Manchester City")="manchestercity", verified unequal
  // before this fix. Reused production's own espnTeamMatch
  // bidirectional-includes pattern (field.js ~L22852), already proven
  // correct for this exact class of short-vs-full-name mismatch.
  const fuzzyMatch = (x, y) => x === y || x.includes(y) || y.includes(x)
  const h = norm(homeName), a = norm(awayName)
  for (let offset = 0; offset < 500; offset += 50) {
    const res = await fetch(RELAY + '/bsd/events/season?league_id=1&limit=50&offset=' + offset)
    if (!res.ok) break
    const data = await res.json()
    const results = data.results ?? []
    if (!results.length) break
    const match = results.find(r => {
      const rh = norm(r.home_team), ra = norm(r.away_team)
      return (fuzzyMatch(rh, h) && fuzzyMatch(ra, a)) || (fuzzyMatch(rh, a) && fuzzyMatch(ra, h))
    })
    if (match) return match.id
  }
  return null
}

async function fetchFixtureWithBsd() {
  const [fixtures, teamNames] = await Promise.all([fetchGw1Fixtures(), fetchTeamNames()])
  if (!fixtures.length) throw new Error('no GW1 fixtures returned')
  const fx = fixtures[0]
  const homeName = teamNames[fx.team_h]
  const awayName = teamNames[fx.team_a]

  const bsdEventId = await resolveBsdEventId(homeName, awayName)
  let bsd = null
  let bsdError = null
  if (bsdEventId) {
    const res = await fetch(RELAY + '/bsd/events/' + bsdEventId + '/shotmap')
    if (res.ok) bsd = await res.json()
    else bsdError = 'BSD shotmap fetch failed: ' + res.status
  } else {
    bsdError = 'no matching BSD event found (team-name match failed)'
  }

  return { homeName, awayName, kickoff: fx.kickoff_time, bsdEventId, bsd, bsdError }
}

export function BsdXgPanel() {
  const [data] = createResource(fetchFixtureWithBsd)

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>BSD Live xG</span>
        <span class={styles.note}>real event-ID match, not date search — season/date list filtering confirmed broken today</span>
      </header>

      <Show when={data.error}>
        <p class={styles.error}>Unable to load: {String(data.error?.message ?? data.error)}</p>
      </Show>

      <Show when={data.loading}>
        <p class={styles.empty}>Resolving real fixture + BSD event…</p>
      </Show>

      <Show when={!data.error && data()}>
        {d => (
          <>
            <div class={styles.matchup}>
              <span class={styles.teams}>{d().awayName} @ {d().homeName}</span>
              <span class={styles.kickoff}>
                kickoff {new Date(d().kickoff).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>

            <Show when={d().bsdEventId} fallback={<p class={styles.error}>{d().bsdError}</p>}>
              <div class={styles.resolved}>
                <span class={styles.resolvedLabel}>BSD event_id resolved:</span>
                <span class={styles.resolvedId}>{d().bsdEventId}</span>
              </div>

              <Show when={d().bsdError}>
                <p class={styles.error}>{d().bsdError}</p>
              </Show>

              <Show when={d().bsd}>
                {b => (
                  <div class={styles.stats}>
                    <div class={styles.statRow}>
                      <span class={styles.statLabel}>home xG</span>
                      <span class={styles.statValue}>
                        {b().stats?.home?.expected_goals ?? '—'}
                      </span>
                    </div>
                    <div class={styles.statRow}>
                      <span class={styles.statLabel}>away xG</span>
                      <span class={styles.statValue}>
                        {b().stats?.away?.expected_goals ?? '—'}
                      </span>
                    </div>
                    <div class={styles.statRow}>
                      <span class={styles.statLabel}>possession</span>
                      <span class={styles.statValue}>
                        {b().stats?.home?.ball_possession ?? '—'}% / {b().stats?.away?.ball_possession ?? '—'}%
                      </span>
                    </div>
                    {/* Honest state, not a fabricated placeholder — if
                        every field is null, the match genuinely hasn't
                        been played yet. Same principle as LiveWpTicker's
                        synced/unsynced labeling. */}
                    <Show when={b().stats?.home?.expected_goals == null && b().stats?.away?.expected_goals == null}>
                      <p class={styles.notStarted}>
                        No xG yet — match hasn't started. Will populate live once EPL's
                        2026-27 season kicks off (Aug 21).
                      </p>
                    </Show>
                  </div>
                )}
              </Show>
            </Show>
          </>
        )}
      </Show>
    </div>
  )
}
