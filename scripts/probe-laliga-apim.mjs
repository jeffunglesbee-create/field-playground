// CC-CMD-2026-08-02-laliga-apim-investigation. Three real tasks, one
// script, one CI run:
//
// TASK 1: confirm apim.laliga.com/public-service and /webview are
// genuinely reachable, real status/headers/body -- no apim-int access,
// ever, under any circumstance.
//
// TASK 2: fetch www.laliga.com's real homepage, extract real
// <script src> URLs from the actual response (don't assume /en-US is
// still correct -- follow whatever it really resolves to), fetch those
// real bundles, search their real content for literal occurrences of
// `/public-service/` or `apim.laliga.com` followed by a path. Report
// real matches with real surrounding context, not invented paths.
//
// TASK 3: exactly one real GET to one real discovered sub-path
// (preferring a standings/live-score-shaped one, matching what the
// user's captured page showed), report the real result plainly --
// open, auth-walled, or dead.
//
// HARD CONSTRAINT: apim-int.laliga.com is never contacted, at any
// point, for any reason -- there is no code path in this script that
// references that host.

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/laliga-apim-' + stamp + '.txt'
const out = []
const log = s => {
  out.push(s); console.log(s)
  try { writeFileSync(outPath, out.join('\n')) } catch {}
}

const UA = 'field-playground-probe/1.0 (research)'

async function fetchRaw(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    const text = await res.text()
    return { status: res.status, finalUrl: res.url, headers: Object.fromEntries(res.headers.entries()), text }
  } catch (e) {
    return { err: String(e?.message ?? e) }
  }
}

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: CC-CMD-2026-08-02-laliga-apim-investigation -- confirm real reachability, find real sub-paths, one targeted probe')
  log('CONSTRAINT: apim-int.laliga.com is never contacted in this script, at any point')
  log('')

  // ── TASK 1 ──
  log('=== TASK 1: base host reachability ===')
  for (const path of ['public-service', 'webview']) {
    const url = 'https://apim.laliga.com/' + path
    const r = await fetchRaw(url)
    log('--- GET ' + url + ' ---')
    if (r.err) {
      log('  FETCH FAILED: ' + r.err)
    } else {
      log('  status: ' + r.status)
      log('  final URL (after any redirect): ' + r.finalUrl)
      log('  headers: ' + JSON.stringify(r.headers))
      log('  body length: ' + r.text.length)
      log('  body (first 1000 chars): ' + r.text.slice(0, 1000))
    }
    log('')
    await new Promise(res => setTimeout(res, 300))
  }

  // ── TASK 2 ──
  log('=== TASK 2: real script bundles from laliga.com, searched for real apim paths ===')
  const home = await fetchRaw('https://www.laliga.com/en-US')
  if (home.err) {
    log('FAILED fetching homepage: ' + home.err)
    log('')
  } else {
    log('homepage status: ' + home.status + '  final URL: ' + home.finalUrl)
    const baseUrl = new URL(home.finalUrl)

    const scriptSrcs = [...home.text.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => m[1])
    const resolved = scriptSrcs.map(s => {
      try { return new URL(s, baseUrl).toString() } catch { return null }
    }).filter(Boolean)
    const uniqueScripts = [...new Set(resolved)]
    log('real <script src> URLs found: ' + uniqueScripts.length)
    for (const s of uniqueScripts) log('  ' + s)
    log('')

    const allFindings = []
    // Cap total bundles fetched -- real sites can ship dozens of chunks;
    // stated here rather than silently truncated.
    const CAP = 25
    const toFetch = uniqueScripts.slice(0, CAP)
    if (uniqueScripts.length > CAP) log('NOTE: capping bundle fetch at ' + CAP + ' of ' + uniqueScripts.length + ' real script URLs found (logged, not silent)')
    log('')

    for (const scriptUrl of toFetch) {
      const bundle = await fetchRaw(scriptUrl)
      if (bundle.err) { log('  SKIP ' + scriptUrl + ': ' + bundle.err); continue }
      if (bundle.status !== 200) { log('  SKIP ' + scriptUrl + ': HTTP ' + bundle.status); continue }

      // Literal string search, per task scope -- no invented REST
      // conventions, only what's actually present in the real bundle text.
      const patterns = [
        { name: 'apim.laliga.com+path', re: /apim\.laliga\.com(\/[a-zA-Z0-9\-_/]{1,120})/g },
        { name: 'quoted /public-service/ literal', re: /["'`](\/public-service\/[a-zA-Z0-9\-_/{}:]{0,120})["'`]/g },
        { name: 'quoted /webview/ literal', re: /["'`](\/webview\/[a-zA-Z0-9\-_/{}:]{0,120})["'`]/g },
      ]
      for (const p of patterns) {
        for (const m of bundle.text.matchAll(p.re)) {
          const idx = m.index ?? 0
          const context = bundle.text.slice(Math.max(0, idx - 60), idx + m[0].length + 60)
          allFindings.push({ scriptUrl, pattern: p.name, match: m[1] ?? m[0], context })
        }
      }
      await new Promise(res => setTimeout(res, 200))
    }

    log('=== REAL FINDINGS: literal apim/public-service/webview path occurrences ===')
    log('total raw matches: ' + allFindings.length)
    const seen = new Set()
    for (const f of allFindings) {
      const key = f.pattern + '|' + f.match
      if (seen.has(key)) continue
      seen.add(key)
      log('  [' + f.pattern + '] ' + f.match)
      log('    from: ' + f.scriptUrl)
      log('    context: ...' + f.context.replace(/\s+/g, ' ') + '...')
      log('')
    }
    if (!allFindings.length) {
      log('  NONE FOUND -- no literal apim.laliga.com or /public-service//webview/ path strings')
      log('  in the ' + toFetch.length + ' real bundle(s) fetched. Reporting this plainly, not')
      log('  inventing a plausible-sounding path to test in Task 3.')
    }
    log('')

    // ── TASK 3 ──
    log('=== TASK 3: one targeted real probe ===')
    const distinctPaths = [...new Set(allFindings.map(f => f.match).filter(p => p && p.length > 1))]
    if (!distinctPaths.length) {
      log('No real sub-path was found in Task 2 to target. Per task scope ("do not guess')
      log('additional endpoint paths beyond what Task 2\'s bundle search actually finds"),')
      log('Task 3 is not performed -- there is nothing real to probe.')
    } else {
      const preferred = distinctPaths.find(p => /stand|live|score|leader|rank/i.test(p)) || distinctPaths[0]
      log('targeting: ' + preferred + '  (preferred: standings/live-score-shaped match, else first found)')
      // Both /public-service/ and /webview/ are sub-paths of the SAME
      // public host per the CC-CMD's own three listed hosts -- never
      // apim-int, which this script never references anywhere.
      const targetUrl = 'https://apim.laliga.com' + preferred
      log('GET ' + targetUrl)
      const r = await fetchRaw(targetUrl)
      if (r.err) {
        log('  FETCH FAILED: ' + r.err)
      } else {
        log('  status: ' + r.status)
        log('  headers: ' + JSON.stringify(r.headers))
        log('  body length: ' + r.text.length)
        log('  body (first 1500 chars): ' + r.text.slice(0, 1500))
      }
    }
  }

  log('')
  log('=== VERDICT ===')
  log('See TASK 1/2/3 sections above for the real, unguessed findings. apim-int.laliga.com')
  log('was never contacted at any point in this script.')
}

main().catch(e => log('FAILED: ' + String(e?.stack || e)))
