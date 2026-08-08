#!/usr/bin/env node
// Generate API schemas FROM MEASUREMENT, then detect when reality drifts away
// from them.
//
// WHY THIS ONE AND NOT THE OTHERS. The detection-latency probe measured this
// repo's real defect profile: median introduce->fix is 35 minutes and 82% of
// defects die within a day, so blanket enforcement would be solving a problem
// that mostly does not exist here. But the p90 tail lives entirely in src/data
// (8.2d) and src/components (4.3d), and the single slowest defect measured --
// relay.js double-fire, 11.9 days -- was SILENT. Data-shape bugs are that
// class: they do not throw, they produce wrong numbers three layers downstream.
// This is the one piece of the proposed infrastructure the evidence endorses.
//
// THE TRAP THIS IS BUILT TO AVOID, and it is not hypothetical -- it happened in
// this repo on 2026-08-06. A probe measured BSD `/incidents/` and reported
// home_score present on 26 of 117 records (22%). Its automated verdict called
// the field "too sparsely filled to carry the argument" and declared the
// preferred fix unproven. That verdict was WRONG. Cross-tabulated by record
// type, home_score is on 14/14 GOAL incidents (100%) and 0/55 substitutions.
// The marginal rate was meaningless; the conditional rate was decisive.
//
// A schema generated naively from marginal fill rates would encode that exact
// error as a permanent rule -- marking a required field optional forever. So
// this generator is CONDITIONAL BY CONSTRUCTION: every collection declares a
// discriminator, fill rates are computed per variant, and `required` means
// "100% within its own variant", never "common overall".
//
// Two modes:
//   --generate   fetch real data, emit src/data/schemas/*.json
//   --check      re-fetch, diff live shape against committed schema, report drift
//
// The relay is sandbox-blocked from chat, so both modes are CI-as-proxy -- the
// same pattern every real-data probe in this repo uses.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'

const MODE = process.argv.includes('--check') ? 'check' : 'generate'
const SCHEMA_DIR = 'src/data/schemas'
mkdirSync(SCHEMA_DIR, { recursive: true })
mkdirSync('outbox', { recursive: true })

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = `outbox/schema-${MODE}-${stamp}.txt`
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const UA = 'field-playground-probe/1.0 (github.com/jeffunglesbee-create/field-playground; research)'
const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'

// A field is REQUIRED only at this conditional fill or above, within its own
// variant. Not 1.0: a single malformed record in a real feed should not
// permanently demote a field that is otherwise universal.
const REQUIRED_AT = 0.98
// Below this, a field is too rare to assert anything about and is recorded as
// "seen" rather than "optional" -- an honest third state.
const RARE_BELOW = 0.05

// Collection failures are COUNTED, not just logged. The first version of this
// script logged two HTTP 429s, collected 79 of 117 records, and still printed
// "No drift" -- the precise unchecked-vs-unchanged confusion it was written to
// prevent, reproduced inside itself. A degraded sample cannot clear a schema.
let fetchFailures = 0
async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) { fetchFailures++; throw new Error(`HTTP ${res.status} ${url}`) }
  return res.json()
}

function shiftDate(base, d) {
  const x = new Date(base + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + d)
  return x.toISOString().split('T')[0]
}

const typeOf = v =>
  v === null ? 'null'
  : Array.isArray(v) ? 'array'
  : typeof v === 'object' ? 'object'
  : typeof v

// ---- the targets ----------------------------------------------------------
// Each declares how to collect real records and, critically, what discriminates
// their variants. A collection with no meaningful discriminator says so with
// `discriminator: null` rather than pretending one exists.
const TARGETS = [
  {
    name: 'context-date-games',
    route: '/context/date/{date}',
    // Sport is the real variant axis here: MLB rows carry situational fields
    // no soccer row ever has, so a pooled schema would call every MLB-only
    // field optional.
    discriminator: g => String(g?.sport ?? '(missing)').trim().toLowerCase(),
    async collect() {
      const today = new Date().toISOString().split('T')[0]
      const rows = []
      for (let i = 0; i < 10; i++) {
        const d = shiftDate(today, -i)
        try {
          const j = await getJson(`${RELAY}/context/date/${d}`)
          rows.push(...(j?.games?.regular ?? []), ...(j?.games?.postseason ?? []))
        } catch (e) { log(`    ${d}: ${String(e.message)}`) }
        await new Promise(r => setTimeout(r, 200))
      }
      return rows
    },
  },
  {
    name: 'bsd-incidents',
    route: '/bsd/events/{id}/incidents',
    // The poster child. Discriminating on `type` is the whole reason this
    // generator exists.
    discriminator: inc => String(inc?.type ?? '(missing)'),
    async collect() {
      const ids = []
      const today = new Date().toISOString().split('T')[0]
      for (let i = 1; i <= 10 && ids.length < 6; i++) {
        try {
          const j = await getJson(`${RELAY}/bsd/events/by-date?league_id=18&date=${shiftDate(today, -i)}`)
          for (const r of (j?.results ?? j?.events ?? [])) {
            const id = r.id ?? r.event_id
            if (id && !ids.includes(id)) ids.push(id)
            if (ids.length >= 6) break
          }
        } catch { /* by-date filtering is known-unreliable; try the next day */ }
        await new Promise(r => setTimeout(r, 200))
      }
      const rows = []
      for (const id of ids) {
        try {
          const j = await getJson(`${RELAY}/bsd/events/${id}/incidents`)
          rows.push(...(j?.incidents ?? j?.results ?? []))
        } catch (e) { log(`    event ${id}: ${String(e.message)}`) }
        await new Promise(r => setTimeout(r, 200))
      }
      return rows
    },
  },
]

// ---- the core: conditional shape ------------------------------------------
function measureShape(records, discriminator) {
  const byVariant = new Map()
  for (const rec of records) {
    if (!rec || typeof rec !== 'object') continue
    const v = discriminator ? discriminator(rec) : '(all)'
    if (!byVariant.has(v)) byVariant.set(v, [])
    byVariant.get(v).push(rec)
  }

  const variants = {}
  for (const [variant, rows] of byVariant) {
    const present = new Map(), nonNull = new Map(), types = new Map()
    for (const r of rows) {
      for (const [k, val] of Object.entries(r)) {
        present.set(k, (present.get(k) ?? 0) + 1)
        if (val !== null && val !== undefined && val !== '') nonNull.set(k, (nonNull.get(k) ?? 0) + 1)
        if (!types.has(k)) types.set(k, new Set())
        types.get(k).add(typeOf(val))
      }
    }
    const required = [], optional = {}, rare = {}
    for (const [k, n] of present) {
      const rate = (nonNull.get(k) ?? 0) / rows.length
      const t = [...types.get(k)].filter(x => x !== 'null').sort()
      if (rate >= REQUIRED_AT) required.push(k)
      else if (rate >= RARE_BELOW) optional[k] = { fill: Number(rate.toFixed(3)), types: t }
      else rare[k] = { fill: Number(rate.toFixed(3)), types: t }
    }
    variants[variant] = {
      n: rows.length,
      required: required.sort(),
      optional,
      rare,
      // Types are recorded for required fields too -- a field that stays present
      // but changes type is a drift the field list alone would miss.
      requiredTypes: Object.fromEntries(required.sort().map(k => [k, [...types.get(k)].filter(x => x !== 'null').sort()])),
    }
  }
  return variants
}

function schemaPath(name) { return `${SCHEMA_DIR}/${name}.json` }

async function generate() {
  log('mode: GENERATE — build schemas from measured live data')
  log('required = >=98% NON-NULL WITHIN ITS OWN VARIANT, never "common overall"')
  log('')
  for (const t of TARGETS) {
    log(`=== ${t.name}  (${t.route}) ===`)
    let records = []
    try { records = await t.collect() } catch (e) { log(`  collect failed: ${e.message}`) }
    log(`  real records collected: ${records.length}`)
    if (!records.length) {
      log('  NO DATA -- schema NOT written. An empty measurement must never overwrite')
      log('  a schema built from real data; that would silently erase the contract.')
      log('')
      continue
    }
    const variants = measureShape(records, t.discriminator)
    const schema = {
      name: t.name,
      route: t.route,
      generated_at: new Date().toISOString(),
      method: 'measured from live responses; required = conditional fill within variant',
      required_at: REQUIRED_AT,
      total_records: records.length,
      variants,
    }
    writeFileSync(schemaPath(t.name), JSON.stringify(schema, null, 2) + '\n')
    log(`  variants: ${Object.keys(variants).length}`)
    for (const [v, d] of Object.entries(variants).sort((a, b) => b[1].n - a[1].n)) {
      log(`    ${v.padEnd(22)} n=${String(d.n).padStart(4)}  required=${d.required.length}  optional=${Object.keys(d.optional).length}  rare=${Object.keys(d.rare).length}`)
    }
    // Show the conditional/marginal gap explicitly -- this is the number the
    // 2026-08-06 verdict got wrong, and seeing it is the point of the exercise.
    const marginal = new Map()
    for (const r of records) for (const [k, v] of Object.entries(r)) {
      if (v !== null && v !== undefined && v !== '') marginal.set(k, (marginal.get(k) ?? 0) + 1)
    }
    const gaps = []
    for (const [v, d] of Object.entries(variants)) {
      for (const k of d.required) {
        const marg = (marginal.get(k) ?? 0) / records.length
        if (marg < 0.5) gaps.push({ field: k, variant: v, marginal: marg })
      }
    }
    if (gaps.length) {
      log('  FIELDS A MARGINAL READING WOULD HAVE MISCLASSIFIED:')
      for (const g of gaps.slice(0, 10)) {
        log(`    ${g.field} — required in "${g.variant}", but only ${(g.marginal * 100).toFixed(0)}% overall`)
      }
      log('    A schema built on marginal rates would call these optional. They are not.')
    }
    log(`  written: ${schemaPath(t.name)}`)
    log('')
  }
}

async function check() {
  log('mode: CHECK — re-measure live shape, diff against committed schema')
  log('')
  let drift = 0, unchecked = 0, degraded = 0
  for (const t of TARGETS) {
    log(`=== ${t.name} ===`)
    const p = schemaPath(t.name)
    if (!existsSync(p)) { log('  no committed schema — run --generate first'); unchecked++; log(''); continue }
    const prior = JSON.parse(readFileSync(p, 'utf8'))
    fetchFailures = 0
    let records = []
    try { records = await t.collect() } catch (e) { log(`  collect failed: ${e.message}`) }
    if (!records.length) {
      log('  NO DATA — cannot check. This is "unchecked", never "unchanged".')
      unchecked++; log(''); continue
    }
    const now = measureShape(records, t.discriminator)
    const coverage = records.length / (prior.total_records || records.length)
    log(`  live records: ${records.length}  (schema built from ${prior.total_records})`)
    if (fetchFailures) log(`  fetch failures this run: ${fetchFailures}`)

    // A materially smaller sample cannot clear a schema. A field required on a
    // variant with 3 surviving records is not "confirmed still required" -- it
    // is unconfirmed, and saying otherwise is how a green run hides a real
    // drift behind a rate limit.
    if (fetchFailures || coverage < 0.75) {
      log(`  DEGRADED SAMPLE: ${(coverage * 100).toFixed(0)}% of the records this schema was built from` +
          (fetchFailures ? `, ${fetchFailures} fetch failure(s)` : ''))
      log('  Absence of a field in this run is NOT evidence of drift, and presence is NOT')
      log('  evidence of health. Findings below are advisory for this target.')
      degraded++
    }

    for (const [variant, was] of Object.entries(prior.variants)) {
      const is = now[variant]
      if (!is) { log(`  VARIANT GONE: "${variant}" existed in the schema and produced no records now`); drift++; continue }
      const missing = was.required.filter(k => !is.required.includes(k))
      const added = is.required.filter(k => !was.required.includes(k))
      const typeChanged = was.required
        .filter(k => is.requiredTypes?.[k] && was.requiredTypes?.[k])
        .filter(k => JSON.stringify(is.requiredTypes[k]) !== JSON.stringify(was.requiredTypes[k]))
      if (missing.length) { log(`  DRIFT "${variant}": required field(s) no longer reliably present: ${missing.join(', ')}`); drift++ }
      if (typeChanged.length) {
        for (const k of typeChanged) log(`  DRIFT "${variant}": ${k} type ${JSON.stringify(was.requiredTypes[k])} -> ${JSON.stringify(is.requiredTypes[k])}`)
        drift++
      }
      if (added.length) log(`  new required field(s) in "${variant}": ${added.join(', ')}  (schema is stale, not wrong)`)
    }
    for (const variant of Object.keys(now)) {
      if (!prior.variants[variant]) log(`  NEW VARIANT: "${variant}" (n=${now[variant].n}) — unknown to the schema`)
    }
    log('')
  }

  log('=== VERDICT ===')
  if (degraded) {
    log(`${degraded} target(s) ran on a DEGRADED sample (fetch failures or a much smaller`)
    log('corpus than the schema was built from). Those targets are unchecked, whatever')
    log('the per-target lines above say.')
  }
  if (unchecked && !drift) {
    log(`${unchecked} target(s) could not be checked and 0 drifts found in the rest.`)
    log('That is NOT a clean bill of health — an unchecked target is unknown, not unchanged.')
  } else if (drift) {
    log(`${drift} drift(s) detected. A field the code treats as guaranteed has stopped being`)
    log('guaranteed, or changed type. This is the failure that costs days: it does not throw,')
    log('it produces wrong values downstream. Fix the consumer or regenerate deliberately.')
  } else if (degraded) {
    log('No drift found in the targets that ran cleanly. That is not a clean bill of health')
    log('for the degraded ones.')
  } else {
    log('No drift. Live shapes still match what was measured when the schemas were built.')
  }
}

;(MODE === 'check' ? check() : generate()).catch(e => log('FAILED: ' + String(e?.stack || e)))
