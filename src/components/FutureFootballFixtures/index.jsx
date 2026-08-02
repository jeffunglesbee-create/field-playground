import { For, Show, createSignal, createResource } from 'solid-js'
import styles from './FutureFootballFixtures.module.css'

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports'

// FutureFootballFixtures — built alongside jubilant-bassoon's CC-CMD-
// 2026-08-02-add-football-to-date-fixtures-sweep, to answer the exact
// question that CC-CMD flags as its real risk with real evidence:
// fetchESPNFixturesForDate's non-golf event mapping works for NBA/NHL/
// MLB/soccer -- does it also work for football's competitor shape, or
// does football need its own branch (matching how golf already gets
// one for being an individual sport)?
//
// This is diagnostic, not a production feature -- it exists to de-risk
// that CC-CMD with real data before/alongside it running, same pattern
// as the LaLiga/Bundesliga diagnostics earlier this session.
//
// Deliberately defaults to real, confirmed-relevant future dates:
// Sept 10 2026 (NFL, already confirmed elsewhere in this codebase to
// return 49ers @ Rams) and Aug 29 2026 (CFB's real, confirmed season
// opener). Both dates are genuinely in the future relative to today
// (Aug 2) -- this is exactly the forward-navigation scenario the real
// gap affects.

async function fetchFootballScoreboard(league, dateStr, groups80) {
  const espnLeague = league === 'nfl' ? 'nfl' : 'college-football'
  const dateParam = dateStr.replace(/-/g, '')
  let url = `${ESPN_BASE}/football/${espnLeague}/scoreboard?dates=${dateParam}&limit=50`
  if (groups80) url += '&groups=80'

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) return { ok: false, status: res.status, events: [] }
  const data = await res.json()
  const events = data.events ?? []

  // The real question: does a football competitor object have the same
  // shape (homeAway/team/score at the same paths) the generic mapper
  // already assumes for NBA/NHL/MLB/soccer, or does it diverge?
  const sample = events[0]?.competitions?.[0] ?? null

  return {
    ok: true,
    status: res.status,
    eventCount: events.length,
    sampleCompetitors: sample?.competitors?.map(c => ({
      homeAway: c.homeAway,
      teamName: c.team?.displayName,
      score: c.score,
      // fields the generic mapper would need that golf's competitors
      // genuinely don't have (golf has no homeAway/score in the same
      // shape, which is why it needs its own branch)
      hasHomeAway: 'homeAway' in c,
      hasScore: 'score' in c,
    })) ?? [],
  }
}

export function FutureFootballFixtures() {
  const [nflDate, setNflDate] = createSignal('2026-09-10')
  const [cfbDate, setCfbDate] = createSignal('2026-08-29')

  const [nfl] = createResource(nflDate, d => fetchFootballScoreboard('nfl', d, false))
  const [cfb] = createResource(cfbDate, d => fetchFootballScoreboard('cfb', d, true))

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Future Football Fixtures</span>
        <span class={styles.note}>real ESPN data — does football's shape fit the generic mapper?</span>
      </header>

      <div class={styles.leagueBlock}>
        <label class={styles.dateRow}>
          NFL date
          <input type="date" value={nflDate()} onInput={e => setNflDate(e.target.value)} class={styles.dateInput} />
        </label>
        <LeagueResult result={nfl} />
      </div>

      <div class={styles.leagueBlock}>
        <label class={styles.dateRow}>
          CFB date (groups=80 applied)
          <input type="date" value={cfbDate()} onInput={e => setCfbDate(e.target.value)} class={styles.dateInput} />
        </label>
        <LeagueResult result={cfb} />
      </div>
    </div>
  )
}

function LeagueResult(props) {
  return (
    <>
      <Show when={props.result.loading}>
        <p class={styles.loading}>Fetching real ESPN data…</p>
      </Show>
      <Show when={props.result.error}>
        <p class={styles.error}>{String(props.result.error?.message ?? props.result.error)}</p>
      </Show>
      <Show when={!props.result.loading && !props.result.error && props.result()}>
        {r => (
          <>
            <p class={styles.summary}>
              HTTP {r().status} — {r().eventCount} real event{r().eventCount === 1 ? '' : 's'}
            </p>
            <Show when={r().sampleCompetitors.length}>
              <div class={styles.finding}>
                <strong>{r().sampleCompetitors.every(c => c.hasHomeAway && c.hasScore) ? 'Fits the generic shape:' : 'Diverges from the generic shape:'}</strong>{' '}
                real competitors {r().sampleCompetitors.every(c => c.hasHomeAway && c.hasScore)
                  ? 'carry homeAway and score at the same paths the existing NBA/NHL/MLB/soccer mapper already reads — no special branch needed on this evidence.'
                  : 'are missing homeAway or score fields the generic mapper expects — real evidence a football-specific branch is needed, matching golf\'s.'}
              </div>
              <ul class={styles.competitorList}>
                <For each={r().sampleCompetitors}>
                  {c => <li>{c.homeAway}: {c.teamName} — score: {c.score ?? '(none)'}</li>}
                </For>
              </ul>
            </Show>
          </>
        )}
      </Show>
    </>
  )
}
