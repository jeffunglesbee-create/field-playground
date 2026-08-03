// The one thing that could NOT be verified locally: a real Three.js CDN
// load (esm.sh returns 403 from direct chat-sandbox access, same
// constraint webaudio-tinysynth already has) and a real WebGL render.
// Local verification already confirmed: WebGL2 context creation works
// in this sandbox's own headless Chromium, the pure terrain-mesh math
// is correct (unit-tested), and the CDN-load-failure path degrades
// honestly with no page errors on mount or unmount. This is the
// missing piece -- served against the real, built app (not
// page.setContent(), so real relay + real esm.sh fetches behave
// exactly as they would for a real visitor), against REAL current
// archived-game data, not mocked.

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, statSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/terrain-flight-render-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const BASE_URL = process.env.PREVIEW_URL || 'http://127.0.0.1:4173'

async function checkRealDataDirectly() {
  // Independent of the browser/app entirely -- the render probe found
  // "no real archived game with a usable drama_arc," which could be a
  // real, temporary data gap OR a real code bug (buildTerrainMesh/
  // analyzeGameArc). Fetching the exact same real endpoint directly
  // tells the difference instead of guessing at the React internals.
  try {
    const res = await fetch('https://field-relay-nba.jeffunglesbee.workers.dev/archive/drama/leaderboard?sport=MLB&limit=50')
    if (!res.ok) { log('direct real fetch failed: HTTP ' + res.status); return }
    const data = await res.json()
    const games = data?.games ?? []
    log('direct real fetch: ' + games.length + ' real games returned')
    let parseable = 0, usable = 0
    for (const g of games) {
      let arc
      try { arc = JSON.parse(g.drama_arc) } catch { continue }
      if (!Array.isArray(arc)) continue
      parseable++
      if (arc.length >= 10) usable++
    }
    log('direct real fetch: ' + parseable + ' with a parseable drama_arc, ' + usable + ' with length >= 10')
  } catch (e) {
    log('direct real fetch threw: ' + String(e))
  }
}

async function main() {
  log('probe_at: ' + new Date().toISOString())
  await checkRealDataDirectly()
  log('purpose: does Terrain Flight actually render real 3D terrain from real esm.sh + real archived data?')
  log('')

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

  const pageErrors = []
  const consoleErrors = []
  page.on('pageerror', e => pageErrors.push(String(e.message)))
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })

  // 'networkidle' is the wrong wait condition for this specific real
  // app -- confirmed the hard way: the preview server itself was
  // reachable the whole time (server_ready=1, outbox/terrain-flight-
  // preview-output.txt), and page.goto still timed out. This app
  // polls continuously by real design (HealthPanel, ScoreTicker,
  // AmbientWeek's own 10 sequential real day fetches, ...), so true
  // network silence structurally never happens. 'domcontentloaded' is
  // enough here -- the actual meaningful wait condition is the
  // explicit waitForFunction below, which checks for Terrain Flight's
  // own real state, not "nothing on the page is fetching."
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  log('app loaded: ' + BASE_URL)

  const labTab = page.getByText('Lab', { exact: false }).first()
  await labTab.click()
  log('clicked Lab tab')

  // Real CDN load + real render takes longer than the mocked local
  // test -- wait generously, and wait for EITHER the honest error
  // state or the loading indicator to clear, not a fixed sleep alone.
  await page.waitForFunction(() => {
    const body = document.body.innerText
    return !body.includes('Loading real 3D renderer') || body.toLowerCase().includes('unable to load')
  }, { timeout: 20000 }).catch(() => log('WARNING: still showing "Loading" after 20s -- checking state anyway'))

  await page.waitForTimeout(1500) // let the first few animation frames actually paint

  const bodyText = await page.locator('body').innerText()
  const hadError = /unable to load the real 3d renderer|no real archived game/i.test(bodyText)
  log('honest error state shown: ' + hadError)
  if (hadError) {
    const errLine = bodyText.split('\n').find(l => /unable to load|no real archived game/i.test(l))
    log('exact error text: ' + JSON.stringify(errLine))
  }

  const canvasCount = await page.locator('canvas').count()
  log('canvas elements present: ' + canvasCount)

  let pixelVariance = null
  let screenshotBytes = null
  let matchupFound = false
  let indexFound = false
  const screenshotPath = 'outbox/terrain-flight-render-' + stamp + '.png'
  if (!hadError && canvasCount > 0) {
    const canvas = page.locator('canvas').first()
    await canvas.screenshot({ path: screenshotPath }).catch(() => {})
    try { screenshotBytes = statSync(screenshotPath).size } catch {}
    log('real screenshot committed: ' + screenshotPath + ' (' + screenshotBytes + ' bytes)')

    // Grid sample (not a 1D stride, which can bias toward one region)
    // now that the renderer is created with preserveDrawingBuffer:
    // true -- confirmed necessary the hard way: without it, readPixels
    // returned near-uniform data from a frame canvas.screenshot()
    // (compositor-level, matches what's actually on screen) showed was
    // a real, correct render.
    pixelVariance = await page.evaluate(() => {
      const canvasEl = document.querySelector('canvas')
      if (!canvasEl) return null
      const gl = canvasEl.getContext('webgl2') || canvasEl.getContext('webgl')
      if (!gl) return null
      const w = canvasEl.width, h = canvasEl.height
      if (!w || !h) return { w, h, distinctColorsSampled: 0 }
      const pixels = new Uint8Array(w * h * 4)
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      const seen = new Set()
      const gridX = 40, gridY = 20
      for (let gy = 0; gy < gridY; gy++) {
        for (let gx = 0; gx < gridX; gx++) {
          const x = Math.floor((gx / gridX) * w)
          const y = Math.floor((gy / gridY) * h)
          const idx = (y * w + x) * 4
          seen.add(pixels[idx] + ',' + pixels[idx + 1] + ',' + pixels[idx + 2])
        }
      }
      return { w, h, distinctColorsSampled: seen.size }
    })
    log('WebGL canvas pixel readback (2D grid sample): ' + JSON.stringify(pixelVariance))

    const fullBodyText = await page.locator('body').innerText()
    const atSignFound = / @ /.test(fullBodyText)
    const titleFound = fullBodyText.includes('Terrain Flight')
    matchupFound = atSignFound && titleFound
    indexFound = /index \d+\/\d+/.test(fullBodyText)
    log('real matchup text (" @ ") found: ' + matchupFound + ' (atSign=' + atSignFound + ' title=' + titleFound + ')')
    log('real "index N/M" text found: ' + indexFound)
    // Diagnostic for a real, unexplained mismatch seen 2026-08-03:
    // indexFound true (same <p> as the matchup text) but matchupFound
    // false. Log the actual matchup-line text directly instead of
    // guessing at why the regex didn't match.
    if (indexFound && !matchupFound) {
      const idxLine = fullBodyText.split('\n').find(l => /index \d+\/\d+/.test(l))
      log('DIAGNOSTIC matchup-line raw text: ' + JSON.stringify(idxLine))
    }
  }

  log('')
  log('page errors: ' + JSON.stringify(pageErrors))
  log('console errors: ' + JSON.stringify(consoleErrors.slice(0, 10)))

  await browser.close()

  log('')
  log('=== VERDICT ===')
  // A real varied-content PNG compresses to meaningfully more than a
  // few hundred bytes (PNG/DEFLATE crushes uniform data extremely
  // well) -- a real, direct, computable signal, not a guess, and
  // doesn't depend on readPixels/preserveDrawingBuffer working
  // correctly the way the grid sample does.
  const screenshotLooksReal = (screenshotBytes ?? 0) > 2000
  if (hadError) {
    log('REAL ERROR STATE, not a crash -- but the actual 3D render was NOT confirmed this run.')
    log('Report the exact error text honestly, do not treat this as a pass.')
  } else if (canvasCount > 0 && screenshotLooksReal && matchupFound && indexFound && pageErrors.length === 0) {
    log('CONFIRMED: real Three.js loaded from esm.sh, a real WebGL render produced a real, non-trivial')
    log('screenshot (' + screenshotBytes + ' bytes, ' + JSON.stringify(pixelVariance) + '), real matchup/index data displayed, zero page errors.')
  } else {
    log('INCONCLUSIVE OR FAILED: canvas present but render could not be fully confirmed -- report exactly what was observed.')
    log('screenshotLooksReal=' + screenshotLooksReal + ' matchupFound=' + matchupFound + ' indexFound=' + indexFound)
  }
}

main().catch(e => { log('FAILED: ' + String(e?.stack ?? e)); process.exit(1) })
