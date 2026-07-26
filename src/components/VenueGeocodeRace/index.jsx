import { For, Show, createResource, createSignal } from 'solid-js'
import { allVenues, VENUE_COORDS } from '../../data/weather'
import styles from './VenueGeocodeRace.module.css'

// The follow-up docs/outbox/chat-update-2026-07-26-weather-endpoint-investigation.md
// proposed: run Open-Meteo's geocoding API head-to-head against this
// repo's hand-maintained VENUE_COORDS table for today's real venues, and
// test its prediction that geocoding can find coordinates but can't know
// whether a venue is domed.
//
// A GitHub Actions probe (.github/workflows/open-meteo-probe.yml,
// outbox/open-meteo-geocoding-probe.txt -- this sandbox can't reach
// geocoding-api.open-meteo.com directly, same CI-as-proxy pattern as the
// weather fix itself) already ran this exact comparison and found
// something stronger than the prediction: geocoding-by-venue-name
// resolved only 1 of 8 real venues (Citizens Bank Park). The other 7 --
// Yankee Stadium, Globe Life Field, America First Field, Red Bull Arena,
// Dick's Sporting Goods Park, Footprint Center, Target Center -- all came
// back with zero results. Open-Meteo's geocoder is built on a
// populated-places/POI gazetteer, not a sports-venue database; branded
// stadium names mostly aren't in it at all, not just missing an
// indoor/outdoor flag. This component re-runs that same comparison live,
// in the browser, against today's real slate, so the CI probe's finding
// is something you can watch happen rather than just read.
const OM_GEOCODE_BASE = 'https://geocoding-api.open-meteo.com/v1/search'

async function geocodeOne(venue) {
  const url = `${OM_GEOCODE_BASE}?name=${encodeURIComponent(venue)}&count=1&language=en&format=json`
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error(`geocoding fetch failed: ${res.status}`)
  const json = await res.json()
  const hit = json.results?.[0]
  return hit
    ? { venue, hit: true, lat: hit.latitude, lon: hit.longitude, featureCode: hit.feature_code ?? null, matchedName: hit.name }
    : { venue, hit: false }
}

async function raceAll(venues) {
  if (!venues || venues.length === 0) return []
  const settled = await Promise.allSettled(venues.map(geocodeOne))
  return settled.map((r, i) => r.status === 'fulfilled' ? r.value : { venue: venues[i], hit: false, error: String(r.reason) })
}

export function VenueGeocodeRace() {
  const [runCount, setRunCount] = createSignal(0)
  const [geocodeResults, { refetch }] = createResource(() => (runCount() > 0 ? allVenues() : undefined), raceAll)

  function run() {
    setRunCount(c => c + 1)
    if (runCount() > 1) refetch()
  }

  const staticHits = () => allVenues().filter(v => VENUE_COORDS[v]).length
  const geocodeHits = () => (geocodeResults() ?? []).filter(r => r.hit).length

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Venue Geocode Race</span>
        <span class={styles.sublabel}>static table vs. live geocoding-api.open-meteo.com</span>
      </header>
      <p class={styles.note}>
        Static table lookup is instant and synchronous. Geocoding is a real, live fetch per
        venue, raced in parallel via <code>Promise.allSettled</code>. Same real venue names
        WeatherPoll actually uses, tested against a live API rather than assumed to work.
      </p>
      <Show
        when={runCount() > 0}
        fallback={<button class={styles.runBtn} onClick={run}>run comparison</button>}
      >
        <button class={styles.runBtn} onClick={run} disabled={geocodeResults.loading}>
          {geocodeResults.loading ? 'racing…' : 're-run'}
        </button>
        <div class={styles.tally}>
          static table: {staticHits()}/{allVenues().length} ·{' '}
          live geocoding: <Show when={!geocodeResults.loading} fallback="…">{geocodeHits()}/{allVenues().length}</Show>
        </div>
        <Show when={geocodeResults.error}>
          <p class={styles.empty}>Geocoding race failed{geocodeResults.error?.message ? `: ${geocodeResults.error.message}` : ''}.</p>
        </Show>
        <Show when={!geocodeResults.error}>
          <div class={styles.rowList}>
            <For each={allVenues()}>
              {venue => {
                const staticHit = () => VENUE_COORDS[venue]
                const geoResult = () => geocodeResults()?.find(r => r.venue === venue)
                return (
                  <div class={styles.row}>
                    <span class={styles.venueName}>{venue}</span>
                    <span classList={{ [styles.hit]: !!staticHit(), [styles.miss]: !staticHit() }}>
                      table: {staticHit() ? `${staticHit()[0]}, ${staticHit()[1]}` : 'miss'}
                    </span>
                    <Show
                      when={!geocodeResults.loading}
                      fallback={<span class={styles.pending}>geocoding: …</span>}
                    >
                      <span classList={{ [styles.hit]: !!geoResult()?.hit, [styles.miss]: !geoResult()?.hit }}>
                        geocode: {geoResult()?.hit ? `${geoResult().lat.toFixed(4)}, ${geoResult().lon.toFixed(4)} (${geoResult().featureCode ?? '?'})` : 'miss'}
                      </span>
                    </Show>
                  </div>
                )
              }}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  )
}
