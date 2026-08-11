// Parsing a FIELD game id, which is not one format but at least three.
//
// WHY THIS IS ITS OWN MODULE. PickStreak and outcomes.js each carried their
// own inline regex, and both assumed the id starts with a date. Measured
// against real ids from the relay (2026-08-08), that assumption holds for
// exactly one of the schemes in circulation:
//
//   2026-05-25-mlb-baltim-tampa                            drama leaderboard
//   MLS_2026-08-06_newyorkcityfc_clubsantoslaguna           archive, seed
//   MLS_MLS-COM-000006_MLS-MAT-000A3C_phaseone_2026-08-06   archive, series
//   FIFA World Cup 2026_2026-08-06_teamone_teamtwo          archive, mislabelled
//
// The three underscore forms all failed the old regex, and the failure was a
// silent `continue`: outcomes on those games vanished from the streak and from
// "this week", and setOutcome stored date: null. No error, no empty state --
// just a shorter record than reality. Exactly the silent src/data class the
// detection-latency probe found sitting at a p90 of 8.2 days.
//
// NO IMPORTS ON PURPOSE. There is no archive-keyed outcome in anyone's
// localStorage yet, so this cannot be verified by clicking through the app --
// a fixture test against the real measured ids is the only verification
// available. Keeping this module dependency-free is what lets
// scripts/check-gameid-parse.mjs import the shipped code rather than a copy.

// Both archive schemes place the date either second (sport_date_tail) or last
// (sport_series_round_date), and the leaderboard scheme places it first. So
// rather than anchor to a position, find the date wherever it is.
//
// The first match wins, and that is a real choice: "FIFA World Cup 2026_..."
// contains a bare 2026 before the date, which is why a looser year-hunting
// pattern would be wrong here. \d{4}-\d{2}-\d{2} cannot match it -- the bare
// year has no -MM-DD following it. If an id ever carries two full dates the
// first wins; none of the measured schemes does.
const DATE_RE = /\d{4}-\d{2}-\d{2}/

// Sport sits either before the first underscore (archive schemes, already
// cased: "MLS", "FIFA World Cup 2026") or in the hyphen segment immediately
// after a leading date (leaderboard scheme, lowercase: "mlb").
const LEADING_DATE_SPORT_RE = /^\d{4}-\d{2}-\d{2}-([a-z0-9]+)-/

export function parseGameId(gameId) {
  if (typeof gameId !== 'string' || !gameId) return { date: null, sport: null }

  const dateMatch = gameId.match(DATE_RE)
  const date = dateMatch ? dateMatch[0] : null

  let sport = null
  const leading = gameId.match(LEADING_DATE_SPORT_RE)
  if (leading) {
    sport = leading[1]
  } else if (gameId.includes('_')) {
    const head = gameId.slice(0, gameId.indexOf('_')).trim()
    if (head) sport = head
  }

  // The leaderboard scheme lowercases its sport ("mlb"); the archive schemes
  // carry real casing ("MLS", "FIFA World Cup 2026"). Uppercase only the
  // former -- blanket .toUpperCase() would render the latter as
  // "FIFA WORLD CUP 2026", shouting a label that is already correct.
  if (sport && !/[A-Z]/.test(sport)) sport = sport.toUpperCase()

  return { date, sport: sport || null }
}
