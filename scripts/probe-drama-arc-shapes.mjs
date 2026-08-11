#!/usr/bin/env node
// What shapes does drama_arc actually take, and what is inside the object one?
//
// WHY. DeskCard's parseArc accepts a bare ARRAY and returns null for anything
// else, so the object shape renders nothing. Two independent sources say the
// object shape is the CANONICAL one:
//
//   CC-CMD-2026-08-03-fix-drama-backfill-situational-fields (Drive):
//     "the Node backfill script's computeDramaRetroactive always writes
//      drama_arc as a bare JSON ARRAY of numbers ... Every client write path
//      ... always writes drama_arc as a JSON OBJECT {peak, peakPeriod,
//      sustainedMinutes, trend, classification, samples} ... A row's drama_arc
//      starting with [ vs { is a 100%-reliable authorship signal"
//
//   src/data/anomalyBaseline.js: all 26 real golf rows measured 2026-08-06
//     carry a non-array drama_arc.
//
// Both are PROSE. Zero object-shape arcs have been measured in this repo, and
// building an extractor against a shape known only from prose is the mistake
// the CFL probe exists to prevent. So this measures before anything is built.
//
// THE SAMPLE-BIAS TRAP IS EXPLICIT HERE. /archive/drama/leaderboard is ranked
// AND truncated -- the censored-sample problem this repo has already been
// bitten by. It is probed because it is dense in drama, but its counts are
// reported SEPARATELY and never pooled with the uncensored /context/date/
// sweep.

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/drama-arc-shapes-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'
const UA = 'field-playground-probe/1.0 (github.com/jeffunglesbee-create/field-playground; research)'
const DAYS = Number(process.env.PROBE_DAYS || 45)

// WHY A WIDE WINDOW IS EQUIVALENT TO THE D1 QUERY, and this is the load-bearing
// detail. The 2026-08-03 cleanup reset rows matching `drama_arc LIKE '[%'` --
// ARRAY shape only. Any object-shape row the client write path ever produced
// was therefore NOT reset, and is still in the archive today. So sweeping back
// past the feature's ship date (2026-07-02) and finding zero objects is the
// same evidence as SELECT COUNT(*) WHERE drama_arc LIKE '{%' returning zero,
// without needing the relay's write credential.

const shiftDate = (base, d) => {
  const x = new Date(base + 'T00:00:00Z')
  x.setUTCDate(x.getUTCDate() + d)
  return x.toISOString().slice(0, 10)
}

async function getJson(path) {
  const res = await fetch(`${RELAY}${path}`, { headers: { 'User-Agent': UA } })
  if (!res.ok) return { err: `HTTP ${res.status}` }
  try { return { data: await res.json() } } catch { return { err: 'non-JSON' } }
}

function classify(raw) {
  if (raw === null || raw === undefined) return 'null'
  if (Array.isArray(raw)) return 'array'
  if (typeof raw === 'object') return 'object'
  if (typeof raw !== 'string') return 'other:' + typeof raw
  const t = raw.trim()
  if (t.startsWith('[')) return 'array'
  if (t.startsWith('{')) return 'object'
  return 'other:string'
}

const parse = raw => {
  if (raw && typeof raw === 'object') return raw
  if (typeof raw !== 'string') return null
  try { return JSON.parse(raw) } catch { return null }
}

function profile(records, label) {
  const present = new Map(), nonNull = new Map(), types = new Map(), samples = new Map()
  for (const r of records) {
    for (const [k, v] of Object.entries(r ?? {})) {
      present.set(k, (present.get(k) ?? 0) + 1)
      if (v !== null && v !== undefined && v !== '') nonNull.set(k, (nonNull.get(k) ?? 0) + 1)
      if (!types.has(k)) types.set(k, new Set())
      types.get(k).add(v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v)
      if (typeof v !== 'object' && v !== null) {
        const s = samples.get(k) ?? new Set()
        if (s.size < 4) s.add(String(v).slice(0, 24))
        samples.set(k, s)
      }
    }
  }
  log(`  ${label} — ${records.length} record(s)`)
  log('    field                 present  non-null       types        samples')
  for (const [k, n] of [...present.entries()].sort((a, b) => b[1] - a[1])) {
    const nn = nonNull.get(k) ?? 0
    const pct = ((nn / records.length) * 100).toFixed(0)
    const t = [...types.get(k)].filter(x => x !== 'null').join('|') || 'null'
    const sv = [...(samples.get(k) ?? [])].join(' | ').slice(0, 40)
    log(`    ${k.padEnd(21)} ${String(n).padStart(5)}  ${String(nn).padStart(5)} (${pct.padStart(3)}%)  ${t.padEnd(12)} ${sv}`)
  }
}

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: measure the real shapes of drama_arc, and open the object one, before')
  log('any renderer is written against it.')
  log('')

  const today = new Date().toISOString().slice(0, 10)
  const counts = new Map()
  const bySport = new Map()
  const objects = []
  const others = []
  const byMonth = new Map()   // when, if ever, does each shape appear?
  let games = 0, fetchFailures = 0

  log(`=== UNCENSORED SWEEP: /context/date/ over ${DAYS} days ===`)
  for (let d = 0; d > -DAYS; d--) {
    const date = shiftDate(today, d)
    const r = await getJson(`/context/date/${date}`)
    if (r.err) { fetchFailures++; continue }
    const list = [
      ...(r.data?.games?.regular ?? []),
      ...(r.data?.games?.postseason ?? []),
    ]
    for (const g of list) {
      games++
      const kind = classify(g.drama_arc)
      counts.set(kind, (counts.get(kind) ?? 0) + 1)
      const key = `${g.sport}|${kind}`
      bySport.set(key, (bySport.get(key) ?? 0) + 1)
      const mk = `${date.slice(0, 7)}|${kind}`
      byMonth.set(mk, (byMonth.get(mk) ?? 0) + 1)
      if (kind === 'object') {
        const parsed = parse(g.drama_arc)
        if (parsed) objects.push({ sport: g.sport, id: g.id, peak: g.drama_peak, obj: parsed })
      }
      // Run 1 proved the object shape absent but never captured what the
      // 84 "other:string" rows actually contain -- it answered the question
      // asked and left the interesting one closed, the same way the first
      // CFL run reported homeSquad as "object". Capture them verbatim.
      if (kind.startsWith('other')) {
        others.push({ sport: g.sport, id: g.id, peak: g.drama_peak,
                      raw: typeof g.drama_arc === 'string' ? g.drama_arc : JSON.stringify(g.drama_arc) })
      }
    }
  }

  // Degraded-sample handling, the lesson from the schema --check run that
  // printed "No drift" over two 429s and a 68% sample.
  if (fetchFailures) log(`  ${fetchFailures} of ${DAYS} date fetches FAILED — sample is degraded.`)
  log(`  games scanned: ${games}`)
  for (const [k, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    log(`    ${k.padEnd(14)} ${String(n).padStart(5)}  (${((n / Math.max(games, 1)) * 100).toFixed(1)}%)`)
  }
  log('')

  // Month buckets answer the temporal question the counts cannot: did the
  // object shape EVER appear, including before the Aug 3 reset?
  log('  by month:')
  const months = [...new Set([...byMonth.keys()].map(k => k.split('|')[0]))].sort()
  const kinds = [...new Set([...byMonth.keys()].map(k => k.split('|')[1]))].sort()
  log('    month      ' + kinds.map(k => k.padStart(13)).join(''))
  for (const m of months) {
    log('    ' + m.padEnd(11) + kinds.map(k => String(byMonth.get(`${m}|${k}`) ?? 0).padStart(13)).join(''))
  }
  log('')

  log('  by sport (non-null shapes only):')
  for (const [key, n] of [...bySport.entries()].sort((a, b) => b[1] - a[1])) {
    const [sport, kind] = key.split('|')
    if (kind === 'null') continue
    log(`    ${String(sport).padEnd(18)} ${kind.padEnd(8)} ${String(n).padStart(4)}`)
  }
  log('')

  // The censored source, reported separately and never pooled.
  log('=== CENSORED SOURCE, kept apart: /archive/drama/leaderboard ===')
  log('  (ranked AND truncated -- dense in drama by construction, so its shape mix')
  log('   says nothing about how common each shape is overall.)')
  const lb = await getJson('/archive/drama/leaderboard')
  if (lb.err) log(`  ${lb.err}`)
  else {
    const rows = Array.isArray(lb.data) ? lb.data
      : (lb.data?.games ?? lb.data?.results ?? lb.data?.leaderboard ?? [])
    const lbCounts = new Map()
    for (const g of rows) {
      const kind = classify(g.drama_arc)
      lbCounts.set(kind, (lbCounts.get(kind) ?? 0) + 1)
      if (kind === 'object') {
        const parsed = parse(g.drama_arc)
        if (parsed) objects.push({ sport: g.sport, id: g.id, peak: g.drama_peak, obj: parsed, censored: true })
      }
    }
    log(`  rows: ${rows.length}`)
    for (const [k, n] of [...lbCounts.entries()].sort((a, b) => b[1] - a[1])) log(`    ${k.padEnd(14)} ${String(n).padStart(4)}`)
  }
  log('')

  log('=== THE THIRD SHAPE: what is in the non-array, non-object strings? ===')
  if (!others.length) log('  none found')
  else {
    log(`  ${others.length} row(s)`)
    const byValue = new Map()
    for (const o of others) {
      const k = o.raw === '' ? '(empty string)' : o.raw.slice(0, 60)
      byValue.set(k, (byValue.get(k) ?? 0) + 1)
    }
    log('  distinct raw values, most common first:')
    for (const [v, n] of [...byValue.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
      log(`    ${String(n).padStart(4)}x  ${JSON.stringify(v)}`)
    }
    log('')
    log('  a few whole rows:')
    for (const o of others.slice(0, 5)) {
      log(`    ${String(o.sport).padEnd(16)} peak=${JSON.stringify(o.peak)}  arc=${JSON.stringify(o.raw).slice(0, 90)}`)
    }
    // Does the third shape coincide with a missing peak? If drama was never
    // computed for these sports, that is a different story from a parse bug.
    const withPeak = others.filter(o => typeof o.peak === 'number' && o.peak > 0).length
    log('')
    log(`  rows whose drama_peak is a number > 0: ${withPeak} of ${others.length}`)
    if (!withPeak) log('    None. Consistent with drama never being COMPUTED for these, rather than')
    log(!withPeak ? '    computed and stored in an unreadable shape.' : '    So drama exists for these rows but the arc is not an array.')
  }
  log('')

  log('=== THE OBJECT SHAPE ===')
  if (!objects.length) {
    log('  NOT ONE object-shape drama_arc found in either source.')
    log('')
    log('  That is a real result, not a failed probe. The two sources claiming this shape')
    log('  exists are both PROSE, and the one measurement available (anomalyBaseline, golf,')
    log('  2026-08-06) predates the 2026-08-03 MLB reset and any recompute since. Do NOT')
    log('  write an extractor for a shape that cannot be produced on demand -- support it')
    log('  when a real one appears.')
    return
  }

  log(`  found ${objects.length} object-shape arc(s)` +
      (objects.some(o => o.censored) ? ' (some from the censored leaderboard, flagged below)' : ''))
  profile(objects.map(o => o.obj), 'drama_arc{}')
  log('')

  // The field that matters: whatever holds the actual series.
  const seriesKeys = new Set()
  for (const o of objects) {
    for (const [k, v] of Object.entries(o.obj)) if (Array.isArray(v) && v.length) seriesKeys.add(k)
  }
  log(`  array-valued key(s) — candidates for the series: ${[...seriesKeys].join(', ') || '(none)'}`)
  for (const k of seriesKeys) {
    const elems = objects.flatMap(o => Array.isArray(o.obj[k]) ? o.obj[k] : [])
    const kinds = new Set(elems.map(e => e === null ? 'null' : Array.isArray(e) ? 'array' : typeof e))
    log(`    ${k}: ${elems.length} element(s), element type(s): ${[...kinds].join('|')}`)
    if (kinds.has('object')) profile(elems.slice(0, 200), `${k}[] element`)
    else log(`      sample values: ${elems.slice(0, 12).join(', ')}`)
  }
  log('')

  const ex = objects[0]
  log('=== ONE OBJECT ARC, VERBATIM (truncated) ===')
  log(`  sport=${ex.sport} id=${ex.id} drama_peak=${ex.peak}${ex.censored ? '  [from censored leaderboard]' : ''}`)
  for (const line of JSON.stringify(ex.obj, null, 2).split('\n').slice(0, 40)) log('  ' + line)
  log('')

  log('=== VERDICT ===')
  log('Read the array-valued key list above. That is what a renderer must consume, and')
  log('whether its elements are bare numbers or {t,s,p} records decides the extractor.')
}

await main()
