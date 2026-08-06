// Scope the soccer sport-label defect found while scoping the penalty bug.
//
// SYMPTOM (measured 2026-08-06): archived rows for plainly-MLS fixtures carry
//   game_id = "FIFA World Cup 2026_2026-08-01_cfmontral_newengland"
//   sport   = "FIFA World Cup"
// e.g. New England @ CF Montréal, LAFC @ Vancouver, Kansas City @ St. Louis.
//
// ROOT CAUSE, read directly in field-relay-nba/src/index.js at three archive
// write sites (lines ~7084, ~7170, ~7254 -- catch-up, pre-game seed, and
// yesterday-finals):
//
//   sport: gm.sport === 'soccer' ? 'FIFA World Cup 2026' : gm.league,
//
// `gm.sport` is ESPN's TOP-LEVEL sport ('soccer'), not the competition. So the
// ternary relabels EVERY soccer league as the World Cup. The LEAGUES table
// immediately above it already carries correct labels (EPL, MLS, La Liga,
// Serie A, Bundesliga, Ligue 1, FIFA World Cup) and gameMeta already stores
// them as `gm.league` -- the ternary overrides a correct value with a wrong one.
//
// So the defect is NOT MLS-specific: all six non-WC soccer leagues are exposed.
// This probe measures which ones actually have archived rows and how many, so
// the fix and any data migration are scoped on counts rather than on the one
// league that happened to be noticed.
//
// TRUE league is resolved from ESPN itself per event id, not inferred from team
// names -- inferring it would be the same guess-instead-of-measure that produced
// the bug.
//
// field-relay-nba.jeffunglesbee.workers.dev is sandbox-blocked from chat --
// CI-as-proxy, same pattern as every real-data probe in this repo.

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/soccer-league-mislabel-scope-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const UA = 'field-playground-probe/1.0 (github.com/jeffunglesbee-create/field-playground; research)'
const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'
const DAYS = Number(process.env.PROBE_DAYS || 30)
const MAX_GAMES = Number(process.env.PROBE_MAX_GAMES || 80)

function shiftDate(base, deltaDays) {
  const d = new Date(base + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().split('T')[0]
}

async function fetchDate(date) {
  const res = await fetch(`${RELAY}/context/date/${date}`, { headers: { 'User-Agent': UA } })
  if (!res.ok) return { err: 'HTTP ' + res.status }
  const data = await res.json()
  return {
    games: [
      ...(data?.games?.regular ?? []),
      ...(data?.games?.postseason ?? []),
    ].map(g => ({ ...g, _date: date })),
  }
}

const isSoccerish = sport => {
  const s = String(sport || '').toLowerCase()
  return ['soccer', 'mls', 'epl', 'world cup', 'fifa', 'liga', 'ligue', 'serie a', 'bundesliga', 'premier']
    .some(t => s.includes(t))
}

// ESPN's own answer for "what competition is this event?" -- read from the
// summary payload rather than guessed from club names. Several shapes are tried
// because the payload differs between competitions; whichever resolves is
// reported alongside the value so the source of truth stays visible.
function extractLeague(summary) {
  const cands = [
    ['header.league.name', summary?.header?.league?.name],
    ['header.league.slug', summary?.header?.league?.slug],
    ['header.leagues[0].name', summary?.header?.leagues?.[0]?.name],
    ['header.leagues[0].slug', summary?.header?.leagues?.[0]?.slug],
    ['leagues[0].name', summary?.leagues?.[0]?.name],
    ['leagues[0].slug', summary?.leagues?.[0]?.slug],
    ['header.season.slug', summary?.header?.season?.slug],
  ]
  for (const [path, v] of cands) if (v) return { path, value: String(v) }
  return null
}

// Map an ESPN league name/slug onto the label the relay's own LEAGUES table
// uses, so "expected" is stated in the relay's vocabulary rather than ESPN's.
function toRelayLabel(espn) {
  const s = String(espn || '').toLowerCase()
  if (s.includes('world cup') || s.includes('fifa.world')) return 'FIFA World Cup'
  if (s.includes('major league soccer') || s.includes('usa.1') || s === 'mls') return 'MLS'
  if (s.includes('premier league') || s.includes('eng.1')) return 'EPL'
  if (s.includes('laliga') || s.includes('la liga') || s.includes('esp.1')) return 'La Liga'
  if (s.includes('serie a') || s.includes('ita.1')) return 'Serie A'
  if (s.includes('bundesliga') || s.includes('ger.1')) return 'Bundesliga'
  if (s.includes('ligue 1') || s.includes('fra.1')) return 'Ligue 1'
  return null
}

async function main() {
  const today = new Date().toISOString().split('T')[0]
  log('probe_at: ' + new Date().toISOString())
  log('purpose: scope the soccer sport-label defect -- how many archived rows, across which')
  log('REAL competitions, are stored under the wrong label by the relay\'s three archive')
  log('write sites. Truth comes from ESPN per event id, never inferred from team names.')
  log(`window: ${DAYS} real days back from ${today}`)
  log('')

  const all = []
  let daysOk = 0
  for (let i = 0; i < DAYS; i++) {
    const date = shiftDate(today, -i)
    const r = await fetchDate(date)
    if (r.err) { log(`  ${date} FAILED ${r.err}`); await new Promise(s => setTimeout(s, 250)); continue }
    daysOk++
    all.push(...r.games)
    await new Promise(s => setTimeout(s, 250))
  }
  log(`days fetched OK: ${daysOk} / ${DAYS}`)
  if (!daysOk) {
    log('')
    log('=== VERDICT ===')
    log('NO DATA. Every date fetch failed -- nothing was retrieved. This run answers nothing.')
    log('HTTP 403 on every day means the probe is running outside CI; the relay is')
    log('sandbox-blocked from chat, which is why this exists as a workflow.')
    return
  }

  const soccer = all.filter(g => isSoccerish(g.sport))
  const withEid = soccer.filter(g => g.espn_event_id)
  log('')
  log('=== POPULATION ===')
  log('real games in window:            ' + all.length)
  log('real soccer-ish archived rows:   ' + soccer.length)
  log('  ...with an espn_event_id:      ' + withEid.length + '   (only these can be checked against ESPN)')
  log('  ...without one:                ' + (soccer.length - withEid.length) + '   <- unverifiable, reported not hidden')
  log('')
  log('archived `sport` labels as stored:')
  const storedCounts = new Map()
  for (const g of soccer) storedCounts.set(g.sport, (storedCounts.get(g.sport) ?? 0) + 1)
  for (const [k, n] of [...storedCounts.entries()].sort((a, b) => b[1] - a[1])) log(`  "${k}": ${n}`)
  log('')

  const target = withEid.slice(0, MAX_GAMES)
  if (target.length < withEid.length) {
    log(`NOTE: capped at ${MAX_GAMES} of ${withEid.length} eligible rows; ${withEid.length - target.length} not checked.`)
    log('')
  }

  log('=== PER-ROW: stored label vs ESPN\'s real competition ===')
  const mismatched = [], matched = [], unresolved = []
  const pathsUsed = new Map()
  for (const g of target) {
    // The summary endpoint resolves by event id; the slug in the path is not
    // authoritative, which is precisely why the stored label cannot be trusted
    // to route anything.
    const url = `${RELAY}/espn-summary/sports/soccer/fifa.world/summary?event=${g.espn_event_id}`
    let summary
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      if (!res.ok) { unresolved.push({ g, why: 'HTTP ' + res.status }); await new Promise(s => setTimeout(s, 250)); continue }
      summary = await res.json()
    } catch (e) { unresolved.push({ g, why: String(e?.message || e) }); await new Promise(s => setTimeout(s, 250)); continue }

    const found = extractLeague(summary)
    if (!found) { unresolved.push({ g, why: 'no league field in summary payload' }); await new Promise(s => setTimeout(s, 250)); continue }
    pathsUsed.set(found.path, (pathsUsed.get(found.path) ?? 0) + 1)

    const expected = toRelayLabel(found.value)
    const row = { g, espnLeague: found.value, path: found.path, expected }
    if (!expected) { unresolved.push({ g, why: `ESPN league "${found.value}" not in the relay's LEAGUES table` }) }
    else if (String(g.sport).trim().toLowerCase() === expected.toLowerCase()) matched.push(row)
    else mismatched.push(row)
    await new Promise(s => setTimeout(s, 250))
  }

  log(`  resolved: ${matched.length + mismatched.length}   unresolved: ${unresolved.length}`)
  log('  ESPN payload path used to resolve league: ' +
      ([...pathsUsed.entries()].map(([p, n]) => `${p} x${n}`).join(', ') || '(none)'))
  log('')

  log('=== MISLABELED ROWS, grouped by the competition they REALLY are ===')
  if (!mismatched.length) {
    log('  none in this sample.')
  } else {
    const byExpected = new Map()
    for (const r of mismatched) {
      const k = r.expected
      if (!byExpected.has(k)) byExpected.set(k, [])
      byExpected.get(k).push(r)
    }
    for (const [expected, rows] of [...byExpected.entries()].sort((a, b) => b[1].length - a[1].length)) {
      log(`  REAL competition: ${expected}  --  ${rows.length} rows stored under the wrong label`)
      const storedAs = new Map()
      for (const r of rows) storedAs.set(r.g.sport, (storedAs.get(r.g.sport) ?? 0) + 1)
      for (const [s, n] of storedAs) log(`      stored as "${s}": ${n}`)
      for (const r of rows.slice(0, 6)) {
        log(`      ${r.g._date}  ${r.g.away ?? '?'} @ ${r.g.home ?? '?'}  event=${r.g.espn_event_id}`)
        log(`          game_id=${r.g.game_id ?? r.g.id ?? '?'}`)
      }
      if (rows.length > 6) log(`      ...and ${rows.length - 6} more`)
    }
  }
  log('')

  if (unresolved.length) {
    log('=== UNRESOLVED (reported, not silently dropped) ===')
    const whyCounts = new Map()
    for (const u of unresolved) whyCounts.set(u.why, (whyCounts.get(u.why) ?? 0) + 1)
    for (const [w, n] of whyCounts) log(`  ${w}: ${n}`)
    log('')
  }

  log('=== VERDICT ===')
  const checked = matched.length + mismatched.length
  if (!checked) {
    log('NO ROWS RESOLVED. ESPN\'s competition could not be read for any row, so stored labels')
    log('could not be compared to anything. This is a no-signal run, not an all-clear.')
    return
  }
  if (!mismatched.length) {
    log(`CLEAN on this sample: all ${checked} resolved rows carry the label matching ESPN's real`)
    log('competition. If the three-site ternary is still present in the relay, this is more')
    log('likely a sampling artifact than a fix -- check whether the window contained any')
    log('non-WC soccer at all before reading it as green.')
    return
  }
  const pct = ((mismatched.length / checked) * 100).toFixed(1)
  log(`MISLABEL CONFIRMED AND SCOPED: ${mismatched.length} of ${checked} resolved rows (${pct}%) are stored`)
  log('under a competition label that is not the competition they belong to.')
  log('')
  log('Consequences that are NOT cosmetic:')
  log('  - Per-sport bucketing (anomaly baselines, the 2026-08-06 hygiene distributions) pools')
  log('    these rows into the wrong sport. The "FIFA World Cup" per-sport stats reported')
  log('    earlier this session are computed over a bucket that is partly other leagues.')
  log('  - soccerLeagueSlug() in drama-backfill.mjs derives an ESPN league slug FROM this')
  log('    stored label, so a wrong label sends historical fetches at the wrong competition.')
  log('  - analytics-engine.js maps both "FIFA World Cup" and "FIFA World Cup 2026" onto the')
  log('    WC26 config key, so non-WC rows inherit WC26 configuration.')
  log('  - Users see the wrong competition name on real fixtures.')
  log('')
  // ---- Emit a ready-to-review migration, with the real ids ----
  // The correction is scoped by espn_event_id, which every mislabeled row
  // carries, so it targets exactly the measured rows -- no LIKE on the label,
  // no pattern matching, nothing that could sweep in a real World Cup game.
  //
  // `sport` ONLY. game_id is deliberately left alone: briefs.game_id joins
  // games.id in four places in analytics-engine.js (lines 999, 1005, 1411,
  // 1417), so rewriting the id prefix would silently drop those joins for any
  // brief already referencing these rows. The prefix is legacy cosmetics; the
  // column is what drives bucketing, soccerLeagueSlug(), the analytics config
  // key, and display.
  const sqlPath = outPath.replace(/\.txt$/, '.sql')
  const byLeague = new Map()
  for (const r of mismatched) {
    if (!byLeague.has(r.expected)) byLeague.set(r.expected, [])
    byLeague.get(r.expected).push(r)
  }
  const sql = []
  sql.push('-- Soccer sport-label correction, generated from a real measured run.')
  sql.push('-- Source: ' + outPath)
  sql.push('-- Generated: ' + new Date().toISOString())
  sql.push('-- Truth: ESPN header.league.name, resolved per espn_event_id. Not inferred.')
  sql.push('--')
  sql.push('-- Corrects the `sport` COLUMN ONLY. Does NOT touch game_id: briefs.game_id')
  sql.push('-- joins games.id in analytics-engine.js:999/1005/1411/1417, so rewriting the')
  sql.push('-- id prefix would silently break those joins.')
  sql.push('-- Not a drama_peak write -- the immutability guard is not involved.')
  sql.push('')
  sql.push('-- BEFORE-STATE (run first, keep the output):')
  const allIds = mismatched.map(r => `'${String(r.g.espn_event_id).replace(/'/g, "''")}'`)
  for (const table of ['regular_season_games', 'postseason_games']) {
    sql.push(`SELECT '${table}' AS tbl, espn_event_id, sport, id, home, away, date`)
    sql.push(`  FROM ${table} WHERE espn_event_id IN (${allIds.join(', ')});`)
  }
  sql.push('')
  for (const [expected, rows] of byLeague) {
    const ids = rows.map(r => `'${String(r.g.espn_event_id).replace(/'/g, "''")}'`)
    sql.push(`-- ${rows.length} rows whose real competition is ${expected}`)
    for (const table of ['regular_season_games', 'postseason_games']) {
      sql.push(`UPDATE ${table} SET sport = '${expected.replace(/'/g, "''")}'`)
      sql.push(`  WHERE espn_event_id IN (${ids.join(', ')});`)
    }
    sql.push('')
  }
  sql.push('-- AFTER-STATE (re-run the before-state SELECTs and diff them).')
  sql.push('-- Then re-run this probe: mismatched should drop to 0 for the corrected rows.')
  try {
    writeFileSync(sqlPath, sql.join('\n') + '\n')
    log(`Migration written: ${sqlPath}  (${mismatched.length} rows, sport column only)`)
    log('')
  } catch (e) { log('could not write migration: ' + String(e?.message || e)) }

  log('The code fix is one expression at three sites: `gm.league` already holds the correct')
  log('label from the LEAGUES table, so the ternary that overrides it should simply be')
  log('dropped. NOT applied by this probe -- it lives in field-relay-nba, where a push to')
  log('src/** auto-deploys, and changing the label changes /archive/game\'s id construction')
  log('(id = `${sport}_${date}_...`). Rows already archived dedup on espn_event_id and are')
  log('safe, but a game SEEDED pre-game under the old id and finalized after the deploy')
  log('would write a second row rather than update the first. Human go/no-go, with a')
  log('deploy window chosen between slates rather than during one.')
}

main().catch(e => log('FAILED: ' + String(e?.stack || e)))
