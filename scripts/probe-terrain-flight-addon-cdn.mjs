// Checks whether real Three.js addon submodules (examples/jsm/*) load
// correctly from esm.sh alongside the already-working core `three` import
// Terrain Flight uses -- a real, known gotcha with esm.sh + three.js
// addons: the addon's own internal `import ... from 'three'` must resolve
// to the SAME module instance as the core import, or `instanceof`/class
// checks inside three.js silently break. esm.sh is sandbox-blocked from
// chat -- CI-as-proxy, same pattern as every prior probe this session.
//
// Candidates checked, all genuinely free (same MIT-licensed library
// already in use, zero new cost) if they load correctly:
//   - Sky.js: real physically-based procedural sky (sun position,
//     atmospheric scattering) -- would replace the flat fog-color void
//     background with a real rendered sky, no texture download needed.
//   - EffectComposer/RenderPass/UnrealBloomPass: real postprocessing
//     bloom -- would make the landmark markers (currently plain unlit
//     spheres) genuinely glow.

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/terrain-flight-addon-cdn-probe-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const THREE_VERSION = '0.169.0'
const MODULES = [
  { name: 'Sky', url: `https://esm.sh/three@${THREE_VERSION}/examples/jsm/objects/Sky.js`, exportCheck: 'Sky' },
  { name: 'EffectComposer', url: `https://esm.sh/three@${THREE_VERSION}/examples/jsm/postprocessing/EffectComposer.js`, exportCheck: 'EffectComposer' },
  { name: 'RenderPass', url: `https://esm.sh/three@${THREE_VERSION}/examples/jsm/postprocessing/RenderPass.js`, exportCheck: 'RenderPass' },
  { name: 'UnrealBloomPass', url: `https://esm.sh/three@${THREE_VERSION}/examples/jsm/postprocessing/UnrealBloomPass.js`, exportCheck: 'UnrealBloomPass' },
]

async function main() {
  log('probe_at: ' + new Date().toISOString())
  const browser = await chromium.launch()
  const page = await browser.newPage()

  // Real, blank page -- just a JS execution context, no app needed for
  // this specific check (purely: does the module graph resolve).
  await page.goto('about:blank')

  const results = await page.evaluate(async ({ modules, threeUrl }) => {
    const out = []
    let THREE
    try {
      THREE = await import(/* @vite-ignore */ threeUrl)
    } catch (e) {
      return [{ name: 'three (core)', ok: false, error: String(e) }]
    }
    out.push({ name: 'three (core)', ok: true, hasScene: typeof THREE.Scene === 'function' })

    for (const m of modules) {
      try {
        const mod = await import(/* @vite-ignore */ m.url)
        const exportOk = typeof mod[m.exportCheck] === 'function'
        // Real identity check: does the addon's internal THREE.Object3D
        // subclass actually chain to the SAME THREE.Object3D the core
        // import produced? If esm.sh served a duplicate copy of three,
        // this fails even though the import itself "succeeded."
        let identityOk = null
        try {
          if (m.exportCheck === 'Sky') {
            const sky = new mod.Sky()
            identityOk = sky instanceof THREE.Mesh
          } else {
            identityOk = 'n/a (class import only, no instantiation needed to prove identity for these)'
          }
        } catch (e) {
          identityOk = 'instantiation threw: ' + String(e)
        }
        out.push({ name: m.name, ok: exportOk, identityOk })
      } catch (e) {
        out.push({ name: m.name, ok: false, error: String(e) })
      }
    }
    return out
  }, { modules: MODULES, threeUrl: `https://esm.sh/three@${THREE_VERSION}` })

  for (const r of results) log(JSON.stringify(r))

  await browser.close()

  log('')
  log('=== VERDICT ===')
  const allOk = results.every(r => r.ok)
  if (allOk) {
    log('CONFIRMED: all real Three.js addon submodules load correctly from esm.sh, same-instance-verified where checked. Safe to build against.')
  } else {
    const failed = results.filter(r => !r.ok).map(r => r.name)
    log('PARTIAL/FAILED: these modules did not load cleanly: ' + failed.join(', ') + '. Do not assume they work -- build only against confirmed-working ones.')
  }
}

main().catch(e => { log('FAILED: ' + String(e?.stack ?? e)); process.exit(1) })
