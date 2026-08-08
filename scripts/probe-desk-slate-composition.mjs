// What sports does the desk actually receive, per date -- and why does a real
// slate show MLS fixtures TWICE?
//
// TWO REPORTED SYMPTOMS, one screenshot (2026-08-08, deployed playground,
// desk date 2026-08-06):
//   1. Only MLS appears. No MLB, no WNBA, nothing else.
//   2. Five fixtures appear twice -- once with no score, once final. The desk
//      header reads "5 remaining, 0 live, 6 final" and "MLS 11" for what is
//      really 6 matches.
//
// The client is not filtering: DeskCard groups by whatever g.sport it is
// handed and relay.js's fetchDeskReconciled passes /context/date/ straight
// through. So both symptoms are upstream, in the data.
//
// A PRIOR OBSERVATION MAKES SYMPTOM 2 PREDICTABLE. A direct relay read of
// /context/date/2026-08-05 earlier in this session returned the same fixture
// under two different id conventions:
//     MLS_2026-08-05_clubdeftbolmonterreyrayadosac_orlandocity
//     MLS_MLS-COM-000006_MLS-MAT-000A38_phaseone_2026-08-05
// one with null scores, one finalized. Two id schemes for one match means
// ON CONFLICT can never dedupe them -- they are different rows by definition.
// This measures how far that goes.
//
// Also resolves an open flag: schema generation on 2026-08-08 produced an
// "efl cup" variant (32 games) that had appeared in no earlier corpus. An
// unexplained sport label matters here, because this repo has already found
// MLS fixtures stored as "FIFA World Cup".

import { mkdirSync, writeFileSync } from 'node:fs'
mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/desk-slate-composition-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const UA = 'field-playground-probe/1.0 (github.com/jeffunglesbee-create/field-playground; research)'
const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'
const DAYS = Number(process.env.PROBE_DAYS || 14)

const shift = (b, d) => { const x = new Date(b + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().split('T')[0] }
const norm = s => String(s ?? '(missing)').trim()

async function main() {
  const today = new Date().toISOString().split('T')[0]
  log('probe_at: ' + new Date().toISOString())
  log('purpose: per-date sport composition of /context/date/, and duplicate-fixture detection.')
  log(`window: ${DAYS} days back from ${today}`)
  log('')

  const perDate = []
  for (let i = 0; i < DAYS; i++) {
    const d = shift(today, -i)
    try {
      const res = await fetch(`${RELAY}/context/date/${d}`, { headers: { 'User-Agent': UA } })
      if (!res.ok) { log(`  ${d}  HTTP ${res.status}`); continue }
      const j = await res.json()
      const games = [...(j?.games?.regular ?? []), ...(j?.games?.postseason ?? [])]
      perDate.push({ date: d, games })
    } catch (e) { log(`  ${d}  ${String(e.message)}`) }
    await new Promise(r => setTimeout(r, 220))
  }
  log(`dates fetched: ${perDate.length} / ${DAYS}`)
  log('')

  log('=== PER-DATE SPORT COMPOSITION ===')
  log('  date          total   sports present')
  for (const { date, games } of perDate) {
    const counts = new Map()
    for (const g of games) counts.set(norm(g.sport), (counts.get(norm(g.sport)) ?? 0) + 1)
    const desc = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s}:${n}`).join('  ')
    log(`  ${date}  ${String(games.length).padStart(5)}   ${desc || '(none)'}`)
  }
  log('')

  // Does any date carry more than one sport at all?
  const multiSport = perDate.filter(d => new Set(d.games.map(g => norm(g.sport))).size > 1)
  log(`dates carrying MORE THAN ONE sport: ${multiSport.length} / ${perDate.length}`)
  if (!multiSport.length) {
    log('  NONE. Every date in this window is single-sport. The desk showing only MLS is')
    log('  the data, not the client -- and that is a relay/archive question, not a UI bug.')
  }
  log('')

  log('=== DUPLICATE FIXTURES (same date, same teams, >1 row) ===')
  let dupPairs = 0, dupDates = 0
  for (const { date, games } of perDate) {
    const byMatch = new Map()
    for (const g of games) {
      const k = `${norm(g.sport)}|${norm(g.home)}|${norm(g.away)}`
      if (!byMatch.has(k)) byMatch.set(k, [])
      byMatch.get(k).push(g)
    }
    const dups = [...byMatch.entries()].filter(([, rows]) => rows.length > 1)
    if (!dups.length) continue
    dupDates++
    log(`  ${date}: ${dups.length} fixture(s) duplicated (${games.length} rows for ${byMatch.size} real matches)`)
    for (const [k, rows] of dups.slice(0, 4)) {
      dupPairs += rows.length - 1
      log(`    ${k.split('|').slice(1).join(' vs ')}`)
      for (const r of rows) {
        log(`      id=${r.id}`)
        log(`         score=${r.away_score ?? '-'}-${r.home_score ?? '-'}  finalized=${r.finalized_at ? 'yes' : 'no'}  espn_event_id=${r.espn_event_id ?? 'null'}`)
      }
    }
    if (dups.length > 4) log(`    ...and ${dups.length - 4} more on this date`)
  }
  log('')

  // Id-scheme census: the mechanism behind the duplicates, if it is what the
  // 2026-08-05 observation suggested.
  log('=== ID SCHEME CENSUS ===')
  const schemes = new Map()
  for (const { games } of perDate) {
    for (const g of games) {
      const id = String(g.id ?? '')
      // Classify by shape rather than by guessing a naming convention.
      const scheme =
        /^[A-Za-z ]+_\d{4}-\d{2}-\d{2}_/.test(id) ? 'SPORT_date_teams'
        : /_[A-Z]{2,}-[A-Z]{3}-[0-9A-F]+_/.test(id) ? 'SPORT_seriesKey_round_date'
        : id ? 'other' : '(empty)'
      schemes.set(scheme, (schemes.get(scheme) ?? 0) + 1)
    }
  }
  for (const [s, n] of [...schemes.entries()].sort((a, b) => b[1] - a[1])) log(`  ${s.padEnd(28)} ${n}`)
  log('')

  log('=== SPORT LABELS SEEN (whole window) ===')
  const labels = new Map()
  for (const { games } of perDate) for (const g of games) labels.set(norm(g.sport), (labels.get(norm(g.sport)) ?? 0) + 1)
  for (const [s, n] of [...labels.entries()].sort((a, b) => b[1] - a[1])) log(`  "${s}"  ${n}`)
  log('')

  log('=== VERDICT ===')
  if (!perDate.length) { log('NO DATA -- every fetch failed. Answers nothing.'); return }
  log(`Duplicate fixtures found on ${dupDates} of ${perDate.length} dates (${dupPairs} extra row(s)).`)
  if (dupPairs) {
    log('The desk is not miscounting. It is faithfully rendering rows the archive really')
    log('contains twice. Two id schemes for one match means ON CONFLICT cannot dedupe --')
    log('they are distinct rows by construction, so the seed row and the finalized row')
    log('both survive. That is an archive-write defect, not a client one.')
  }
  log('')
  log('This probe deliberately does not propose a fix. Both candidate fixes (converge the')
  log('id schemes; or dedupe on espn_event_id at read time) live in field-relay-nba, where')
  log('a push to src/** auto-deploys, and one of them rewrites historical ids that')
  log('briefs.game_id already joins against.')
}

main().catch(e => log('FAILED: ' + String(e?.stack || e)))
