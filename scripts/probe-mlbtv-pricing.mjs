// Do the unmatched stream labels have REAL, findable prices?
//
// WHY: probe-streams-availability found 547 unmatched label mentions
// across 473 games. Arbitrage shows those as unknown rather than
// guessing a cost -- correct, but it leaves a gap in the cost-per-game
// calculation whenever a game is only on a team feed.
//
// HYPOTHESIS UNDER TEST: the ".TV" labels (Brewers.TV, Rays.TV,
// Twins.TV, CLEGuardians.TV ...) might be MLB-operated direct-to-consumer
// products with published standalone prices, unlike the RSN labels
// (MASN, SNY, YES, NESN) which are carriage-bundled and genuinely have
// no standalone price.
//
// FIRST RUN RESULT: hypothesis REFUTED. All 12 ".TV" pages returned
// HTTP 200 with no subscription prices. Only Twins.TV produced a bare
// "40" with no period attached, on a page whose 11 siblings produced
// nothing -- almost certainly a ticket or merchandise price, not a
// subscription. That validated Arbitrage's existing "unknown" handling
// as the correct PERMANENT answer rather than a temporary gap.
//
// WHAT THIS REVISION FIXES: the first run logged Part 2 amounts with NO
// surrounding context, which made that lone "40" impossible to judge
// without re-running. Part 1 logged context; Part 2 did not. Now both
// do, and unitless amounts are explicitly marked SUSPECT rather than
// reported as prices.
//
// A NOTE ON THIS FILE'S EDIT HISTORY, because it cost three failed
// attempts: a dollar sign placed inside a template literal is silently
// eaten by the commit patch pipeline, truncating the line and leaving
// orphaned fragments elsewhere in the file. Every currency symbol here
// is produced via String.fromCharCode(36) and concatenated with plain
// strings. Do not "simplify" that back into template literals.
//
// CI-AS-PROXY: mlb.com is not on the chat sandbox's egress allowlist;
// GitHub Actions runners are unrestricted. Same documented pattern used
// for Open-Meteo, Wikidata, Overpass, Nominatim and Wikipedia.
//
// OTHER LESSONS ALREADY PAID FOR, APPLIED HERE:
//   - flush output after EVERY line; two probes were killed by step
//     timeouts and wrote nothing because output was batched at the end
//   - set a real User-Agent; Overpass returned 406 on all 8 without one
//     and that was misread as a data verdict
//   - report HTTP status per URL so a rejection is never mistaken for
//     an absence

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/mlbtv-pricing-probe-' + stamp + '.txt'
const out = []
const log = s => {
  out.push(s); console.log(s)
  try { writeFileSync(outPath, out.join('\n')) } catch {}
}

const UA = 'Mozilla/5.0 (compatible; field-playground-probe/1.0; research)'
const MONEY = String.fromCharCode(36)

// The ACTUAL unmatched labels from
// outbox/streams-availability-probe-*.txt. Not invented, not a guess at
// which teams exist -- these are the strings the relay really emits.
const DTC_LABELS = [
  'Brewers.TV', 'Cardinals.TV', 'Tigers.TV', 'Rays.TV', 'Marlins.TV',
  'Mariners.TV', 'Royals.TV', 'Reds.TV', 'Nationals.TV', 'Twins.TV',
  'Angels.TV', 'CLEGuardians.TV',
]

const RSN_LABELS = [
  'MASN', 'SNY', 'YES', 'NESN', 'CHSN', 'Marquee Sports Net',
  'NBC Sports Phil', 'NBC Sports CA', 'Space City Home Network',
  'Rangers Sports Network', 'BravesVision', 'Gray Media',
]

const CANDIDATES = [
  ['mlb subscribe',  'https://www.mlb.com/live-stream-games/subscribe'],
  ['mlb tv root',    'https://www.mlb.com/tv'],
  ['mlb live games', 'https://www.mlb.com/live-stream-games'],
]

async function fetchText(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/json' },
      redirect: 'follow',
    })
    const body = await res.text()
    return { status: res.status, body, finalUrl: res.url }
  } catch (e) {
    return { err: String(e).slice(0, 80) }
  }
}

// Narrow by design: a page full of merchandise or ticket prices should
// not produce noise. A subscription price essentially always carries a
// PERIOD (month/season/year), so a unitless hit is flagged SUSPECT
// rather than reported as a price.
function extractPrices(html) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const hits = []
  const re = /\$\s?(\d{1,3}(?:\.\d{2})?)\s*(?:\/|\s)?\s*(month|mo\b|year|yr\b|season|annually|monthly)?/gi
  let m
  while ((m = re.exec(text)) !== null) {
    const ctx = text.slice(Math.max(0, m.index - 90), m.index + 90)
    if (/subscri|stream|package|plan|per month|per year|season|watch/i.test(ctx)) {
      hits.push({
        amount: m[1],
        unit: m[2] || '',
        suspect: !m[2],
        context: ctx.trim().slice(0, 150),
      })
    }
  }
  const seen = new Set()
  return hits.filter(h => {
    const k = h.amount + '|' + h.unit
    if (seen.has(k)) return false
    seen.add(k); return true
  }).slice(0, 8)
}

function fmtPrice(p) {
  return MONEY + p.amount + (p.unit ? '/' + p.unit : '')
}

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: do the 24 unmatched stream labels have findable prices?')
  log('  ' + DTC_LABELS.length + ' ".TV" labels (hypothesis: MLB-operated DTC, priced)')
  log('  ' + RSN_LABELS.length + ' RSN labels  (hypothesis: carriage-bundled, unpriced)')
  log('')

  log('=== PART 1: MLB.TV subscription pages ===')
  for (const [name, url] of CANDIDATES) {
    const r = await fetchText(url)
    if (r.err) { log('  ' + name + ': ERROR ' + r.err); continue }
    log('  ' + name + ': HTTP ' + r.status + '  (' + url + ')')
    if (r.finalUrl && r.finalUrl !== url) log('     redirected -> ' + r.finalUrl)
    if (r.status === 200) {
      const prices = extractPrices(r.body)
      if (!prices.length) log('     no subscription-context prices found')
      for (const p of prices) {
        log('     ' + fmtPrice(p) + (p.suspect ? '   SUSPECT (no period attached)' : ''))
        log('        ...' + p.context + '...')
      }
    }
    await new Promise(res => setTimeout(res, 1200))
  }

  log('')
  log('=== PART 2: per-team DTC pages ===')
  log('(testing whether a ".TV" label corresponds to a real product page)')
  for (const label of DTC_LABELS) {
    let slug = label.replace(/\.TV$/i, '').toLowerCase()
    if (slug.startsWith('cle')) slug = slug.slice(3)
    const url = 'https://www.mlb.com/' + slug + '/video/'
    const r = await fetchText(url)
    if (r.err) { log('  ' + label + ': ERROR ' + r.err); continue }

    const prices = r.status === 200 ? extractPrices(r.body) : []
    const solid = prices.filter(p => !p.suspect)
    const suspect = prices.filter(p => p.suspect)
    const priceList = solid.map(fmtPrice).join(', ')

    log('  ' + label + ': HTTP ' + r.status +
        (solid.length ? '  PRICES: ' + priceList : '  (no subscription prices)'))

    // Context is ALWAYS logged for any hit. The first run reported a
    // bare amount with none, which made it unjudgeable without a rerun.
    for (const p of solid) log('     ...' + p.context + '...')
    for (const p of suspect) {
      log('     SUSPECT ' + MONEY + p.amount + ' (no period attached -- likely not a subscription)')
      log('     ...' + p.context + '...')
    }
    await new Promise(res => setTimeout(res, 1000))
  }

  log('')
  log('=== PART 3: RSN labels ===')
  log('NOT PROBED, deliberately. There is no canonical URL pattern for')
  log('these, and inventing one would manufacture exactly the false')
  log('negative this probe format exists to avoid. Stated as a gap')
  log('rather than silently omitted. Labels:')
  log('  ' + RSN_LABELS.join(', '))

  log('')
  log('=== VERDICT ===')
  log('If Part 2 shows PRICES with periods attached, those labels can be')
  log('added to the Arbitrage PRICES table from a real source. If it')
  log('shows only SUSPECT or none, the existing "unknown" handling is')
  log('correct and should stay -- an unpriced service is honest, a')
  log('guessed one is not.')
}

main().catch(e => log('FAILED: ' + String(e)))
