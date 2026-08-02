import { For, Show, createResource } from 'solid-js'
import styles from './BundesligaBroadcasters.module.css'

const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'

// BundesligaBroadcasters — real broadcaster data from
// wapp.bapi.bundesliga.com, found via the same real network-capture
// method that found LaLiga's apim.laliga.com, confirmed on two
// independent CI runs.
//
// DELIBERATELY SCOPED TO /broadcasters ONLY. The capture also found a
// real, working /broadcasts/{competitionId}/{matchdayId} endpoint --
// but the matchday ID captured (DFL-DAY-004CBT) is opaque, not a
// constructible sequence, and was only ever observed for whatever
// match the site happened to be showing during capture. Wiring that
// endpoint here with a hardcoded ID would silently always show one
// specific historical matchday's broadcasts regardless of what's
// actually happening now -- exactly the kind of fabricated-looking
// correctness this project has repeatedly caught and rejected
// elsewhere. The production CC-CMD (docs/CC-CMD-2026-08-02-wire-
// bundesliga-bapi-broadcasts.md, jubilant-bassoon) is investigating
// how that ID is really resolved for arbitrary dates. This component
// builds only the half that's genuinely safe to use today: the
// broadcaster list itself takes no match-specific ID at all.
//
// This does NOT call wapp.bapi.bundesliga.com directly from the
// client -- CORS would very likely block it even if it didn't, and
// this project's convention throughout today (FD/FPL/BSD/apim) is
// relay-proxied, server-side. This calls the relay route instead;
// until that route exists, this honestly shows "not available yet",
// same pattern as BsdXgPanel/LaLigaCrossCheck before their production
// CC-CMDs landed.

async function fetchBroadcasters() {
  const res = await fetch(RELAY + '/bundesliga-bapi/broadcasters?promoteInHeader=true')
  if (!res.ok) throw new Error('relay route not available yet (' + res.status + ') -- production CC-CMD may not have landed')
  return res.json()
}

export function BundesligaBroadcasters() {
  const [data] = createResource(fetchBroadcasters)

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Bundesliga Broadcasters</span>
        <span class={styles.note}>real wapp.bapi.bundesliga.com data — broadcaster list only, matchday-specific lookups pending ID resolution</span>
      </header>

      <Show when={data.error}>
        <p class={styles.error}>{String(data.error?.message ?? data.error)}</p>
      </Show>

      <Show when={data.loading}>
        <p class={styles.empty}>Fetching real broadcaster data…</p>
      </Show>

      <Show when={!data.error && data()}>
        {d => (
          <>
            <Show when={Array.isArray(d())} fallback={
              <pre class={styles.raw}>{JSON.stringify(d(), null, 2).slice(0, 600)}</pre>
            }>
              <ul class={styles.list}>
                <For each={d()}>
                  {b => <li class={styles.item}>{b.name ?? JSON.stringify(b).slice(0, 80)}</li>}
                </For>
              </ul>
            </Show>

            <div class={styles.pending}>
              <strong>Not wired here:</strong> match-specific broadcast lookups
              (which channel is showing a given game). The real endpoint exists
              and was confirmed live, but its matchday ID format is opaque —
              pending the production CC-CMD's resolution investigation before
              this can safely show anything beyond the general broadcaster list.
            </div>
          </>
        )}
      </Show>
    </div>
  )
}
