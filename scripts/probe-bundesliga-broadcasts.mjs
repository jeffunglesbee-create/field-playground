#!/usr/bin/env node
// What does /bundesliga-bapi/broadcasts actually RETURN, and do the broadcaster
// names it returns resolve against the SR table?
//
// WHY THIS EXISTS. jubilant-bassoon's _fetchBundesligaRealBroadcastStreams maps
// each entry with `b.name || b.broadcaster || b.channel || b.title`. The CC-CMD
// that shipped it (Drive, 2026-08-02, "wire-bundesliga-broadcasts-date-mode")
// says in its own words that this list is
//
//     "defensive/best-effort, not confirmed against a real non-empty example"
//
// because every live check it ran returned `data.broadcasts: []`. A fix built
// on top of that extraction inherits the same unknown. This probe exists to
// replace the guess with an observation, and it prints the FULL raw entry --
// every key, not just the four guessed ones -- because the whole point is to
// find out whether the guessed names are the real ones.
//
// WHY CI. *.workers.dev is blocked by this sandbox's egress allowlist, so the
// relay cannot be reached from here. No credential is involved: the bapi key
// lives server-side in the relay, and these routes are public.
//
// WHY SEVERAL DATES. Broadcast schedules are forward-looking, and the one past
// matchday the CC-CMD checked (2026-05-09, matchday 33) came back with an empty
// array. An empty result on a completed fixture is therefore uninformative --
// it may mean "no data kept" rather than "route broken". The upcoming matchday
// is where a non-empty answer is plausible, so the sample spans both and the
// report says which is which rather than averaging them into one verdict.

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = `outbox/bundesliga-broadcasts-${stamp}.txt`
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const BASE = 'https://field-relay-nba.jeffunglesbee.workers.dev'

// Same convention the client and the relay both use: Jul-Dec starts the season.
const seasonFromDate = (y, m) => (m >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`)

// Spans the break boundary deliberately. 2026-08-22 is the documented resume
// date (and the Supercup, which the CC-CMD notes is structurally unreachable
// through resolve-dayid); the late-August dates are matchday 1 of 2026-27;
// 2026-05-09 is the completed matchday the earlier session already resolved,
// kept as a control so an empty result can be told apart from a broken route.
const DATES = [
  '2026-08-22', '2026-08-28', '2026-08-29', '2026-08-30', '2026-09-12',
  '2026-05-09',
]

log('probe_at: ' + new Date().toISOString())
log('purpose: observe the REAL shape of data.broadcasts[] and test whether its')
log('broadcaster names match the SR labels the client fix resolves against.')
log('')

const seen = []
let anyNonEmpty = false

for (const date of DATES) {
  const [y, m] = date.split('-').map(Number)
  const season = seasonFromDate(y, m)
  log(`=== ${date}  (season ${season}) ===`)

  let resolved
  try {
    const r = await fetch(`${BASE}/bundesliga-bapi/resolve-dayid?season=${season}&date=${date}`,
      { signal: AbortSignal.timeout(20000) })
    log(`  resolve-dayid HTTP ${r.status}`)
    if (!r.ok) { log('  (non-200, skipping)'); log(''); continue }
    resolved = await r.json()
  } catch (e) {
    log(`  resolve-dayid threw: ${String(e).slice(0, 140)}`); log(''); continue
  }

  log(`  resolve body: ${JSON.stringify(resolved).slice(0, 300)}`)
  if (!resolved?.ok || !resolved.dayId || !resolved.comId) {
    log('  no dayId/comId -- cannot query broadcasts for this date'); log(''); continue
  }

  let body
  try {
    const r2 = await fetch(
      `${BASE}/bundesliga-bapi/broadcasts?comId=${encodeURIComponent(resolved.comId)}&dayId=${encodeURIComponent(resolved.dayId)}`,
      { signal: AbortSignal.timeout(20000) })
    log(`  broadcasts HTTP ${r2.status}`)
    if (!r2.ok) { log('  (non-200, skipping)'); log(''); continue }
    body = await r2.json()
  } catch (e) {
    log(`  broadcasts threw: ${String(e).slice(0, 140)}`); log(''); continue
  }

  const arr = body?.data?.broadcasts
  log(`  available: ${JSON.stringify(body?.available)}   broadcasts is array: ${Array.isArray(arr)}   length: ${Array.isArray(arr) ? arr.length : 'n/a'}`)

  if (!Array.isArray(arr) || !arr.length) {
    log('  EMPTY -- same as every check the CC-CMD recorded.')
    log(''); continue
  }

  anyNonEmpty = true
  log('  NON-EMPTY. Full first entry, every key, unabridged:')
  log('  ' + JSON.stringify(arr[0], null, 2).split('\n').join('\n  '))
  log(`  keys on entry[0]: ${Object.keys(arr[0] || {}).join(', ')}`)

  // Does the client's guessed extraction actually hit anything?
  const GUESSED = ['name', 'broadcaster', 'channel', 'title']
  for (const b of arr) {
    const hit = GUESSED.find(k => b && b[k])
    seen.push({ date, hit, value: hit ? b[hit] : null, keys: Object.keys(b || {}) })
  }
  const missed = seen.filter(s => !s.hit)
  log(`  entries where the client's 4 guessed field names find nothing: ${missed.length}/${arr.length}`)
  log('')
}

log('=== SUMMARY ===')
if (!anyNonEmpty) {
  log('  Every sampled date returned an empty broadcasts array.')
  log('')
  log('  That is a REAL RESULT and it settles something: the client mapper still')
  log('  has never run against real data, so BOTH the guessed field names and the')
  log('  SR-name-resolution fix built on top of them remain unverified. The fix is')
  log('  strictly safer than what it replaced -- an empty array already returns')
  log('  null, which keeps the curated BUNDESLIGA bundle -- but this run does not')
  log('  and cannot confirm it ever fires.')
  log('')
  log('  It does NOT mean the route is broken: resolve-dayid answering with a real')
  log('  comId/dayId above is the route working. Re-run closer to a real matchday.')
} else {
  log('  Non-empty data observed. Broadcaster values the client would extract:')
  const uniq = [...new Set(seen.filter(s => s.hit).map(s => `${s.value}  (via .${s.hit})`))]
  for (const u of uniq) log(`    ${u}`)
  const noHit = seen.filter(s => !s.hit)
  if (noHit.length) {
    log('')
    log(`  ${noHit.length} entr(ies) matched NONE of name/broadcaster/channel/title.`)
    log('  Their real keys, which is what the extraction list should become:')
    for (const n of [...new Set(noHit.map(s => s.keys.join(', ')))]) log(`    ${n}`)
  }
  log('')
  log('  Next: check these strings against the SR table\'s labels. A name with no')
  log('  SR row means the client fix returns null and keeps the static bundle --')
  log('  safe, but the enrichment never fires until that row exists.')
}
log('')
log(`written: ${outPath}`)
