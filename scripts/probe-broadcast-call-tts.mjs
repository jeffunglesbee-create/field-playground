// Verifies field-relay-nba's real /audio/tts route (Workers AI, Deepgram
// aura-2-en, deployed 2026-08-04) two ways: a direct fetch against the real
// relay (bypassing the app entirely -- confirms the endpoint itself works),
// and a real browser run of the built app hitting the SAME real relay,
// confirming the BroadcastCall component's cloud-voice wiring actually
// reaches a definitive state (cloud succeeded, or honestly fell back to
// browser voice with a real disclosed reason) -- not stuck loading forever.
//
// field-relay-nba.jeffunglesbee.workers.dev is sandbox-blocked from chat --
// CI-as-proxy, same pattern as every prior probe this session.

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, statSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/broadcast-call-tts-probe-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'
const BASE_URL = process.env.PREVIEW_URL || 'http://127.0.0.1:4173'

async function checkDirectEndpoint() {
  log('--- direct /audio/tts check ---')
  try {
    const res = await fetch(RELAY + '/audio/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Tonight\'s call: a real probe of the real Cloudflare voice.' }),
    })
    log('HTTP status: ' + res.status)
    log('Content-Type: ' + res.headers.get('content-type'))
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      log('error body: ' + body.slice(0, 300))
      return { ok: false }
    }
    const buf = await res.arrayBuffer()
    log('audio bytes: ' + buf.byteLength)
    const isAudio = (res.headers.get('content-type') || '').includes('audio')
    const looksReal = buf.byteLength > 1000 // real MP3 speech is never this small
    log('content-type is audio: ' + isAudio + ', byte size looks real: ' + looksReal)
    return { ok: isAudio && looksReal, bytes: buf.byteLength }
  } catch (e) {
    log('direct fetch threw: ' + String(e))
    return { ok: false }
  }
}

async function main() {
  log('probe_at: ' + new Date().toISOString())
  const direct = await checkDirectEndpoint()
  log('')

  log('--- real browser run against the built app ---')
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const pageErrors = []
  const consoleErrors = []
  page.on('pageerror', e => pageErrors.push(String(e.message)))
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  log('app loaded: ' + BASE_URL)

  await page.getByText('Lab', { exact: false }).first().click()
  log('clicked Lab tab')

  // The header renders immediately regardless of data state -- waiting on
  // it alone (as an earlier version of this probe did) checks for the
  // button before broadcastCallCandidates (a real async fetch, competing
  // with the rest of the app's concurrent page-load requests) has had a
  // chance to resolve. Wait for an actual data-dependent outcome instead:
  // the button itself, or the honest empty-sample message.
  await page.waitForFunction(() => {
    const t = document.body.innerText
    return t.includes('Call the game') || t.includes('No real archived game with a usable drama_arc')
  }, { timeout: 20000 }).catch(() => log('WARNING: neither the call button nor the empty-sample message appeared within 20s -- broadcastCallCandidates may still be pending'))

  const callBtn = page.getByText('Call the game', { exact: false })
  const hasBtn = await callBtn.count() > 0
  log('"Call the game" button present: ' + hasBtn)

  let voiceOutcome = 'not reached'
  if (hasBtn) {
    await callBtn.first().click()
    log('clicked "Call the game"')
    // Real network TTS generation takes a few real seconds -- wait for a
    // definitive state (cloud badge, fallback badge, or an error), not a
    // fixed short sleep.
    await page.waitForFunction(() => {
      const t = document.body.innerText
      return t.includes('Cloudflare AI voice') || t.includes('Browser voice') || t.includes('Speech synthesis failed')
    }, { timeout: 20000 }).catch(() => log('WARNING: no definitive voice-source state reached within 20s'))

    const bodyText = await page.locator('body').innerText()
    if (bodyText.includes('Cloudflare AI voice')) voiceOutcome = 'cloud'
    else if (bodyText.includes('Browser voice')) {
      const line = bodyText.split('\n').find(l => l.includes('Browser voice'))
      voiceOutcome = 'browser fallback: ' + JSON.stringify(line)
    } else if (bodyText.includes('Speech synthesis failed')) voiceOutcome = 'both engines failed'
  }
  log('voice outcome: ' + voiceOutcome)

  log('')
  log('page errors: ' + JSON.stringify(pageErrors))
  log('console errors: ' + JSON.stringify(consoleErrors.slice(0, 10)))

  await browser.close()

  log('')
  log('=== VERDICT ===')
  if (direct.ok && voiceOutcome === 'cloud' && pageErrors.length === 0) {
    log('CONFIRMED: real /audio/tts endpoint returns real audio (' + direct.bytes + ' bytes), and the real BroadcastCall component in a real browser successfully used the real Cloudflare voice end-to-end, zero page errors.')
  } else if (direct.ok && pageErrors.length === 0) {
    log('PARTIAL: the real /audio/tts endpoint works directly (' + direct.bytes + ' bytes), but the component run did not confirm the cloud path (' + voiceOutcome + '). Report exactly what was observed -- may be real network variance, not a code bug.')
  } else {
    log('FAILED OR INCONCLUSIVE: direct endpoint ok=' + direct.ok + ', voiceOutcome=' + voiceOutcome + ', pageErrors=' + pageErrors.length + '. Report exactly what was observed.')
  }
}

main().catch(e => { log('FAILED: ' + String(e?.stack ?? e)); process.exit(1) })
