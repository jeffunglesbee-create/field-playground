// Verify the LIVE shape of BSD /incidents/ -- the preferred fix for the soccer
// penalty bug -- instead of trusting a June 26 doc.
//
// WHY THIS EXISTS. docs/outbox/cc-session-2026-08-06-soccer-drive-docs-findings.md
// recommends sourcing soccer states from BSD incidents rather than patching the
// ESPN keyEvents filter, because the doc says every incident carries home_score
// and away_score -- which eliminates the bug class (no accumulation, no filter,
// so a missed goal becomes structurally impossible) rather than patching it.
//
// That recommendation rests entirely on a field list from a doc. In the SAME
// session, the same doc's ESPN field list was measured STALE: it claims
// summary.keyEvents carries redCard/yellowCard, and the real Aug 6 response
// contains neither. Taking the BSD field list on faith after catching the ESPN
// one would be the identical mistake, one paragraph later.
//
// So: measure it. Real fields, real fill rates, on real events. Reports what is
// actually there and explicitly does NOT propose an implementation -- if
// home_score/away_score turn out to be absent or sparsely filled, the preferred
// fix is not preferred and the fallback (scoringPlay === true) is the plan.
//
// Recurring because it is an external dependency: a shape that holds today can
// stop holding, and the fix built on it would fail silently.
//
// Routed through field-relay-nba (/bsd/* alias), which is sandbox-blocked from
// chat -- CI-as-proxy, same as every real-data probe here.

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/bsd-incidents-shape-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const UA = 'field-playground-probe/1.0 (github.com/jeffunglesbee-create/field-playground; research)'
const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'

// The June 26 migration doc's claimed per-incident fields. Measured against
// reality below -- listed here so a discrepancy is legible, not inferred.
const CLAIMED_FIELDS = [
  'type', 'minute', 'is_home', 'player_in', 'player_out', 'player_id',
  'card_type', 'goal_type', 'assist', 'home_score', 'away_score',
]
// The two that carry the entire "eliminates the bug class" argument.
const LOAD_BEARING = ['home_score', 'away_score']
const CLAIMED_TYPES = ['goal', 'card', 'substitution', 'period', 'injuryTime']

// MLS is BSD lid=18, marked "Full coverage" in the migration doc.
const MLS_LEAGUE_ID = 18
// Event 209914 is the one prior work confirmed reachable by direct ID lookup
// (probe-bsd-verification.mjs TEST 3). Kept as a known-good fallback because
// that same probe found season=/date= filtering unreliable.
const KNOWN_GOOD_EVENT = 209914

async function getJson(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!res.ok) return { err: 'HTTP ' + res.status }
    return { data: await res.json() }
  } catch (e) { return { err: String(e?.message || e) } }
}

function shiftDate(base, deltaDays) {
  const d = new Date(base + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().split('T')[0]
}

// Discovery is best-effort: prior work measured by-date's date= param as
// unreliable, so whatever it returns is treated as candidate IDs to try, and
// the actual dates returned are printed rather than assumed to match.
async function discoverEventIds() {
  const ids = []
  const today = new Date().toISOString().split('T')[0]
  for (let i = 1; i <= 10 && ids.length < 6; i++) {
    const date = shiftDate(today, -i)
    const { data, err } = await getJson(`${RELAY}/bsd/events/by-date?league_id=${MLS_LEAGUE_ID}&date=${date}`)
    if (err) { log(`  by-date ${date}: ${err}`); continue }
    const results = data?.results ?? data?.events ?? []
    for (const r of results) {
      const id = r.id ?? r.event_id
      if (id && !ids.includes(id)) {
        ids.push(id)
        log(`  by-date ${date} -> event ${id}  (returned date: ${r.date ?? r.kickoff_time ?? '?'})`)
      }
      if (ids.length >= 6) break
    }
    await new Promise(s => setTimeout(s, 300))
  }
  return ids
}

function profile(incidents) {
  const present = new Map(), nonNull = new Map(), samples = new Map()
  for (const inc of incidents) {
    for (const [k, v] of Object.entries(inc ?? {})) {
      present.set(k, (present.get(k) ?? 0) + 1)
      if (v !== null && v !== undefined && v !== '') nonNull.set(k, (nonNull.get(k) ?? 0) + 1)
      if (typeof v !== 'object') {
        const s = samples.get(k) ?? new Set()
        if (s.size < 5) s.add(String(v))
        samples.set(k, s)
      }
    }
  }
  return { present, nonNull, samples }
}

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: measure the LIVE per-incident field shape of BSD /incidents/, because the')
  log('preferred soccer fix rests on home_score/away_score being present -- and the same')
  log('source doc\'s ESPN field list was already measured stale in the same session.')
  log('')

  log('=== DISCOVERY: real MLS event IDs ===')
  const discovered = await discoverEventIds()
  const eventIds = discovered.length ? discovered : []
  if (!eventIds.includes(KNOWN_GOOD_EVENT)) eventIds.push(KNOWN_GOOD_EVENT)
  if (!discovered.length) {
    log('  by-date returned nothing usable -- falling back to the known-good event only.')
    log('  This narrows the sample to 1; treat fill rates below as indicative, not a rate.')
  }
  log('  event IDs to profile: ' + eventIds.join(', '))
  log('')

  log('=== PER-EVENT: real /incidents/ responses ===')
  const allIncidents = []
  const perEvent = []
  for (const id of eventIds) {
    const { data, err } = await getJson(`${RELAY}/bsd/events/${id}/incidents`)
    if (err) { log(`  event ${id}: FAILED -- ${err}`); perEvent.push({ id, err }); await new Promise(s => setTimeout(s, 300)); continue }
    const incidents = data?.incidents ?? data?.results ?? []
    log(`  event ${id}: top-level keys [${Object.keys(data ?? {}).join(', ')}] -> ${incidents.length} real incidents`)
    allIncidents.push(...incidents)
    perEvent.push({ id, count: incidents.length })
    await new Promise(s => setTimeout(s, 300))
  }
  log('')

  if (!allIncidents.length) {
    log('=== VERDICT ===')
    log('NO DATA. No real incidents returned from any event tried. This does NOT refute the')
    log('doc -- it means the route could not be exercised on this run. The preferred fix is')
    log('neither confirmed nor ruled out; the scoringPlay === true fallback remains the')
    log('safe plan until this probe returns real incidents.')
    return
  }

  const { present, nonNull, samples } = profile(allIncidents)
  log(`=== REAL FIELD SHAPE across ${allIncidents.length} real incidents ===`)
  log('  field                 present   non-null        sample values')
  for (const [k, n] of [...present.entries()].sort((a, b) => b[1] - a[1])) {
    const nn = nonNull.get(k) ?? 0
    const pct = ((nn / allIncidents.length) * 100).toFixed(0)
    const sv = [...(samples.get(k) ?? [])].join(' | ').slice(0, 60)
    log(`  ${k.padEnd(20)} ${String(n).padStart(6)}  ${String(nn).padStart(6)} (${pct.padStart(3)}%)   ${sv}`)
  }
  log('')

  log('=== DOC-VS-REALITY: the June 26 claimed field list ===')
  const missing = CLAIMED_FIELDS.filter(f => !present.has(f))
  const found = CLAIMED_FIELDS.filter(f => present.has(f))
  log('  claimed AND present: ' + (found.join(', ') || '(none)'))
  log('  claimed but ABSENT:  ' + (missing.join(', ') || '(none)'))
  const extra = [...present.keys()].filter(k => !CLAIMED_FIELDS.includes(k))
  log('  present but UNDOCUMENTED: ' + (extra.join(', ') || '(none)'))
  log('')

  log('=== INCIDENT TYPES actually seen ===')
  const typeCounts = new Map()
  for (const inc of allIncidents) {
    const t = String(inc?.type ?? '(missing)')
    typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1)
  }
  for (const [t, n] of [...typeCounts.entries()].sort((a, b) => b[1] - a[1])) {
    log(`  ${t.padEnd(20)} x${n}${CLAIMED_TYPES.includes(t) ? '' : '   <- not in the doc\'s claimed type list'}`)
  }
  log('')

  log('=== VERDICT ===')
  const loadBearingOk = LOAD_BEARING.every(f => {
    const nn = nonNull.get(f) ?? 0
    return present.has(f) && nn / allIncidents.length >= 0.9
  })
  for (const f of LOAD_BEARING) {
    const nn = nonNull.get(f) ?? 0
    log(`  ${f}: ${present.has(f) ? 'present' : 'ABSENT'}, non-null on ${nn}/${allIncidents.length} (${((nn / allIncidents.length) * 100).toFixed(0)}%)`)
  }
  if (loadBearingOk) {
    log('')
    log('CONFIRMED. home_score/away_score are present at a real fill rate. The preferred fix')
    log('(source soccer states from BSD incidents) is viable on measured data, not on a doc.')
    log('The running score is given per incident, so no accumulation and no goal-type filter')
    log('is needed -- which is what makes the dropped-goal bug class structurally impossible')
    log('rather than merely fixed.')
  } else {
    log('')
    log('NOT CONFIRMED. The load-bearing fields are absent or too sparsely filled to carry')
    log('the argument. The June 26 doc is stale on this point too, exactly as it was on the')
    log('ESPN redCard/yellowCard field list. Downgrade BSD from preferred to unproven, and')
    log('plan on the scoringPlay === true fallback.')
  }
  log('')
  log('This probe deliberately stops at measurement. It does not propose an implementation --')
  log('designing against unverified fields is the mistake this repo\'s probe discipline exists')
  log('to prevent, and it is the mistake that produced the stale doc being checked here.')
}

main().catch(e => log('FAILED: ' + String(e?.stack || e)))
