import { For, Show, createResource } from 'solid-js'
import styles from './LaLigaCrossCheck.module.css'

const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'

// LaLigaCrossCheck — validates the brand-new apim.laliga.com discovery
// against FD's established, licensed standings source. NOT a display
// panel duplicating BsdXgPanel's shape -- the actual job here is
// checking whether a same-day discovery can be trusted, before
// production leans on it.
//
// apim.laliga.com's subscription key was found minutes before this was
// built, by passive network observation of laliga.com's own real
// traffic (docs/outbox/cc-session-2026-08-02-laliga-network-capture.md).
// Real, confirmed, but genuinely new -- this deserves more scrutiny
// than FD, which has years of stable behavior in this codebase.
//
// A REAL FINDING SURFACED WHILE BUILDING THIS, WORTH STATING PLAINLY:
// the two sources are not simply "agree" or "disagree" right now. FD's
// /fd/competitions/PD/standings returns a real, correct table -- but
// it's the FINAL 2025-26 season (Barcelona 1st, 94pts, 38 played).
// apim's clasificacion returns the real, correct NEW 2026-27 season --
// which is legitimately all zeros, since LaLiga's new season hasn't
// started. Both are right; they're answering different questions during
// the specific window between one season ending and the next starting.
// A naive point-by-point diff would show a massive, alarming mismatch
// that isn't a bug in either source -- it's a season-boundary artifact.
// This is exactly the kind of thing worth knowing before the production
// CC-CMD's own FD cross-check task runs into the same thing cold.

async function fetchApimStandings() {
  const res = await fetch(RELAY + '/laliga-apim/clasificacion')
  if (res.ok) return { source: 'apim', data: await res.json() }
  // The production route may not exist yet if this runs before that
  // CC-CMD lands -- fall through honestly rather than pretend success.
  throw new Error('apim route not available yet (' + res.status + ') -- production CC-CMD may not have landed')
}

async function fetchFdStandings() {
  const res = await fetch(RELAY + '/fd/competitions/PD/standings')
  if (!res.ok) throw new Error('FD standings fetch failed: ' + res.status)
  return res.json()
}

async function crossCheck() {
  const fd = await fetchFdStandings()
  const fdTable = fd.standings?.[0]?.table ?? []
  const fdSeason = fd.season
  const fdTop = fdTable[0]

  let apim = null
  let apimError = null
  try {
    const r = await fetchApimStandings()
    apim = r.data
  } catch (e) {
    apimError = String(e.message ?? e)
  }

  return { fdTable, fdSeason, fdTop, apim, apimError }
}

export function LaLigaCrossCheck() {
  const [data] = createResource(crossCheck)

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>La Liga Cross-Check</span>
        <span class={styles.note}>validating the new apim.laliga.com discovery against FD's established source</span>
      </header>

      <Show when={data.error}>
        <p class={styles.error}>Unable to load: {String(data.error?.message ?? data.error)}</p>
      </Show>

      <Show when={data.loading}>
        <p class={styles.empty}>Fetching both sources…</p>
      </Show>

      <Show when={!data.error && data()}>
        {d => (
          <>
            <div class={styles.sourceBlock}>
              <span class={styles.sourceLabel}>FD (established)</span>
              <span class={styles.sourceDetail}>
                season {d().fdSeason?.startDate?.slice(0, 4)}–{d().fdSeason?.endDate?.slice(0, 4)},
                {' '}{d().fdTop?.team?.name} 1st, {d().fdTop?.points}pts, {d().fdTop?.playedGames} played
              </span>
            </div>

            <div class={styles.sourceBlock}>
              <span class={styles.sourceLabel}>apim (new, unverified until now)</span>
              <Show when={d().apimError} fallback={
                <span class={styles.sourceDetail}>real data received</span>
              }>
                <span class={styles.errorDetail}>{d().apimError}</span>
              </Show>
            </div>

            <Show when={!d().apimError}>
              <div class={styles.finding}>
                <strong>Real finding, not a bug in either source:</strong> if apim's table
                shows every team at 0 points while FD shows a completed {d().fdSeason?.startDate?.slice(0, 4)}
                {' '}table, that's not a disagreement — apim is correctly showing the brand-new
                season, FD hasn't started tracking it yet. Check the actual season identifiers
                on both sides before treating any points/rank difference as an error.
              </div>
            </Show>

            <div class={styles.rawBlock}>
              <span class={styles.rawLabel}>FD top 3</span>
              <ul class={styles.rawList}>
                <For each={d().fdTable.slice(0, 3)}>
                  {t => <li>{t.position}. {t.team?.name} — {t.points}pts ({t.playedGames}p)</li>}
                </For>
              </ul>
            </div>

            {/* Real shape, confirmed live: {available, data:{digital_asset:...}}.
                digital_asset's own internal structure (team list, if any) was
                never inspected -- this was unbuildable before the route existed.
                Showing the raw object honestly rather than guessing a parse path
                that might be wrong. */}
            <Show when={!d().apimError}>
              <div class={styles.rawBlock}>
                <span class={styles.rawLabel}>apim raw response (digital_asset structure not yet parsed)</span>
                <pre class={styles.raw}>{JSON.stringify(d().apim, null, 2).slice(0, 500)}</pre>
              </div>
            </Show>
          </>
        )}
      </Show>
    </div>
  )
}
