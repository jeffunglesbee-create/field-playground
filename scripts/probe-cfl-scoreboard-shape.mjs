// What does /cfl/scoreboard/rounds actually return?
//
// WHY THIS IS THE FIRST STEP AND NOT THE FIX. CFL is absent from the archive,
// and the obvious repair -- adding CFL to the ESPN-shaped LEAGUES list -- is
// disqualified by FIELD's own spec: ESPN's CFL scoreboard returns 2022 data.
// That fix would have returned HTTP 200 with a FULLY POPULATED events[] of
// four-year-old games and archived them as current. Not a failure anyone would
// notice.
//
// cflscoreboard.cfl.ca is the documented live source and the relay already
// proxies it (src/index.js:11162, cache-guarded at 30s per
// CC-CMD-2026-07-05-cfl-scoreboard-cache-guard.md). But its shape has never
// been measured in this repo, and the spec explicitly leaves two things open:
// live `game_status` is confirmed for 2025 and "verify presence in 2026", and
// live polling "has not been tested during a live 2026 CFL game".
//
// THE FIRST QUESTION IS STALENESS, NOT STRUCTURE. The entire reason ESPN was
// rejected is that it looked fine and served old seasons. So before profiling
// any field, this establishes what YEAR the data describes. A source that is
// well-shaped and four years old is worse than one that errors.
//
// Reports real fields and real fill rates. Deliberately proposes no mapping
// and writes no code -- designing against unverified shapes is the mistake
// this repo's probe discipline exists to prevent, and it is the mistake that
// produced the staged CFL fix now being replaced.

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/cfl-scoreboard-shape-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const UA = 'field-playground-probe/1.0 (github.com/jeffunglesbee-create/field-playground; research)'
const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'

const typeOf = v => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v

// Every key name at every depth. "Field X is missing" is only worth saying
// after looking everywhere, not just where X was expected to be.
function blobKeys(v, acc = new Set()) {
  if (Array.isArray(v)) { for (const x of v) blobKeys(x, acc) }
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) { acc.add(k); blobKeys(x, acc) }
  }
  return acc
}

async function getJson(path) {
  const res = await fetch(`${RELAY}${path}`, { headers: { 'User-Agent': UA } })
  const text = await res.text()
  if (!res.ok) return { err: `HTTP ${res.status}`, status: res.status, body: text.slice(0, 300) }
  try { return { data: JSON.parse(text), bytes: text.length } }
  catch { return { err: 'non-JSON response', body: text.slice(0, 300) } }
}

// Field union + fill rate over a record array. Same shape-first discipline the
// BSD and ESPN probes use.
function profile(records) {
  const present = new Map(), nonNull = new Map(), types = new Map(), samples = new Map()
  for (const r of records) {
    for (const [k, v] of Object.entries(r ?? {})) {
      present.set(k, (present.get(k) ?? 0) + 1)
      if (v !== null && v !== undefined && v !== '') nonNull.set(k, (nonNull.get(k) ?? 0) + 1)
      if (!types.has(k)) types.set(k, new Set())
      types.get(k).add(typeOf(v))
      if (typeof v !== 'object') {
        const s = samples.get(k) ?? new Set()
        if (s.size < 4) s.add(String(v).slice(0, 28))
        samples.set(k, s)
      }
    }
  }
  return { present, nonNull, types, samples }
}

function printProfile(records, label, indent = '  ') {
  const { present, nonNull, types, samples } = profile(records)
  log(`${indent}${label} — ${records.length} records`)
  log(`${indent}  field                    present  non-null        types            samples`)
  for (const [k, n] of [...present.entries()].sort((a, b) => b[1] - a[1])) {
    const nn = nonNull.get(k) ?? 0
    const pct = ((nn / records.length) * 100).toFixed(0)
    const t = [...types.get(k)].filter(x => x !== 'null').join('|') || 'null'
    const sv = [...(samples.get(k) ?? [])].join(' | ').slice(0, 44)
    log(`${indent}  ${k.padEnd(24)} ${String(n).padStart(5)}  ${String(nn).padStart(5)} (${pct.padStart(3)}%)  ${t.padEnd(16)} ${sv}`)
  }
}

// A field reported as "object" is a field NOT measured. The first run of this
// probe printed homeSquad/awaySquad as objects and separately reported that a
// "score" key existed somewhere in the blob -- which is to say it found the
// envelope and left the payload closed, on exactly the three fields
// /archive/game needs most (scores, team names, venue). One level down is
// where the answer was the whole time.
function printNested(records, keys, indent = '    ') {
  for (const key of keys) {
    const inner = records.map(r => r?.[key]).filter(v => v && typeof v === 'object' && !Array.isArray(v))
    if (!inner.length) { log(`${indent}${key}: no object values to profile`); continue }
    log('')
    printProfile(inner, `${key}{}`, indent)
  }
}

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: measure the real shape of /cfl/scoreboard/rounds before any archive-write')
  log('work is designed against it. Staleness is checked FIRST -- that is what disqualified ESPN.')
  log('')

  const r = await getJson('/cfl/scoreboard/rounds')
  if (r.err) {
    log(`=== FETCH FAILED: ${r.err} ===`)
    if (r.body) log('  body: ' + r.body)
    log('')
    log('=== VERDICT ===')
    log('UNREACHABLE. The documented live CFL source did not respond. That is itself a')
    log('finding -- the relay route exists and the spec calls it live, so a failure here')
    log('means the source moved or the guard is rejecting us. Do not proceed to design.')
    return
  }

  log(`=== TOP LEVEL === (${r.bytes} bytes)`)
  const root = r.data
  log(`  root type: ${typeOf(root)}`)
  if (Array.isArray(root)) log(`  root is an array of ${root.length}`)
  else log(`  root keys: ${Object.keys(root).join(', ')}`)
  log('')

  // Find the rounds array wherever it lives, without assuming the wrapper.
  let rounds = Array.isArray(root) ? root
    : Array.isArray(root?.rounds) ? root.rounds
    : Array.isArray(root?.data) ? root.data
    : null
  if (!rounds) {
    const arrKey = Object.entries(root ?? {}).find(([, v]) => Array.isArray(v) && v.length)
    if (arrKey) { rounds = arrKey[1]; log(`  (rounds array located at key "${arrKey[0]}")`) }
  }
  if (!rounds) {
    log('  Could not locate a rounds array. Raw root sample:')
    log('  ' + JSON.stringify(root).slice(0, 600))
    return
  }
  log(`  rounds: ${rounds.length}`)
  log('')

  log('=== ROUND-LEVEL SHAPE ===')
  printProfile(rounds, 'rounds[]')
  log('')

  // Games nest inside rounds under some key -- find it rather than assume it.
  let gameKey = null
  for (const [k, v] of Object.entries(rounds[0] ?? {})) {
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') { gameKey = k; break }
  }
  const games = gameKey ? rounds.flatMap(rd => rd[gameKey] ?? []) : []
  log(`=== GAME-LEVEL SHAPE ===  (nested under rounds[].${gameKey ?? '???'})`)
  if (!games.length) {
    log('  No nested game array found. Rounds may be schedule shells only, which is what')
    log('  the spec reports for /cfl/fixtures -- worth knowing before relying on this route.')
  } else {
    printProfile(games, `rounds[].${gameKey}`)

    // Descend into every object-valued key rather than a guessed shortlist --
    // guessing which nested key holds the score is the same error one level in.
    const objKeys = [...new Set(games.flatMap(g =>
      Object.entries(g ?? {}).filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v)).map(([k]) => k)))]
    if (objKeys.length) {
      log('')
      log(`=== ONE LEVEL DOWN === (object-valued keys: ${objKeys.join(', ')})`)
      printNested(games, objKeys)
    }

    // Fill rates answer "does this field exist"; they do not answer "does a
    // real completed game carry a real score". Print one finished record whole.
    const finished = games.find(g => g?.status === 'complete') ?? games[0]
    log('')
    log('=== ONE COMPLETE GAME, VERBATIM ===')
    log('  (fill rates say a field exists; only a real record says what it holds)')
    for (const line of JSON.stringify(finished, null, 2).split('\n').slice(0, 90)) log('  ' + line)
  }
  log('')

  // ---- IS A 100%-FILLED SCORE ACTUALLY A SCORE? ----
  // Run 2 measured homeSquad.score at 93/93 non-null while only 46 games had a
  // winner. A fill rate cannot tell those apart: 0 is non-null. If unplayed
  // games carry 0 rather than null, then "score is always present" is a trap,
  // not a convenience -- an archive writer trusting it posts 0-0 finals for
  // fixtures that have not kicked off. That is ESPN's failure mode wearing a
  // different disguise: a fully-populated response that is wrong.
  if (games.length) {
    log('=== SCORE x STATUS: does a filled score mean a played game? ===')
    const byStatus = new Map()
    for (const g of games) {
      const s = String(g?.status)
      const b = byStatus.get(s) ?? { n: 0, zeroZero: 0, nullScore: 0, anyPoints: 0, winner: 0 }
      b.n++
      const h = g?.homeSquad?.score, a = g?.awaySquad?.score
      if (h == null || a == null) b.nullScore++
      else if (h === 0 && a === 0) b.zeroZero++
      else b.anyPoints++
      if (g?.winner != null) b.winner++
      byStatus.set(s, b)
    }
    log('    status        n    0-0   null   points   winner-set')
    for (const [s, b] of byStatus) {
      log(`    ${s.padEnd(12)} ${String(b.n).padStart(3)}  ${String(b.zeroZero).padStart(5)}  ${String(b.nullScore).padStart(5)}  ${String(b.anyPoints).padStart(6)}  ${String(b.winner).padStart(10)}`)
    }
    const unplayed = [...byStatus.entries()].filter(([s]) => s !== 'complete')
    const unplayedZero = unplayed.reduce((n, [, b]) => n + b.zeroZero, 0)
    const unplayedNull = unplayed.reduce((n, [, b]) => n + b.nullScore, 0)
    if (unplayedZero && !unplayedNull) {
      log('  *** UNPLAYED GAMES CARRY 0, NOT NULL. The 100% fill rate on score is')
      log('  *** therefore meaningless as a played/unplayed signal. Any archive write must')
      log('  *** gate on status (or winner), never on score being present.')
    } else if (unplayedNull) {
      log(`  Unplayed games carry null score in ${unplayedNull} case(s) -- score presence is`)
      log('  a usable signal, though status remains the explicit one.')
    }
    log('')
  }

  // ---- VENUE: absent, or just not where it was looked for? ----
  log('=== VENUE ===')
  const venueKeys = [...new Set([...blobKeys(root)].filter(k => /venue|stadium|location|city|site/i.test(k)))]
  log(`  venue-like keys anywhere in the payload: ${venueKeys.join(', ') || '(none)'}`)
  if (!venueKeys.length) {
    log('  /archive/game takes a venue. This route does not carry one at any depth, so it')
    log('  must come from a second source or be written null -- a decision, not an oversight.')
  }
  log('')

  // ---- THE STALENESS TEST ----
  log('=== STALENESS: WHAT YEAR IS THIS DATA? ===')
  const blob = JSON.stringify(root)
  const years = new Map()
  for (const m of blob.matchAll(/\b(20[12]\d)-\d{2}-\d{2}/g)) years.set(m[1], (years.get(m[1]) ?? 0) + 1)
  if (years.size) {
    log('  years found in date-shaped strings:')
    for (const [y, n] of [...years.entries()].sort((a, b) => b[1] - a[1])) log(`    ${y}: ${n} occurrence(s)`)
  } else {
    log('  no ISO-date-shaped strings found -- staleness cannot be judged from dates alone')
  }
  for (const k of ['season', 'season_id', 'year', 'currentSeason']) {
    if (root && typeof root === 'object' && k in root) log(`  root.${k} = ${JSON.stringify(root[k])}`)
  }
  const thisYear = new Date().getUTCFullYear()
  const currentHits = years.get(String(thisYear)) ?? 0
  log('')
  log(`  current year (${thisYear}) occurrences: ${currentHits}`)
  if (!currentHits) {
    log('  *** NO CURRENT-YEAR DATES. This is the ESPN failure mode: a well-formed response')
    log('  *** describing a season that is not this one. Do NOT archive from this route until')
    log('  *** explained.')
  } else {
    log('  Contains current-year dates -- does not exhibit the ESPN staleness failure.')
  }
  log('')

  // ---- the two questions the spec left open ----
  log('=== SPEC OPEN QUESTIONS ===')
  const hasStatus = /"game_status"|"status"/.test(blob)
  log(`  game_status / status field present anywhere: ${hasStatus ? 'YES' : 'NO'}`)
  log('    (Spec: confirmed in 2025 fixtures, "verify presence in 2026")')
  const scoreKeys = [...blob.matchAll(/"(\w*score\w*)":/gi)].map(m => m[1])
  log(`  score-like keys seen: ${[...new Set(scoreKeys)].join(', ') || '(none)'}`)
  log('')

  log('=== ARCHIVE-WRITE FEASIBILITY ===')
  log('/archive/game needs: sport, league, date, home, away, home_score, away_score,')
  log('venue, start_time. Which of those are directly available above, and which need a')
  log('second lookup (team ids -> names via /cfl/scoreboard/squads), is the question the')
  log('field lists answer. Read them rather than trusting this line.')
  const sq = await getJson('/cfl/scoreboard/squads')
  if (sq.err) log(`  /cfl/scoreboard/squads: ${sq.err}`)
  else {
    const sqRoot = sq.data
    const list = Array.isArray(sqRoot) ? sqRoot
      : Object.values(sqRoot ?? {}).find(v => Array.isArray(v) && v.length) ?? []
    log(`  /cfl/scoreboard/squads: ${sq.bytes} bytes, ${list.length} squad record(s)`)
    if (list.length) printProfile(list.slice(0, 40), 'squads[]')
  }
  log('')

  log('=== VERDICT ===')
  log('This probe measures and stops. It proposes no field mapping and writes no code:')
  log('the staged CFL fix it replaces was produced by designing against an unmeasured')
  log('source, and repeating that here would be the same mistake with a different URL.')
  log('The next step is a human reading the field lists above against /archive/game.')
}

main().catch(e => log('FAILED: ' + String(e?.stack || e)))
