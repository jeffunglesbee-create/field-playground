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

// WHAT PRODUCTION'S WEATHER ENGINE DOES THAT THIS DOES NOT.
// Checked against Drive, 2026-08-11: "FIELD App - May 22 2026 Session
// Documentation (Weather Intelligence)". Recorded because the gap is much
// larger than "same idea, smaller table", and because one item makes weather
// an INPUT to a number this repo spends a lot of effort measuring.
//
//   WEATHER FEEDS THE DRAMA SCORE. weatherDramaModifier() returns a SIGNED
//   delta added to sitBonus inside dramaScoreLive():
//       cold <0F +8 (stacking with <28F +8), wind >20mph +6 (>30mph +4),
//       snow >0.5mm +10, heavy rain >2mm +8 (>5mm +4),
//       AQI >150 -15, AQI >200 -10
//   So a drama_arc is partly a weather series. Nothing here consumes that,
//   but anyone reasoning about why an arc rose should know a cold windy night
//   moves it without anything happening on the field.
//
//   PARK_ORIENTATION + windContextNote(): ~20 MLB parks mapped to degrees
//   from true north to centre field, turning wind direction into
//   "18mph out to CF -- hitter's conditions" vs "in from CF -- pitcher's".
//   Returns null under 8mph. NFL and non-MLB outdoor venues are an open item
//   in that doc, not an oversight here.
//
//   fetchAQI() against air-quality-api.open-meteo.com, 1h cache, non-blocking
//   so an AQI failure cannot fail the weather fetch. Wildfire smoke is the
//   real case.
//
//   Fields this file does not fetch: apparent_temperature, wind_gusts_10m,
//   direct_radiation (captured for a future sun-glare check, logic unwritten).
//
// This module fetches temperature and a condition string, and stops. That is
// a deliberate scope, not a partial port -- but the divergence is worth
// knowing before anyone treats this as equivalent.
//
// THE INCIDENT THAT DOC RECORDS, kept because it is the failure mode this
// file is shaped to avoid. Six helpers (wxDescription, wxIcon, wxAlert,
// wxBadge, isOutdoorVenue, getVenueCoords) were CALLED but never defined.
// fetchWeather's try/catch swallowed the ReferenceError silently, wxCache
// stayed empty, no badge ever rendered, the +10 drama bonus never fired --
// and FIELD_FEATURES carried 'weather-drama-bonus': '2026-05-19' the whole
// time. The doc's own words: "The feature-flag ... was a lie."
//
// Why this file cannot fail that way: fetchOneVenue THROWS on a non-ok
// response rather than returning null, fetchWeather uses allSettled so one
// venue's failure is visible as that venue missing, and a total failure
// throws rather than resolving to an empty list -- which is what keeps
// WeatherPoll's error state distinguishable from its no-venues state. A
// swallowed error here would surface as a blank section with no console
// output, the single hardest failure mode to diagnose in this codebase.

// Ported 2026-07-27 from jubilant-bassoon's src/utils/venues.js
// (production's own comprehensive, hand-maintained VENUE_COORDS table),
// read directly via FIELD_Handoff -- not a fabricated list. Replaces the
// 5-entry sample this file carried before, which only ever covered
// whatever venues happened to be in one earlier day's mock/relay slate
// and went to 0/13 hits the moment the real slate rotated to a
// different day's games (confirmed live via VenueGeocodeRace). A small
// hand-picked sample can't scale to a real, day-varying slate across 30
// MLB parks plus MLS/EPL/AFL/golf; the comprehensive table can.
//
// Format: [lat, lon, roofType], roofType one of:
//   'open'        -- no roof, ever. Always real outdoor conditions.
//   'retractable' -- has an operable roof. Real weather at the site
//                    either way; the roof decision itself is often MADE
//                    based on that weather.
//   'dome'        -- fully enclosed, no opening capability. Tropicana
//                    Field is the one true example in this table --
//                    every other "closed" MLB park below has a roof
//                    that actually opens.
//
// This diverges from production's own table in two real ways, both
// intentional, both noted here rather than silently ported wrong:
//
// 1. Production's table uses a flat isOutdoor true/false and treats
//    false as "don't fetch weather here" (getVenueCoords returns null
//    for any false entry). That's also what this file used to do for
//    Globe Life Field specifically (see the removed comment this
//    replaces). Reversed here: a retractable-roof or domed stadium
//    still has a real physical location with real weather -- the roof
//    affects what the GAME experiences, not whether weather data
//    exists to show. Every venue with known coordinates now gets
//    weather; roofType is separate, informational metadata (see
//    WeatherPoll's roof note), not a gate.
// 2. Production files loanDepot park under "MLB outdoor" (isOutdoor:
//    true). That's wrong -- it's Marlins Park, a real retractable-roof
//    stadium, same as Globe Life Field, Chase Field, etc. Filed under
//    'retractable' here instead of ported as-is.
//
// Deliberately bare venue names (no "City" suffix), matching this
// repo's existing convention: relay/mock venue names already come
// through bare, so production's own base-name fuzzy match (splitting on
// the first comma to reconcile "Venue, City" keys) would have nothing
// to reconcile here -- not ported, it'd be dead code. Where production
// carried both a bare and a "City"-suffixed key for the same venue,
// only the bare one is kept. Two more real-world aliases added beyond
// production's table, both venues that renamed after production's
// table was last updated, both confirmed live in this app's own real
// relay slate (2026-07-27's actual games, not the dev mock):
//   - "Rate Field" (formerly Guaranteed Rate Field, White Sox, renamed
//     2025) -- same physical park, both keys kept.
//   - "Daikin Park" (formerly Minute Maid Park, Astros, renamed 2025)
//     -- same physical park, both keys kept.
// "TPC Twin Cities" also added: not in production's table at all (its
// golf coverage curates majors/majors-adjacent stops; TPC Twin Cities
// hosts the 3M Open, which isn't among them), but a real, public,
// correctly-sourced course this repo's own real slate has repeatedly
// included (see JournalismBrief/BriefArchive's 3M Open coverage
// elsewhere in this app).
//
// Three MLB parks also added that are genuinely absent from production's
// table (confirmed via FIELD_Handoff read_source against
// jubilant-bassoon -- they only show up in unrelated seed SQL/doc files,
// never in venues.js itself), each appearing in this app's real
// 2026-07-27 slate: PNC Park (Pirates), Citi Field (Mets), Sutter Health
// Park (Athletics' temporary home, West Sacramento -- open air, no roof).
export const VENUE_COORDS = {
  // MLB, fixed open-air ───────────────────────────────────────────────
  'Fenway Park':                  [42.3467, -71.0972,  'open'],
  'Yankee Stadium':               [40.8296, -73.9262,  'open'],
  'Coors Field':                  [39.7559, -104.9942, 'open'],
  'Wrigley Field':                [41.9484, -87.6553,  'open'],
  'Oracle Park':                  [37.7786, -122.3893, 'open'],
  'Dodger Stadium':               [34.0739, -118.2400, 'open'],
  'Busch Stadium':                [38.6226, -90.1928,  'open'],
  'Nationals Park':               [38.8730, -77.0074,  'open'],
  'Citizens Bank Park':           [39.9061, -75.1665,  'open'],
  'Great American Ball Park':     [39.0979, -84.5069,  'open'],
  'Kauffman Stadium':             [39.0517, -94.4803,  'open'],
  'Comerica Park':                [42.3390, -83.0485,  'open'],
  'Petco Park':                   [32.7076, -117.1570, 'open'],
  'Oriole Park':                  [39.2838, -76.6218,  'open'],
  'Guaranteed Rate Field':        [41.8300, -87.6339,  'open'],
  'Rate Field':                   [41.8300, -87.6339,  'open'],
  'Angels Stadium':               [33.8003, -117.8827, 'open'],
  'Angel Stadium':                [33.8003, -117.8827, 'open'],
  'Progressive Field':            [41.4962, -81.6852,  'open'],
  'PNC Park':                     [40.4469, -80.0057,  'open'],
  'Citi Field':                   [40.7571, -73.8458,  'open'],
  'Sutter Health Park':           [38.5805, -121.5133, 'open'],
  // MLB, retractable roof ─────────────────────────────────────────────
  'Globe Life Field':             [32.7512, -97.0832,  'retractable'],
  'Chase Field':                  [33.4453, -112.0667, 'retractable'],
  'American Family Field':        [43.0284, -87.9712,  'retractable'],
  'Minute Maid Park':             [29.7573, -95.3555,  'retractable'],
  'Daikin Park':                  [29.7573, -95.3555,  'retractable'],
  'T-Mobile Park':                [47.5914, -122.3325, 'retractable'],
  'Rogers Centre':                [43.6414, -79.3894,  'retractable'],
  "loanDepot park":               [25.7781, -80.2195,  'retractable'],
  // MLB, fixed dome (no opening) ──────────────────────────────────────
  'Tropicana Field':              [27.7682, -82.6534,  'dome'],
  // MLS / soccer ──────────────────────────────────────────────────────
  'Gillette Stadium':             [42.0909, -71.2643,  'open'],
  'Red Bull Arena':               [40.7367, -74.1503,  'open'],
  "Children's Mercy Park":        [39.1225, -94.8239,  'open'],
  'CityPark':                     [38.6317, -90.2016,  'open'],
  'America First Field':          [40.5830, -111.8932, 'open'],
  'Snapdragon Stadium':           [32.7831, -117.1199, 'open'],
  'Stade Saputo':                 [45.5640, -73.5518,  'open'],
  'BMO Field':                    [43.6333, -79.4186,  'open'],
  'Chase Stadium':                [26.1947, -80.1506,  'open'],
  'Subaru Park':                  [39.8334, -75.3808,  'open'],
  'Bank of America Stadium':      [35.2259, -80.8529,  'open'],
  'Audi Field':                   [38.8695, -77.0125,  'open'],
  'Lower.com Field':              [39.9690, -83.0154,  'open'],
  'TQL Stadium':                  [39.1051, -84.5182,  'open'],
  'Inter&Co Stadium':             [28.5415, -81.3893,  'open'],
  'GEODIS Park':                  [36.1307, -86.7665,  'open'],
  'Soldier Field':                [41.8623, -87.6167,  'open'],
  'Allianz Field':                [44.9530, -93.1649,  'open'],
  'BMO Stadium':                  [34.0130, -118.2845, 'open'],
  'Dignity Health Sports Park':   [33.8643, -118.2611, 'open'],
  'Lumen Field':                  [47.5952, -122.3316, 'open'],
  'Providence Park':              [45.5215, -122.6917, 'open'],
  'PayPal Park':                  [37.3519, -121.9254, 'open'],
  "Dick's Sporting Goods Park":   [39.8057, -104.8919, 'open'],
  'Q2 Stadium':                   [30.3872, -97.7180,  'open'],
  'Shell Energy Stadium':         [29.7523, -95.3511,  'open'],
  'Toyota Stadium':               [33.1545, -96.8353,  'open'],
  'Mercedes-Benz Stadium':        [33.7555, -84.4010,  'retractable'],
  'BC Place':                     [49.2768, -123.1118, 'retractable'],
  // EPL / European soccer ─────────────────────────────────────────────
  'Anfield':                      [53.4308, -2.9608,   'open'],
  'Etihad Stadium':               [53.4831, -2.2004,   'open'],
  'Craven Cottage':               [51.4749, -0.2218,   'open'],
  'Amex Stadium':                 [50.8619, -0.0831,   'open'],
  'Stadium of Light':             [54.9147, -1.3882,   'open'],
  'Villa Park':                   [52.5090, -1.8847,   'open'],
  'Turf Moor':                    [53.7889, -2.2302,   'open'],
  'Selhurst Park':                [51.3983, -0.0855,   'open'],
  'City Ground':                  [52.9401, -1.1326,   'open'],
  'Riverside Stadium':            [54.5785, -1.2170,   'open'],
  "St Mary's Stadium":            [50.9058, -1.3910,   'open'],
  'MKM Stadium':                  [53.7463, -0.3674,   'open'],
  'The Den':                      [51.4851, -0.0509,   'open'],
  'London Stadium':               [51.5386, -0.0163,   'open'],
  'Allianz Arena':                [48.2188, 11.6247,   'open'],
  'Europa-Park Stadion':          [48.0221, 7.8275,    'open'],
  'Stade de la Meinau':           [48.5601, 7.7534,    'open'],
  // AFL ────────────────────────────────────────────────────────────────
  'MCG':                          [-37.8200, 144.9834, 'open'],
  'ENGIE Stadium':                [-33.8472, 151.0635, 'open'],
  'TIO Stadium':                  [-12.4170, 130.8694, 'open'],
  'People First Stadium':         [-28.0056, 153.4028, 'open'],
  'Marvel Stadium':               [-37.8169, 144.9479, 'retractable'],
  // Tennis / cricket ──────────────────────────────────────────────────
  'Foro Italico':                 [41.9339, 12.4672,   'open'],
  'Rajiv Gandhi International Stadium': [17.4046, 78.5480, 'open'],
  'Sawai Mansingh Stadium':       [26.8952, 75.8068,   'open'],
  // Golf ───────────────────────────────────────────────────────────────
  'Quail Hollow Club':            [35.0527, -80.8328,  'open'],
  'Aronimink Golf Club':          [39.9654, -75.4165,  'open'],
  'Augusta National Golf Club':   [33.5024, -82.0238,  'open'],
  'Pinehurst No. 2':              [35.1946, -79.4657,  'open'],
  'Pebble Beach Golf Links':      [36.5683, -121.9478, 'open'],
  'TPC Sawgrass':                 [30.1975, -81.3957,  'open'],
  'Riviera Country Club':         [34.0397, -118.5085, 'open'],
  'Torrey Pines South Course':    [32.8971, -117.2519, 'open'],
  'Harbour Town Golf Links':      [32.1380, -80.6686,  'open'],
  'TPC Scottsdale':               [33.6606, -111.8926, 'open'],
  'Muirfield Village Golf Club':  [40.1034, -83.0685,  'open'],
  'East Lake Golf Club':          [33.7115, -84.2896,  'open'],
  'St Andrews Links Old Course':  [56.3435, -2.8013,   'open'],
  'Royal Troon Golf Club':        [55.5333, -4.6667,   'open'],
  "Royal St George's Golf Club":  [51.2010, 1.3880,    'open'],
  'Dunes Golf and Beach Club':    [33.7490, -78.8138,  'open'],
  'Colonial Country Club':        [32.7247, -97.3592,  'open'],
  'TPC Twin Cities':              [45.1858, -93.2119,  'open'],
}

// Every real venue name in today's game list, known-coordinate or not --
// exported for VenueGeocodeRace, which needs the FULL set to compare
// against live geocoding results honestly. Only Footprint Center and
// Target Center (NBA arenas -- fully enclosed, no roof of any kind,
// zero outdoor weather relevance ever) have no entry above; every
// retractable-roof and domed stadium now does, having real weather at
// a real location whether or not the roof happens to be closed.
export const allVenues = createMemo(() => {
  const games = [...(deskStore.games?.regular ?? []), ...(deskStore.games?.postseason ?? [])]
  return [...new Set(games.map(g => g.venue).filter(Boolean))]
})

// Unique venues from today's real game list that have a known
// coordinate entry above -- recomputes whenever deskStore's games
// change (date navigation, poll), the same "derive real values instead
// of hardcoding" pattern App.jsx's streakTeam memo already uses for
// MultiDayStreak. Deliberately NOT filtered by roofType: a retractable
// or domed venue still has real weather at its real location, so it's
// included here on the same basis as a fully open-air park -- only "do
// we know where it is" gates inclusion, not roof type.
const weatherEligibleVenues = createMemo(() => allVenues().filter(v => VENUE_COORDS[v]))

// In-memory per-coordinate cache, keyed like production's wxCache
// (rounded lat_lon) -- multiple venues that round to the same key would
// share one request (this repo's larger venue set now makes that a real
// possibility, e.g. Minute Maid Park/Daikin Park share exact
// coordinates on purpose, as aliases for the same physical park).
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
  const [lat, lon, roofType] = VENUE_COORDS[venue]
  const key = `${lat.toFixed(2)}_${lon.toFixed(2)}`
  const cached = wxCache.get(key)
  if (cached && Date.now() - cached.fetchedAt < WX_TTL_MS) {
    return { venue, roofType, ...cached.data }
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
  return { venue, roofType, ...data }
}

// Promise.all would reject the ENTIRE batch on a single venue's failure,
// hiding every other venue's successful result behind one transient
// error -- allSettled means one bad venue degrades to just that venue
// missing from the list, not the whole poll going blank. Failures aren't
// separately cached (unlike successes): this repo's realistic worst-case
// load -- one browser tab polling a slate's worth of venues every 45s --
// is nowhere near Open-Meteo's free-tier limits (600/min), so caching a
// failure state would add real complexity for a request-budget risk
// that doesn't actually exist at this scale.
async function fetchWeather(venues) {
  if (!venues || venues.length === 0) return { venues: [] }
  const settled = await Promise.allSettled(venues.map(fetchOneVenue))
  const results = settled.filter(r => r.status === 'fulfilled').map(r => r.value)
  // Empty results with a non-empty venue list means every single fetch
  // failed (total outage), not "no eligible venues" -- resolving to
  // { venues: [] } here would make WeatherPoll show the misleading
  // "no venues" empty state instead of its real error state. Only
  // genuinely zero eligible venues should reach that empty state.
  if (results.length === 0) throw new Error('all venue weather requests failed')
  return { venues: results }
}

export const [weatherData, { refetch: refetchWeather }] = createResource(weatherEligibleVenues, fetchWeather)

export const [weatherPollCount, setWeatherPollCount] = createSignal(0)
