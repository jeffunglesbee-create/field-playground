import { createResource, createSignal, createMemo } from 'solid-js'
import { deskStore } from './relay'

// Real Open-Meteo integration, replacing the gated field-relay-nba
// /weather/today/ route (confirmed 403 in production -- see
// docs/outbox/cc-session-2026-07-26-weatherpoll-incident.md). CORS
// confirmed open (access-control-allow-origin: *, on both a plain GET
// and a real OPTIONS preflight) via a GitHub Actions probe -- this
// sandbox's own egress allowlist blocks api.open-meteo.com directly, so
// that answer had to come from a runner with real network access, not
// from here. See .github/workflows/open-meteo-probe.yml and
// outbox/open-meteo-probe.txt. CORS-open means the browser can call
// Open-Meteo directly; no relay/proxy route is needed.
const OM_BASE = 'https://api.open-meteo.com/v1/forecast'

// Coordinates for the venues this repo's mock slate actually uses
// (vite.config.js's context() mock), corrected 2026-07-26 against
// jubilant-bassoon's own src/utils/venues.js -- production's real,
// hand-maintained VENUE_COORDS table, read directly via FIELD_Handoff
// during the park-factor/ump-watch investigation (not the Drive docs
// used for the original June 26 pass, which only ever confirmed
// Citizens Bank Park and Globe Life Field's coordinates, not roof
// status). Cross-checking that source against this file surfaced two
// real defects, both fixed here, not worked around:
//
// 1. Globe Life Field was wrongly treated as outdoor. Production's own
//    table files it under "MLB retractable-roof / dome -> false" --
//    it's a closed dome, not a real weather venue. This file had no
//    positive confirmation it was outdoor when it was added; it just
//    was never excluded. Now removed, joining Footprint Center and
//    Target Center (both indoor NBA arenas) as venues with no
//    coordinate entry -- no entry means no weather fetch, which is the
//    correct outcome for an indoor venue, whether arena or dome.
// 2. America First Field, Red Bull Arena, and Dick's Sporting Goods
//    Park were carrying approximate public-knowledge coordinates,
//    unconfirmed against any FIELD-specific source. Dick's Sporting
//    Goods Park's was off by roughly 0.2 degrees of longitude (~10+
//    miles) -- enough to plausibly return a different local forecast.
//    All three replaced with production's own confirmed values.
//    Citizens Bank Park and Yankee Stadium already matched exactly, no
//    change needed there.
//
// FIELD production's real getVenueCoords/isOutdoorVenue use a
// base-name fuzzy match (splitting each side on the first comma) purely
// to reconcile production's own "Venue, City" key style against
// bare venue names -- not a keyword-based indoor/outdoor classifier.
// Not ported here: this repo's venue names already come through bare
// (no city suffix) from vite.config.js's mock data, so the fuzzy match
// would never have anything to reconcile -- it would be dead code
// solving a naming mismatch this repo doesn't have.
export const VENUE_COORDS = {
  'Citizens Bank Park': [39.9061, -75.1665],
  'Yankee Stadium': [40.8296, -73.9262],
  'America First Field': [40.5830, -111.8932],
  'Red Bull Arena': [40.7367, -74.1503],
  "Dick's Sporting Goods Park": [39.8057, -104.8919],
}

// Every real venue name in today's game list, known-coordinate or not --
// exported for VenueGeocodeRace, which needs the FULL set (including the
// 3 indoor venues -- Footprint Center, Target Center, and now Globe Life
// Field's retractable roof -- this module deliberately has no entry for)
// to compare against live geocoding results honestly.
export const allVenues = createMemo(() => {
  const games = [...(deskStore.games?.regular ?? []), ...(deskStore.games?.postseason ?? [])]
  return [...new Set(games.map(g => g.venue).filter(Boolean))]
})

// Unique, known-coordinate outdoor venues from today's real game list --
// recomputes whenever deskStore's games change (date navigation, poll),
// the same "derive real values instead of hardcoding" pattern App.jsx's
// streakTeam memo already uses for MultiDayStreak.
const outdoorVenues = createMemo(() => allVenues().filter(v => VENUE_COORDS[v]))

// In-memory per-coordinate cache, keyed like production's wxCache
// (rounded lat_lon) -- multiple venues that round to the same key would
// share one request, though this repo's venue set has no such overlap.
// TTL matches production's (2h): actual weather doesn't change fast
// enough to justify polling Open-Meteo itself more often, even though
// WeatherPoll's own setInterval fires every 45s -- that interval exists
// to prove independent poll-loop coexistence (see WeatherPoll's own
// comment), not because the weather data itself needs 45s freshness.
const wxCache = new Map()
const WX_TTL_MS = 2 * 60 * 60 * 1000

function describeConditions(current) {
  if (!current) return 'unknown'
  // precipitation includes snow, so it must be checked BEFORE the rain
  // fallback below -- otherwise snow (rain === 0, precipitation > 0)
  // gets mislabeled "rain".
  if (current.snowfall > 0) return 'snow'
  if (current.rain > 2) return 'heavy rain'
  if (current.rain > 0 || current.precipitation > 0) return 'rain'
  if (current.wind_speed_10m > 20) return 'windy'
  return current.is_day ? 'clear' : 'clear (night)'
}

async function fetchOneVenue(venue) {
  const [lat, lon] = VENUE_COORDS[venue]
  const key = `${lat.toFixed(2)}_${lon.toFixed(2)}`
  const cached = wxCache.get(key)
  if (cached && Date.now() - cached.fetchedAt < WX_TTL_MS) {
    return { venue, ...cached.data }
  }
  const url = `${OM_BASE}?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,rain,snowfall,is_day,wind_speed_10m,wind_direction_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error(`open-meteo fetch failed: ${res.status}`)
  const json = await res.json()
  const data = {
    tempF: Math.round(json.current?.temperature_2m),
    condition: describeConditions(json.current),
  }
  wxCache.set(key, { data, fetchedAt: Date.now() })
  return { venue, ...data }
}

// Promise.all would reject the ENTIRE batch on a single venue's failure,
// hiding every other venue's successful result behind one transient
// error -- allSettled means one bad venue degrades to just that venue
// missing from the list, not the whole poll going blank. Failures aren't
// separately cached (unlike successes): this repo's realistic worst-case
// load -- one browser tab polling 6 venues every 45s, ~8 req/min -- is
// nowhere near Open-Meteo's free-tier limits (600/min), so caching a
// failure state would add real complexity for a request-budget risk
// that doesn't actually exist at this scale.
async function fetchWeather(venues) {
  if (!venues || venues.length === 0) return { venues: [] }
  const settled = await Promise.allSettled(venues.map(fetchOneVenue))
  const results = settled.filter(r => r.status === 'fulfilled').map(r => r.value)
  // Empty results with a non-empty venue list means every single fetch
  // failed (total outage), not "no eligible venues" -- resolving to
  // { venues: [] } here would make WeatherPoll show the misleading
  // "no outdoor venues" empty state instead of its real error state.
  // Only genuinely zero eligible venues should reach that empty state.
  if (results.length === 0) throw new Error('all venue weather requests failed')
  return { venues: results }
}

export const [weatherData, { refetch: refetchWeather }] = createResource(outdoorVenues, fetchWeather)

export const [weatherPollCount, setWeatherPollCount] = createSignal(0)
