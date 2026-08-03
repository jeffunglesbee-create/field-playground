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

// Grid-sample the real WebGL framebuffer via readPixels (not a 1D
// stride, which can bias toward one region). Shared by the initial
// render check and the tilt check below, which needs a before/after
// comparison of the SAME real technique.
async function gridSample(page) {
  return page.evaluate(() => {
    const canvasEl = document.querySelector('canvas')
    if (!canvasEl) return null
    const gl = canvasEl.getContext('webgl2') || canvasEl.getContext('webgl')
    if (!gl) return null
    const w = canvasEl.width, h = canvasEl.height
    if (!w || !h) return { w, h, distinctColorsSampled: 0 }
    const pixels = new Uint8Array(w * h * 4)
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    const grid = []
    const gridX = 40, gridY = 20
    for (let gy = 0; gy < gridY; gy++) {
      for (let gx = 0; gx < gridX; gx++) {
        const x = Math.floor((gx / gridX) * w)
        const y = Math.floor((gy / gridY) * h)
        const idx = (y * w + x) * 4
        grid.push(pixels[idx] + ',' + pixels[idx + 1] + ',' + pixels[idx + 2])
      }
    }
    return { w, h, distinctColorsSampled: new Set(grid).size, grid }
  })
}

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

  // Instrument the REAL, unmodified AudioContext/createPanner -- not a
  // mock replacing them, a wrapper that still calls straight through
  // to the browser's real implementation and just records what the
  // app's own code (unmodified) actually does with it. This runner has
  // no real speakers, so "sound came out" can never be verified here --
  // but "the app really constructed a real AudioContext, a real HRTF
  // PannerNode, and really moves it every frame" can be, and wasn't
  // checked by any prior run.
  await page.addInitScript(() => {
    window.__terrainFlightAudioProbe = { audioContextCreated: false, pannerCreated: false, pannerRef: null }
    const OrigAC = window.AudioContext || window.webkitAudioContext
    if (!OrigAC) return
    function PatchedAC(...args) {
      window.__terrainFlightAudioProbe.audioContextCreated = true
      const inst = new OrigAC(...args)
      const origCreatePanner = inst.createPanner.bind(inst)
      inst.createPanner = function (...a) {
        const panner = origCreatePanner(...a)
        window.__terrainFlightAudioProbe.pannerCreated = true
        window.__terrainFlightAudioProbe.pannerRef = panner
        return panner
      }
      return inst
    }
    PatchedAC.prototype = OrigAC.prototype
    window.AudioContext = PatchedAC
    window.webkitAudioContext = PatchedAC
  })

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
  let tiltChecked = false
  let tiltFrameChanged = null
  let audioProbe = null
  let audioPositionMoved = null
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
    pixelVariance = await gridSample(page)
    log('WebGL canvas pixel readback (2D grid sample): ' + JSON.stringify({ w: pixelVariance?.w, h: pixelVariance?.h, distinctColorsSampled: pixelVariance?.distinctColorsSampled }))

    const fullBodyText = await page.locator('body').innerText()
    // page.locator('body').innerText() reflects rendered text, which
    // includes CSS text-transform -- the real header label is
    // literally "Terrain Flight" in source
    // (TerrainFlight/index.jsx), but .label has a real, legitimate
    // `text-transform: uppercase` (TerrainFlight.module.css), so the
    // rendered text is "TERRAIN FLIGHT". A case-sensitive check here
    // was a probe-script bug, not an app bug -- confirmed directly via
    // the raw diagnostic line logged below on a prior run.
    const atSignFound = / @ /.test(fullBodyText)
    const titleFound = /terrain flight/i.test(fullBodyText)
    matchupFound = atSignFound && titleFound
    indexFound = /index \d+\/\d+/.test(fullBodyText)
    log('real matchup text (" @ ") found: ' + matchupFound + ' (atSign=' + atSignFound + ' title=' + titleFound + ')')
    log('real "index N/M" text found: ' + indexFound)
    if (indexFound) {
      const idxLine = fullBodyText.split('\n').find(l => /index \d+\/\d+/.test(l))
      log('matchup-line raw text: ' + JSON.stringify(idxLine))
    }

    // --- Tilt check: real onDeviceOrientation handler, synthetic input ---
    // This runner has no real accelerometer -- that gap can't be closed
    // here. What CAN be checked for real: does the app's real,
    // unmodified 'deviceorientation' listener (wired up by clicking the
    // real "Enable tilt controls" button, exercising the real
    // enableTilt() code path) actually change the real camera direction
    // and produce a genuinely different rendered frame when fed a real
    // (synthetic) DeviceOrientationEvent -- as opposed to the handler
    // being dead code that never gets called or never affects the scene.
    const tiltBtn = page.getByText('Enable tilt controls', { exact: false })
    if (await tiltBtn.count() > 0) {
      const before = await gridSample(page)
      await tiltBtn.first().click()
      await page.evaluate(() => {
        window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 130, gamma: 70, absolute: false }))
      })
      await page.waitForTimeout(300) // let a few animation frames pick up the new yaw/pitch
      const after = await gridSample(page)
      tiltChecked = true
      tiltFrameChanged = !!before && !!after && JSON.stringify(before.grid) !== JSON.stringify(after.grid)
      log('tilt: "Enable tilt controls" clicked, synthetic deviceorientation dispatched, rendered frame changed: ' + tiltFrameChanged)
    } else {
      log('tilt: "Enable tilt controls" button not present in this environment (tiltAvailable() was false) -- not checked')
    }

    // --- Audio check: real AudioContext/PannerNode, observed not mocked ---
    // Same real ceiling as tilt: no speakers on this runner, so "sound
    // played" can never be confirmed here. What's checked for real: did
    // the app's own code really construct a real AudioContext and a
    // real HRTF PannerNode (via the wrapper installed above, which
    // delegates straight through to the browser's real implementation),
    // configured the way the source says (HRTF/inverse), and does its
    // real per-frame position update loop actually move it.
    const audioBefore = await page.evaluate(() => {
      const p = window.__terrainFlightAudioProbe
      if (!p?.pannerRef) return null
      return { x: p.pannerRef.positionX.value, y: p.pannerRef.positionY.value, z: p.pannerRef.positionZ.value }
    })
    await page.waitForTimeout(500)
    audioProbe = await page.evaluate(() => {
      const p = window.__terrainFlightAudioProbe
      if (!p) return null
      return {
        audioContextCreated: p.audioContextCreated,
        pannerCreated: p.pannerCreated,
        panningModel: p.pannerRef?.panningModel ?? null,
        distanceModel: p.pannerRef?.distanceModel ?? null,
        refDistance: p.pannerRef?.refDistance ?? null,
        position: p.pannerRef ? { x: p.pannerRef.positionX.value, y: p.pannerRef.positionY.value, z: p.pannerRef.positionZ.value } : null,
      }
    })
    audioPositionMoved = !!audioBefore && !!audioProbe?.position &&
      (audioBefore.x !== audioProbe.position.x || audioBefore.y !== audioProbe.position.y || audioBefore.z !== audioProbe.position.z)
    log('audio: ' + JSON.stringify(audioProbe) + ' positionMoved=' + audioPositionMoved)
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
  const renderConfirmed = !hadError && canvasCount > 0 && screenshotLooksReal && matchupFound && indexFound && pageErrors.length === 0
  if (hadError) {
    log('RENDER: REAL ERROR STATE, not a crash -- but the actual 3D render was NOT confirmed this run.')
    log('Report the exact error text honestly, do not treat this as a pass.')
  } else if (renderConfirmed) {
    log('RENDER: CONFIRMED -- real Three.js loaded from esm.sh, a real WebGL render produced a real, non-trivial')
    log('screenshot (' + screenshotBytes + ' bytes, ' + JSON.stringify({ w: pixelVariance?.w, h: pixelVariance?.h, distinctColorsSampled: pixelVariance?.distinctColorsSampled }) + '), real matchup/index data displayed, zero page errors.')
  } else {
    log('RENDER: INCONCLUSIVE OR FAILED -- canvas present but render could not be fully confirmed -- report exactly what was observed.')
    log('screenshotLooksReal=' + screenshotLooksReal + ' matchupFound=' + matchupFound + ' indexFound=' + indexFound)
  }

  // Tilt and audio are only meaningful to judge once the render itself
  // is confirmed real -- no point trusting a camera-change or a panner
  // position update from a scene that was never proven real to begin
  // with.
  if (renderConfirmed) {
    if (!tiltChecked) {
      log('TILT: NOT CHECKED -- "Enable tilt controls" button was not present (tiltAvailable() was false in this environment).')
    } else if (tiltFrameChanged) {
      log('TILT: CONFIRMED -- the real onDeviceOrientation handler, fed a real (synthetic) DeviceOrientationEvent, changed the real camera direction and produced a genuinely different rendered frame.')
    } else {
      log('TILT: FAILED -- tilt was enabled and a deviceorientation event was dispatched, but the rendered frame did not change. Real bug, not a coverage gap.')
    }
    log('  (real accelerometer input, and iOS DeviceOrientationEvent.requestPermission(), remain unverifiable on this runner -- no physical device, Chromium does not implement that API.)')

    if (!audioProbe?.audioContextCreated) {
      log('AUDIO: NOT CONFIRMED -- no real AudioContext was observed being constructed (synthApi/audio setup may have failed and degraded honestly, or CDN synth load did not finish in this window).')
    } else if (audioProbe.pannerCreated && audioProbe.panningModel === 'HRTF' && audioProbe.distanceModel === 'inverse' && audioPositionMoved) {
      log('AUDIO: CONFIRMED -- a real AudioContext and a real HRTF/inverse-distance PannerNode were constructed by the app\'s own unmodified code, and its position genuinely moves every frame with the camera: ' + JSON.stringify(audioProbe.position))
    } else {
      log('AUDIO: INCONCLUSIVE -- AudioContext observed but panner config/movement did not fully match expectations. ' + JSON.stringify(audioProbe) + ' positionMoved=' + audioPositionMoved)
    }
    log('  (real speaker output can never be verified on a headless CI runner -- this confirms the real graph is wired and live, not that sound was audible.)')
  }
}

main().catch(e => { log('FAILED: ' + String(e?.stack ?? e)); process.exit(1) })
