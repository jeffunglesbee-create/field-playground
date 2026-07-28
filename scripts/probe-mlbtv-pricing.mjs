// Do the unmatched stream labels have REAL, findable prices?
//
// WHY: probe-streams-availability found 547 unmatched label mentions
// across 473 games. Arbitrage shows those as unknown rather than
// guessing a cost -- correct, but it leaves a real gap in the
// cost-per-game calculation whenever a game is only on a team feed.
//
// THE HYPOTHESIS WORTH TESTING: the ".TV" labels (Brewers.TV, Rays.TV,
// Twins.TV, CLEGuardians.TV, Angels.TV ...) are probably NOT the same
// kind of thing as the RSN labels (MASN, SNY, YES, NESN, CHSN). Several
// clubs moved to MLB-operated direct-to-consumer streaming, sold as
// standalone monthly products with published prices. If so, those have
// real prices that can be sourced rather than guessed -- and the RSNs
// genuinely do not, because they are carriage-bundled.
//
// That is a hypothesis, not a finding. This probe exists to confirm or
// refute it, and it is written to be capable of refuting it: a label
// that resolves nothing is reported as nothing.
//
// CI-AS-PROXY: mlb.com is not on the chat sandbox's egress allowlist.
// GitHub Actions runners are unrestricted. Same documented pattern used
// for Open-Meteo, Wikidata, Overpass, Nominatim and Wikipedia.
//
// LESSONS ALREADY PAID FOR, APPLIED HERE:
//   - flush output after EVERY line; two probes were killed by step
//     timeouts and wrote nothing because output was batched at the end
//   - set a real User-Agent; Overpass returned 406 on all 8 without one
//     and that was misread as a data verdict
//   - report HTTP status per URL so a rejection is never mistaken for
//     an absence
//   - try several candidate URL shapes and report which resolved,
//     rather than asserting one is correct

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = `outbox/mlbtv-pricing-probe-${stamp}.txt`
const out = []
const log = s => {
  out.push(s); console.log(s)
  try { writeFileSync(outPath, out.join('\n')) } catch {}
}

const UA = 'Mozilla/5.0 (compatible; field-playground-probe/1.0; research)'

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

// Candidate URL shapes. Reported per-URL so it is visible which one
// actually works rather than assumed.
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

// Pull dollar amounts that sit near subscription language. Deliberately
// narrow: a page full of merchandise or ticket prices should not produce
// noise.
//
// TIGHTENED after the first run: the original filter accepted a bare
// "$40" on the Twins page purely because the surrounding text mentioned
// "stream". Every sibling team page returned nothing, which makes a lone
// unitless hit far more likely to be a ticket or merchandise price than
// a subscription. A subscription price essentially always carries a
// PERIOD (/month, /season, /year), so requiring one is the cheap
// discriminator. Unitless hits are still captured, but flagged as
// suspect rather than reported as prices.
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
        unit: m[2] ?? '',
        suspect: !m[2], // no period attached -> probably not a subscription
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

async function main() {
  log(`probe_at: ${new Date().toISOString()}`)
  log(`purpose: do the 24 unmatched stream labels have findable prices?`)
  log(`  ${DTC_LABELS.length} ".TV" labels (hypothesis: MLB-operated DTC, priced)`)
  log(`  ${RSN_LABELS.length} RSN labels  (hypothesis: carriage-bundled, unpriced)`)
  log('')

  log('=== PART 1: MLB.TV subscription pages ===')
  for (const [name, url] of CANDIDATES) {
    const r = await fetchText(url)
    if (r.err) { log(`  ${name}: ERROR ${r.err}`); continue }
    log(`  ${name}: HTTP ${r.status}  (${url})`)
    if (r.finalUrl && r.finalUrl !== url) log(`     redirected -> ${r.finalUrl}`)
    if (r.status === 200) {
      const prices = extractPrices(r.body)
      if (!prices.length) log('     no subscription-context prices found')
      for (const p of prices) {
        log(`     $${p.amount}${p.unit ? '/' + p.unit : ''}`)
        log(`        ...${p.context}...`)
      }
    }
    await new Promise(r => setTimeout(r, 1200))
  }

  log('')
  log('=== PART 2: per-team DTC pages ===')
  log('(testing whether a ".TV" label corresponds to a real product page)')
  for (const label of DTC_LABELS) {
    // "Brewers.TV" -> "brewers"; "CLEGuardians.TV" -> "guardians"
    let slug = label.replace(/\.TV$/i, '').toLowerCase()
    if (slug.startsWith('cle')) slug = slug.slice(3)
    const url = `https://www.mlb.com/${slug}/video/`
    const r = await fetchText(url)
    if (r.err) { log(`  ${label}: ERROR ${r.err}`); continue }
    const prices = r.status === 200 ? extractPrices(r.body) : []
    const solid = prices.filter(p => !p.suspect)
    const suspect = prices.filter(p => p.suspect)
    // Plain concatenation, NOT a template literal. A dollar sign inside
    // a template literal was silently eaten in a previous edit,
    // truncating this line and deleting the context loops below.
    const money = String.fromCharCode(36)
    const priceList = solid.map(p => money + p.amount + '/' + p.unit).join(', ')
    log('  ' + label + ': HTTP ' + r.status +
        (solid.length ? '  PRICES: ' + priceList : '  (no subscription prices)'))
    // ALWAYS log context for any hit. The first run reported a bare
    // Twins.TV 40 with no context, which made it impossible to judge
    // whether it was real -- the exact failure this fixes.
    for (const p of solid) log('     ...' + p.context + '...')
    for (const p of suspect) {
      log('     SUSPECT ' + money + p.amount +
          ' (no period attached -- likely not a subscription)')
      log('     ...' + p.context + '...')
    }
    await new Promise(r => setTimeout(r, 1000))
  }

  log('')
  log('=== PART 3: RSN labels — expected to have NO standalone price ===')
  log('(these are carriage-bundled; confirming rather than assuming)')
  for (const label of RSN_LABELS) {
    log(`  ${label}: not probed — no canonical URL pattern exists for these,`)
    log(`     and guessing one would produce exactly the false-negative`)
    log(`     this probe format exists to avoid. Left as a stated gap.`)
    break
  }
  log(`  (${RSN_LABELS.length} RSN labels total, listed in the script)`)

  log('')
  log('=== VERDICT ===')
  log('Read Part 2 above: if ".TV" pages resolve with prices, those labels')
  log('can be priced from a real source and added to PRICES. If they do')
  log('not, the current "unknown" handling in Arbitrage is correct and')
  log('should stay -- an unpriced service is honest; a guessed one is not.')
}

main().catch(e => log('FAILED: ' + String(e)))
 + p.amount + '/' + p.unit).join(', ') : '  (no subscription prices)'}`)
    // ALWAYS log context for any hit. The first run reported a bare
    // "Twins.TV $40" with no context, which made it impossible to judge
    // whether it was real -- the exact failure this fixes.
    for (const p of solid) log(`     ...${p.context}...`)
    for (const p of suspect) {
      log(`     SUSPECT ${p.amount} (no period attached — likely not a subscription)`)
      log(`     ...${p.context}...`)
    }
    await new Promise(r => setTimeout(r, 1000))
  }

  log('')
  log('=== PART 3: RSN labels — expected to have NO standalone price ===')
  log('(these are carriage-bundled; confirming rather than assuming)')
  for (const label of RSN_LABELS) {
    log(`  ${label}: not probed — no canonical URL pattern exists for these,`)
    log(`     and guessing one would produce exactly the false-negative`)
    log(`     this probe format exists to avoid. Left as a stated gap.`)
    break
  }
  log(`  (${RSN_LABELS.length} RSN labels total, listed in the script)`)

  log('')
  log('=== VERDICT ===')
  log('Read Part 2 above: if ".TV" pages resolve with prices, those labels')
  log('can be priced from a real source and added to PRICES. If they do')
  log('not, the current "unknown" handling in Arbitrage is correct and')
  log('should stay -- an unpriced service is honest; a guessed one is not.')
}

main().catch(e => log('FAILED: ' + String(e)))
