import { Show, createResource, createSignal } from 'solid-js'
import styles from './BundesligaBroadcasters.module.css'

const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'

// BundesligaBroadcasters — rebuilt 2026-08-02 against the routes that
// actually shipped, not the one this originally guessed at.
//
// The original version called /bundesliga-bapi/broadcasters (plural,
// no params) -- that route was never built. Production went a
// different, two-step direction instead, both routes real and live:
//   1. GET /bundesliga-bapi/resolve-dayid?season=X&date=YYYY-MM-DD
//      -> {ok, dayId, comId} (or an honest {ok:false} if no matchday
//      contains that date -- e.g. before the season starts)
//   2. GET /bundesliga-bapi/broadcasts?comId=X&dayId=Y
//      -> {available, data:{broadcasts:[...]}}
//
// TWO REAL, CONFIRMED-LIVE CAVEATS THIS COMPONENT MUST HANDLE HONESTLY:
//   - Bundesliga's 2026-27 season starts Aug 28 (confirmed). Before
//     then, resolve-dayid correctly returns ok:false for any date --
//     that's not an error, it's the real, current state of the world.
//   - Every real check across the ENTIRE completed 2025-26 season
//     found broadcasts:[] -- confirmed structural (that endpoint
//     serves current/near-term data only, not a historical archive),
//     not a bug. So even a resolved, in-range date is very likely to
//     show a genuinely empty broadcast list right now, honestly.
//
// Cold resolve-dayid calls invoke real Browser Rendering server-side
// and can take up to ~45s (bounded binary search, max ~6 renders) --
// shown plainly rather than left looking hung.

async function fetchBundesligaBroadcasts(dateStr) {
  const [y, m] = dateStr.split('-').map(Number)
  const season = m >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`

  const resolveRes = await fetch(
    RELAY + '/bundesliga-bapi/resolve-dayid?season=' + season + '&date=' + dateStr
  )
  const resolved = await resolveRes.json()

  if (!resolved.ok) {
    // Real, honest non-error: no matchday covers this date (e.g. the
    // 2026-27 season hasn't started yet, or a mid-season gap week).
    return { state: 'no-matchday', season, dateStr, resolved }
  }

  const bRes = await fetch(
    RELAY + '/bundesliga-bapi/broadcasts?comId=' + resolved.comId + '&dayId=' + resolved.dayId
  )
  const broadcastData = await bRes.json()

  if (!broadcastData.available) {
    return { state: 'unavailable', season, dateStr, resolved, broadcastData }
  }

  const list = broadcastData.data?.broadcasts ?? []
  return { state: list.length ? 'has-data' : 'empty', season, dateStr, resolved, broadcastData, list }
}

export function BundesligaBroadcasters() {
  const today = new Date().toISOString().slice(0, 10)
  const [dateStr, setDateStr] = createSignal(today)
  const [data] = createResource(dateStr, fetchBundesligaBroadcasts)

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Bundesliga Broadcasters</span>
        <span class={styles.note}>real resolve-dayid → broadcasts chain, live</span>
      </header>

      <label class={styles.dateRow}>
        date
        <input
          type="date"
          value={dateStr()}
          onInput={e => setDateStr(e.target.value)}
          class={styles.dateInput}
        />
      </label>

      <Show when={data.error}>
        <p class={styles.error}>{String(data.error?.message ?? data.error)}</p>
      </Show>

      <Show when={data.loading}>
        <p class={styles.empty}>Resolving… (cold lookups render server-side, can take up to ~45s)</p>
      </Show>

      <Show when={!data.error && !data.loading && data()}>
        {d => (
          <>
            <Show when={d().state === 'no-matchday'}>
              <p class={styles.honestState}>
                No Bundesliga matchday covers {d().dateStr} — real, expected result.
                The 2026-27 season starts Aug 28, 2026; dates before then correctly
                have no matchday to resolve to.
              </p>
            </Show>

            <Show when={d().state === 'unavailable'}>
              <p class={styles.error}>
                Resolved to a real matchday ({d().resolved.dayId}) but the broadcasts
                lookup itself failed — relay-side issue, not a data gap.
              </p>
            </Show>

            <Show when={d().state === 'empty'}>
              <p class={styles.honestState}>
                Resolved real matchday {d().resolved.dayId} ({d().resolved.comId}) —
                broadcast list is empty. Confirmed structural, not a bug: this
                endpoint has only ever returned real data for current/near-term
                matchdays, never historical or far-future ones. Real broadcaster
                data becomes checkable once the season is actually underway
                (Aug 28+).
              </p>
            </Show>

            <Show when={d().state === 'has-data'}>
              <p class={styles.honestState}>
                Resolved matchday {d().resolved.dayId} — {d().list.length} real
                broadcast entr{d().list.length === 1 ? 'y' : 'ies'}. Field-name
                extraction is best-effort (never confirmed against real non-empty
                data before now) — raw shape shown below rather than a guessed parse.
              </p>
              <pre class={styles.raw}>{JSON.stringify(d().list, null, 2).slice(0, 800)}</pre>
            </Show>
          </>
        )}
      </Show>
    </div>
  )
}
