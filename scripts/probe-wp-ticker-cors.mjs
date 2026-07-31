// Live WP Ticker (Proposal #2) pre-build check: does statsapi.mlb.com
// (the confirmed real source for live scoreDiff/periodProgress, per
// the WP Estimator Validation Lab's Task 1) allow a DIRECT browser
// fetch, or only server-to-server? deskStore's real relay data has no
// inning/period field today (DeskCard's own comment: "the real
// system's CRUNCH/CLOSE_LATE tiers depend on ESPN's live period + game
// clock via findESPNScore(), which deskStore doesn't expose"), so a
// live ticker needs SOME real source for period/inning -- this checks
// whether fetching statsapi.mlb.com directly from a browser is even
// possible (CORS) before assuming it, the same way WeatherPoll's
// "CORS-open" claim about Open-Meteo was a checked fact, not assumed.
//
// A server-side fetch never enforces CORS itself -- what matters is
// whether the RESPONSE carries Access-Control-Allow-Origin for a
// cross-origin request, which is what a real browser would check.

const UA = 'field-playground-probe/1.0 (github.com/jeffunglesbee-create/field-playground; research)'
const TEST_ORIGIN = 'https://example.com'

async function check(label, url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Origin: TEST_ORIGIN } })
    const acao = res.headers.get('access-control-allow-origin')
    console.log(label + ': HTTP ' + res.status + '  Access-Control-Allow-Origin=' + (acao ?? '(absent)'))
    console.log('  -> browser fetch from an arbitrary origin would be: ' + (acao === '*' || acao === TEST_ORIGIN ? 'ALLOWED' : 'BLOCKED (no matching ACAO header)'))
  } catch (e) {
    console.log(label + ': fetch failed: ' + String(e).slice(0, 150))
  }
}

async function main() {
  console.log('probe_at: ' + new Date().toISOString())
  await check('statsapi.mlb.com live feed', 'https://statsapi.mlb.com/api/v1.1/game/823440/feed/live')
  await check('statsapi.mlb.com schedule', 'https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-04-01')
  await check('baseballsavant.mlb.com gf', 'https://baseballsavant.mlb.com/gf?game_pk=823440')
}

main()
