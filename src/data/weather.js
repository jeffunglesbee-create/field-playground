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
// (vite.config.js's context() mock). Citizens Bank Park and Globe Life
// Field are directly confirmed from FIELD's own production docs
// (Google Drive: "Novel Sports Data Sources", June 26 2026). Yankee
// Stadium, America First Field, Red Bull Arena, and Dick's Sporting
// Goods Park are not in any Drive doc this session could find (checked
// four separate searches, including the full production HTML source);
// their coordinates are well-established public stadium locations, not
// independently confirmed against a FIELD-specific source.
//
// Footprint Center and Target Center (both indoor NBA arenas, also
// present in this repo's game data) are deliberately absent -- no
// coordinate entry means no weather fetch, which is the correct outcome
// for an indoor venue. FIELD production's real VENUE_COORDS uses a
// fuzzy indoor-keyword classifier for its much larger (81+) venue
// catalog; that heuristic isn't ported here because it has a real false
// positive on this repo's own venue list -- "Red Bull Arena" contains
// "arena" but is an outdoor MLS stadium. An explicit table for this
// repo's small, closed venue set avoids that bug entirely.
const VENUE_COORDS = {
  'Citizens Bank Park': [39.9061, -75.1665],
  'Yankee Stadium': [40.8296, -73.9262],
  'Globe Life Field': [32.7511, -97.0832],
  'America First Field': [40.5828, -111.8936],
  'Red Bull Arena': [40.7367, -74.1500],
  "Dick's Sporting Goods Park": [39.8092, -104.6936],
}

// Unique, known-coordinate outdoor venues from today's real game list --
// recomputes whenever deskStore's games change (date navigation, poll),
// the same "derive real values instead of hardcoding" pattern App.jsx's
// streakTeam memo already uses for MultiDayStreak.
const outdoorVenues = createMemo(() => {
  const games = [...(deskStore.games?.regular ?? []), ...(deskStore.games?.postseason ?? [])]
  const names = [...new Set(games.map(g => g.venue).filter(Boolean))]
  return names.filter(v => VENUE_COORDS[v])
})

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
  const url = `${OM_BASE}?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,rain,is_day,wind_speed_10m,wind_direction_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`
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

async function fetchWeather(venues) {
  if (!venues || venues.length === 0) return { venues: [] }
  const results = await Promise.all(venues.map(fetchOneVenue))
  return { venues: results }
}

export const [weatherData, { refetch: refetchWeather }] = createResource(outdoorVenues, fetchWeather)

export const [weatherPollCount, setWeatherPollCount] = createSignal(0)
