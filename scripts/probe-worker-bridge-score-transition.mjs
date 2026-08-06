// Follow-up on a real, disclosed gap in the 2026-08-05 demo/infra sweep
// (docs/outbox/cc-session-2026-08-05-demo-infra-sweep.md): WorkerBridgeDemo's
// real "score" change-type branch (the <Show when={c.type === 'score'}>
// row) was never actually observed rendering. Root cause, confirmed by
// reading vite.config.js's dev mock: the scripted score-transition ladder
// for /context/date (hou-tex going live at request 5, growing at 6,
// blowout+lead-change at 7, comeback at 8) is keyed to a SHARED, dev-
// server-wide request counter, not anything WorkerBridgeDemo owns. During
// the sweep, 4 parallel agent batches shared one dev server and several
// OTHER components also poll /context/date -- by the time WorkerBridgeDemo
// was observed, the shared counter had almost certainly already passed
// request 8 into the steady-state control zone, where "No changes this
// cycle" is the correct, honest output, not a bug.
//
// This isn't a network-reachability gap (the scripted ladder is pure dev-
// mock JS, no external host involved) -- it needs a CLEAN, ISOLATED
// environment where WorkerBridgeDemo is the only thing polling
// /context/date, so the shared counter reaches request 5-8 on ITS
// schedule. A fresh CI job, with nothing else in the browser hitting the
// dev server, is exactly that: not fixing a sandbox limitation, fixing a
// test-isolation problem the earlier parallel-batch design introduced.
//
// Runs Vite in DEV mode deliberately (not `vite preview` of a prod
// build) -- the scripted transition ladder lives in vite.config.js's
// dev-only mockRelay() plugin and does not exist against the real relay.

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/worker-bridge-score-transition-probe-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const DEV_URL = process.env.DEV_URL || 'http://127.0.0.1:5199'

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: observe WorkerBridgeDemo\'s real "score" change branch in an ISOLATED session')
  log('(nothing else polling /context/date), long enough to cross the dev mock\'s scripted')
  log('transition window (requests 5-8, ~15s apart after the initial mount burst).')
  log('')

  const browser = await chromium.launch()
  const page = await browser.newPage()
  const pageErrors = []
  page.on('pageerror', e => pageErrors.push(String(e)))

  await page.goto(DEV_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })

  const tabButtons = await page.$$('button, [role=tab]')
  for (const b of tabButtons) {
    const t = (await b.textContent() || '').trim().toLowerCase()
    if (t.startsWith('lab')) { await b.click(); break }
  }
  await page.waitForTimeout(500)

  const root = await page.evaluateHandle(() => {
    const labels = Array.from(document.querySelectorAll('span'))
    const label = labels.find(s => s.textContent.trim() === 'Worker Bridge')
    return label ? label.closest('div').parentElement : null
  })
  const found = await root.evaluate(el => !!el)
  if (!found) { log('FAILED: Worker Bridge component not found on the lab tab.'); await browser.close(); return }

  // Poll counts 1-4 happen fast (startup burst + baseline); 5-8 are one
  // real 15s cycle apart each. Sample every 5s for up to 150s -- long
  // enough to cross request 8 with margin, without hardcoding an exact
  // wall-clock match to the 15s server-side interval.
  const seen = new Set()
  let sawScoreChange = null
  const deadline = Date.now() + 150000
  while (Date.now() < deadline) {
    const snapshot = await root.evaluate(el => el.innerText)
    const pollMatch = snapshot.match(/polls seen: (\d+)/)
    const pollCount = pollMatch ? pollMatch[1] : '?'
    if (!seen.has(pollCount)) {
      seen.add(pollCount)
      log(`poll ${pollCount}: ${snapshot.replace(/\s+/g, ' ').slice(0, 200)}`)
    }
    if (/score/.test(snapshot) && /→/.test(snapshot)) {
      sawScoreChange = snapshot
      break
    }
    await page.waitForTimeout(5000)
  }

  log('')
  log('=== RESULT ===')
  log('distinct poll counts observed: ' + [...seen].join(', '))
  log('page errors: ' + JSON.stringify(pageErrors))
  log('real "score" change row observed: ' + (sawScoreChange ? 'YES' : 'no'))
  if (sawScoreChange) log('snapshot at that moment: ' + sawScoreChange.replace(/\s+/g, ' ').slice(0, 300))

  log('')
  log('=== VERDICT ===')
  if (pageErrors.length) {
    log('NOT CONFIRMED: real page errors occurred -- see above.')
  } else if (sawScoreChange) {
    log('CONFIRMED: WorkerBridgeDemo\'s real "score" change-type branch (<Show when={c.type ===')
    log('\'score\'}>) rendered correctly in an isolated session, with a real from -> to value pair.')
    log('The earlier "no changes observed" result was confirmed as shared-counter contamination')
    log('from concurrent parallel testing, not a component bug.')
  } else {
    log('NOT CONFIRMED: no score-change row appeared within the observation window even in')
    log('isolation -- this would need real further investigation, not dismissal as contamination.')
  }

  await browser.close()
}

main().catch(e => { log('FAILED: ' + String(e)); process.exit(1) })
