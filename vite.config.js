import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

function mockRelay() {
  let contextRequestCount = 0
  let briefCycle = 0
  // /journalism/brief's real response shape -- {brief, generatedAt,
  // contextHash, gameCount, cycleId, proseScore, clicheCount} --
  // reconfirmed live via a direct probe 2026-07-27 (see relay.js's own
  // comment on the journalismBrief resource). briefTexts[0] below is the
  // real prose from that exact probe, not invented; briefTexts[1] is
  // anchored to this repo's own mock slate the same way DeskCard's other
  // mocks are.
  const briefTexts = [
    'Jackson Koivun claimed the 3M Open title at -25 through 18 holes, finishing three strokes ahead of Scottie Scheffler’s -22 effort. Hideki Matsuyama, Brian Harman, and Denny McCarthy tied for third at -20 through 18 holes.\n\nTropicana Field hosted a 1-0 Rays win over the Guardians as Drew Rasmussen outpitched Parker Messick.',
    'Houston brings José Urquidy against Texas in a critical divisional matchup — Rangers hold a 2.5-game lead. NY Mets have dropped four straight heading into Philly. WNBA Friday: Phoenix at Seattle in a potential playoff preview, Indiana at Minnesota with the Fever riding three straight wins.',
  ]

  // Real captured response from a direct probe of /quality/report,
  // 2026-07-27 -- not synthesized, same convention as briefTexts above.
  const qualityReportMock = {"ok":true,"days":7,"since":"2026-07-20","summary":[{"brief_type":"game_recap","sport":"PGA TOUR","total":1,"scored":1,"avg_score":125,"min_score":125,"max_score":125,"below_240":1,"above_240":0},{"brief_type":"game_recap","sport":"PGA Tour","total":1,"scored":1,"avg_score":125,"min_score":125,"max_score":125,"below_240":1,"above_240":0},{"brief_type":"pre_game","sport":"pga tour","total":1,"scored":1,"avg_score":125,"min_score":125,"max_score":125,"below_240":1,"above_240":0},{"brief_type":"slate","sport":null,"total":13,"scored":13,"avg_score":128.5,"min_score":108,"max_score":141,"below_240":13,"above_240":0},{"brief_type":"night_owl","sport":"Baseball (MLB)","total":15,"scored":15,"avg_score":136,"min_score":118,"max_score":148,"below_240":15,"above_240":0},{"brief_type":"mlb_game","sport":"MLB","total":64,"scored":64,"avg_score":136.4,"min_score":99,"max_score":179,"below_240":64,"above_240":0},{"brief_type":"night_owl","sport":"CFL – 2026 Season · Week 7","total":1,"scored":1,"avg_score":141,"min_score":141,"max_score":141,"below_240":1,"above_240":0},{"brief_type":"night_owl","sport":"FIFA World Cup","total":1,"scored":1,"avg_score":142,"min_score":142,"max_score":142,"below_240":1,"above_240":0},{"brief_type":"night_owl","sport":"Australian Football (AFL)","total":1,"scored":1,"avg_score":145,"min_score":145,"max_score":145,"below_240":1,"above_240":0},{"brief_type":"epl_match","sport":"EPL","total":9,"scored":9,"avg_score":146,"min_score":121,"max_score":185,"below_240":9,"above_240":0},{"brief_type":"narrative_context","sport":"MLB","total":4,"scored":4,"avg_score":146.3,"min_score":139,"max_score":154,"below_240":4,"above_240":0},{"brief_type":"pre_game","sport":"mlb","total":12,"scored":12,"avg_score":157.7,"min_score":134,"max_score":178,"below_240":12,"above_240":0},{"brief_type":"pre_game","sport":"mls","total":30,"scored":26,"avg_score":164,"min_score":136,"max_score":193,"below_240":26,"above_240":0},{"brief_type":"game_recap","sport":"MLB","total":97,"scored":97,"avg_score":165,"min_score":124,"max_score":205,"below_240":97,"above_240":0},{"brief_type":"pre_game","sport":"wnba","total":1,"scored":1,"avg_score":166,"min_score":166,"max_score":166,"below_240":1,"above_240":0},{"brief_type":"game_recap","sport":"MLS","total":30,"scored":30,"avg_score":166.3,"min_score":145,"max_score":193,"below_240":30,"above_240":0},{"brief_type":"game_recap","sport":"FIFA World Cup","total":20,"scored":20,"avg_score":169.9,"min_score":143,"max_score":184,"below_240":20,"above_240":0},{"brief_type":"game_recap","sport":"WNBA","total":11,"scored":11,"avg_score":170.7,"min_score":160,"max_score":196,"below_240":11,"above_240":0}],"alerts":[{"brief_type":"slate","sport":"all","alert":"avg_below_calibrated_p25","threshold":136,"threshold_source":"brief_type_p25(n=63)","avg_score":128.5,"failure_pct":100},{"brief_type":"night_owl","sport":"Baseball (MLB)","alert":"avg_below_calibrated_p25","threshold":137,"threshold_source":"brief_type_p25(n=236)","avg_score":136,"failure_pct":100},{"brief_type":"mlb_game","sport":"MLB","alert":"avg_below_calibrated_p25","threshold":147,"threshold_source":"brief_type_p25(n=359)","avg_score":136.4,"failure_pct":100},{"brief_type":"epl_match","sport":"EPL","alert":"high_failure_rate","threshold":92,"threshold_source":"brief_type_p25(n=21)","avg_score":146,"failure_pct":100},{"brief_type":"pre_game","sport":"mlb","alert":"high_failure_rate","threshold":155,"threshold_source":"brief_type_p25(n=46)","avg_score":157.7,"failure_pct":100},{"brief_type":"pre_game","sport":"mls","alert":"high_failure_rate","threshold":155,"threshold_source":"brief_type_p25(n=46)","avg_score":164,"failure_pct":100},{"brief_type":"game_recap","sport":"MLB","alert":"avg_below_calibrated_p25","threshold":170,"threshold_source":"brief_type_p25(n=720)","avg_score":165,"failure_pct":100},{"brief_type":"game_recap","sport":"MLS","alert":"avg_below_calibrated_p25","threshold":170,"threshold_source":"brief_type_p25(n=720)","avg_score":166.3,"failure_pct":100},{"brief_type":"game_recap","sport":"FIFA World Cup","alert":"avg_below_calibrated_p25","threshold":170,"threshold_source":"brief_type_p25(n=720)","avg_score":169.9,"failure_pct":100},{"brief_type":"game_recap","sport":"WNBA","alert":"high_failure_rate","threshold":170,"threshold_source":"brief_type_p25(n=720)","avg_score":170.7,"failure_pct":100}],"alert_count":10,"unscored_types":[],"unscored_count":0,"brief_type_calibration":{"compound":{"p25":175,"p50":178,"p75":189,"count":5},"epl_match":{"p25":92,"p50":132,"p75":149,"count":21},"game_brief":{"p25":171,"p50":188,"p75":210,"count":16},"game_recap":{"p25":170,"p50":204,"p75":223,"count":720},"mlb_game":{"p25":147,"p50":182,"p75":212,"count":359},"narrative_context":{"p25":204,"p50":215,"p75":228,"count":115},"night_owl":{"p25":137,"p50":149,"p75":167,"count":236},"pre_game":{"p25":155,"p50":162,"p75":171,"count":46},"slate":{"p25":136,"p50":230,"p75":254,"count":63},"wc_matchup":{"p25":103,"p50":124,"p75":131,"count":10}}}

  const newspaper = (date) => ({
    ok: true,
    date,
    recap_date: '2026-07-23',
    generated_at: `${date}T06:00:00Z`,
    morning_report: 'A full Thursday slate closed with Portland holding on at Seattle — a Cascadia rivalry match that delivered late, keeping the Western Conference standings compressed heading into the weekend. The WNBA double-header produced a finish worth the late watch; Las Vegas’ road win moved them into clearer seeding position. Tonight’s MLS card carries real weight in both conferences.',
    // Real field, distinct from morning_report -- forward-looking framing
    // for the midday/evening timeMode buckets (see AmbientPanel's
    // reportText memo). Anchored to this repo's own mock slate, not
    // invented team names.
    preview: 'Houston brings its bullpen depth into Arlington for the finale against Texas, while Philadelphia looks to bounce back at home against a Mets club still finding its footing. Both MLS sides carry real conference weight into tonight’s midweek card.',
    late: 'A full slate wraps with Portland holding on late in Seattle and the WNBA doubleheader delivering a finish worth the wait — Las Vegas’ road win moved them into clearer seeding position.',
    pick: {
      type: 'go',
      score: 3.4,
      reason: 'top game scored 3.4 — clears the 3.0 watch-bar',
      // Real field, currently unsurfaced anywhere in this repo before
      // JournalismBrief's rebuild (2026-07-26) -- the editorial verdict
      // line, distinct from the ranked list itself.
      brief: 'Rivalry night carries the slate — Seattle–Portland is the one worth clearing your evening for.',
      ranked: [
        { game_id: '2026-07-23-mls-por-sea', sport: 'MLS', home: 'Seattle Sounders', away: 'Portland Timbers', score: '2–1', tier: 'A', reasons: ['rivalry', 'prime time', 'late winner'] },
        { game_id: '2026-07-23-wnba-las-chi', sport: 'WNBA', home: 'Chicago Sky', away: 'Las Vegas Aces', score: '88–79', tier: 'B', reasons: ['postseason/elimination', 'road favorite'] },
        { game_id: '2026-07-23-mls-atl-col', sport: 'MLS', home: 'Columbus Crew', away: 'Atlanta United', score: '1–1', tier: 'C', reasons: ['home form'] },
      ],
    },
    // Real field, same shape confirmed via a live probe of
    // /analytics/newspaper/{date} on 2026-07-26 (see relay.js's own
    // comment on the journalismBrief resource).
    night_stars: {
      stars: 4,
      starScore: 7.8,
      dramaGames: 2,
      closeGames: 3,
      extras: 1,
      walkoffs: 1,
      totalGames: 8,
      degraded: false,
    },
  })

  // Live-reconciliation CI check needs data that actually changes between
  // polls, not the same static snapshot every time -- this is the only
  // thing that varies. Request 1: hou-tex is pregame (null-null). Request
  // 2+: it goes live (1-0), matching what the experiment doc actually set
  // out to test (a pre-to-live transition). Every other game stays
  // byte-identical across all requests on purpose -- that's the control
  // group for "did unrelated rows avoid remounting."
  const context = (date) => {
    contextRequestCount++
    const houTexLive = contextRequestCount >= 2
    // Same variation strategy as houTexLive: nym-phi's local_note changes
    // after the first poll, so LocalNoteLayer's "override goes stale when
    // the relay's own value moves" behavior is actually exercisable in dev,
    // not just asserted in a comment.
    const nymPhiNote = contextRequestCount >= 2 ? 'Editor updated: doubleheader nightcap' : 'Getaway day, bullpen game'
    // Real shape confirmed live (see OddsRow's own comment in DeskCard):
    // string-encoded JSON with a few internal-only fields (_oddsProof)
    // that the UI is expected to ignore, not surface.
    const bosNyyOpeningOdds = JSON.stringify({ source: 'draftkings', captured_at: `${date}T10:00:42.624Z`, _oddsProof: { adapterId: 'odds-api', sourceId: 'odds-api-the-odds-api' }, moneyline: { home: -149, away: 123 }, spread: { home: -1.5, away: 1.5 }, total: { over: 9, under: 9 } })
    const bosNyyClosingOdds = JSON.stringify({ source: 'draftkings', captured_at: `${date}T10:01:05.701Z`, _oddsProof: { adapterId: 'odds-api', sourceId: 'odds-api-the-odds-api' }, moneyline: { home: -149, away: 123 }, spread: { home: -1.5, away: 1.5 }, total: { over: 9, under: 9 } })
    return {
      ok: true,
      date,
      games: {
        regular: [
          { id: `${date}-mlb-nym-phi`, sport: 'MLB', home: 'Philadelphia Phillies', away: 'NY Mets',        home_score: 4,    away_score: 2,    venue: 'Citizens Bank Park',        finalized_at: `${date}T02:15:00Z`, went_to_ot: null, local_note: nymPhiNote },
          { id: `${date}-mlb-bos-nyy`, sport: 'MLB', home: 'NY Yankees',            away: 'Boston Red Sox', home_score: 3,    away_score: 2,    venue: 'Yankee Stadium',            finalized_at: null,                went_to_ot: null, opening_odds: bosNyyOpeningOdds, closing_odds: bosNyyClosingOdds },
          { id: `${date}-mlb-hou-tex`, sport: 'MLB', home: 'Texas Rangers',          away: 'Houston Astros', home_score: houTexLive ? 1 : null, away_score: houTexLive ? 0 : null, venue: 'Globe Life Field',          finalized_at: null,                went_to_ot: null },
          { id: `${date}-mls-col-slc`, sport: 'MLS', home: 'Real Salt Lake',         away: 'Colorado Rapids',home_score: null, away_score: null, venue: 'America First Field',       finalized_at: null,                went_to_ot: null },
          { id: `${date}-mls-cfm-nyr`, sport: 'MLS', home: 'NY Red Bulls',           away: 'CF Montr\xe9al', home_score: null, away_score: null, venue: 'Red Bull Arena',            finalized_at: null,                went_to_ot: null },
          { id: `${date}-mls-sj-col`,  sport: 'MLS', home: 'Colorado Rapids',        away: 'San Jose Earthquakes', home_score: 0, away_score: 1, venue: "Dick's Sporting Goods Park", finalized_at: `${date}T01:45:00Z`, went_to_ot: null },
          { id: `${date}-wnba-sea-phx`,sport: 'WNBA',home: 'Phoenix Mercury',        away: 'Seattle Storm',  home_score: 68,   away_score: 71,   venue: 'Footprint Center',          finalized_at: `${date}T02:30:00Z`, went_to_ot: true  },
          { id: `${date}-wnba-ind-min`,sport: 'WNBA',home: 'Minnesota Lynx',         away: 'Indiana Fever',  home_score: null, away_score: null, venue: 'Target Center',             finalized_at: null,                went_to_ot: null },
        ],
        postseason: [],
      },
      briefs: [], series: [], standings: [],
    }
  }

  // Standings mocks -- none of these three existed before Stats needed
  // them, and neither did Seasons ever get one: RELAY_BASE is '' in dev,
  // so /wc/standings, /mlb-stats/standings, and /mls/stats/.../standings
  // all 404'd against nothing but Vite itself, meaning Seasons has always
  // rendered its error fallback in local dev, never real data. Field
  // names below match exactly what Seasons/index.jsx already parses
  // (MLB_DIVISION_NAMES ids, mlbTeamState's divisionRank/gamesBack/
  // wildCardGamesBack/streak.streakCode, MLS_EASTERN/MLS_WESTERN's exact
  // team-name strings, WcSection's won/drawn/lost/gd/points) -- not new
  // shapes invented for this fixture, the same ones already relied upon.
  function mlbTeam(name, divisionRank, gamesBack, wildCardGamesBack, streakCode) {
    return { team: { name }, divisionRank: String(divisionRank), gamesBack, wildCardGamesBack, streak: { streakCode } }
  }
  const mlbStandingsMock = {
    records: [
      { division: { id: 201 }, teamRecords: [mlbTeam('NY Yankees', 1, '-', '-', 'W6'), mlbTeam('Boston Red Sox', 2, '3.5', '1.0', 'L1'), mlbTeam('Baltimore Orioles', 5, '14.0', '11.5', 'L2')] },
      { division: { id: 202 }, teamRecords: [mlbTeam('Cleveland Guardians', 1, '-', '-', 'W2'), mlbTeam('Minnesota Twins', 2, '2.0', '0.5', 'L1'), mlbTeam('Kansas City Royals', 4, '9.0', '6.5', 'W1')] },
      { division: { id: 200 }, teamRecords: [mlbTeam('Houston Astros', 1, '-', '-', 'W8'), mlbTeam('Seattle Mariners', 2, '4.0', '2.0', 'W3'), mlbTeam('Texas Rangers', 3, '6.5', '3.0', 'L2'), mlbTeam('Athletics', 5, '16.5', '14.0', 'L5')] },
      { division: { id: 204 }, teamRecords: [mlbTeam('Philadelphia Phillies', 1, '-', '-', 'W4'), mlbTeam('NY Mets', 2, '1.5', '-', 'W1'), mlbTeam('Miami Marlins', 5, '19.0', '16.5', 'L3')] },
      { division: { id: 205 }, teamRecords: [mlbTeam('Milwaukee Brewers', 1, '-', '-', 'L2'), mlbTeam('Chicago Cubs', 2, '2.5', '1.0', 'W2'), mlbTeam('Cincinnati Reds', 5, '13.0', '10.5', 'L7')] },
      { division: { id: 203 }, teamRecords: [mlbTeam('Los Angeles Dodgers', 1, '-', '-', 'W3'), mlbTeam('San Diego Padres', 2, '3.0', '0.5', 'W1'), mlbTeam('San Francisco Giants', 4, '8.0', '5.5', 'L1')] },
    ],
  }

  function mlsTeam(team, wins, draws, losses, goals_difference, points) {
    return { team, wins, draws, losses, goals_difference, points }
  }
  // Team names include the actual MLS teams playing in context()'s mock
  // slate (Real Salt Lake, Colorado Rapids, San Jose Earthquakes, CF
  // Montréal) so a cross-resource join between today's games and
  // standings has real matches to find in dev, not just Seasons' own
  // (unrelated) per-conference view of this same data. 'NY Red Bulls'
  // deliberately has no entry here -- context()'s mock uses that
  // shorthand while Seasons' own MLS_EASTERN set uses the real API's
  // 'Red Bull New York', a pre-existing mismatch between two mocks built
  // in different sessions; left as an honest gap rather than forced to
  // match, since a real join should degrade gracefully on a miss.
  const mlsStandingsMock = {
    tables: [{
      entries: [
        mlsTeam('Inter Miami CF', 14, 5, 3, 22, 47),
        mlsTeam('Los Angeles Football Club', 13, 7, 2, 19, 46),
        mlsTeam('Real Salt Lake', 11, 6, 5, 8, 39),
        mlsTeam('CF Montréal', 10, 7, 5, 6, 37),
        mlsTeam('San Jose Earthquakes', 9, 5, 8, 2, 32),
        mlsTeam('Colorado Rapids', 6, 7, 9, -9, 25),
        mlsTeam('D.C. United', 5, 4, 13, -18, 19),
      ],
    }],
  }

  function wcTeam(team, won, drawn, lost, gd, points) {
    return { team, won, drawn, lost, gd, points }
  }
  const wcStandingsMock = {
    groups: {
      A: [wcTeam('Qatar', 3, 0, 0, 7, 9), wcTeam('Ecuador', 1, 1, 1, 1, 4), wcTeam('Senegal', 1, 0, 2, -2, 3), wcTeam('Netherlands', 0, 1, 2, -6, 1)],
      B: [wcTeam('England', 2, 1, 0, 4, 7), wcTeam('USA', 1, 2, 0, 2, 5), wcTeam('Iran', 1, 0, 2, -3, 3), wcTeam('Wales', 0, 1, 2, -3, 1)],
      C: [wcTeam('Argentina', 2, 0, 1, 3, 6), wcTeam('Poland', 1, 2, 0, 0, 5), wcTeam('Mexico', 1, 1, 1, -1, 4), wcTeam('Saudi Arabia', 1, 0, 2, -2, 3)],
    },
  }

  return {
    name: 'mock-relay',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = req.url.match(/^\/analytics\/newspaper\/(.+)$/)
        if (m) {
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify(newspaper(m[1])))
        }
        const c = req.url.match(/^\/context\/date\/(.+)$/)
        if (c) {
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify(context(c[1])))
        }
        if (req.url === '/wc/standings') {
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify(wcStandingsMock))
        }
        if (req.url?.startsWith('/mlb-stats/standings')) {
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify(mlbStandingsMock))
        }
        if (req.url?.startsWith('/mls/stats/competitions/')) {
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify(mlsStandingsMock))
        }
        if (req.url === '/quality/report') {
          // Real captured response from a direct probe of /quality/report,
          // 2026-07-27 -- not synthesized. Full shape: {ok, days, since,
          // summary[] (one row per brief_type+sport actually generated),
          // alerts[] (rows currently below their calibrated p25 or flagged
          // high_failure_rate), alert_count, unscored_types[],
          // unscored_count, brief_type_calibration (p25/p50/p75 per type)}.
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify(qualityReportMock))
        }
        if (req.url === '/journalism/brief') {
          // Rotates every 3 requests to simulate the brief regenerating mid-session.
          briefCycle = (briefCycle + 1) % 6
          const idx = briefCycle < 3 ? 0 : 1
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify({
            brief: briefTexts[idx],
            generatedAt: Date.now() - (briefCycle % 3) * 120000,
            contextHash: idx === 0 ? '-7e3876ad' : '-1a9c4f2b',
            gameCount: 8,
            cycleId: idx === 0 ? 'mock-cycle-001' : 'mock-cycle-002',
            proseScore: idx === 0 ? 98 : 112,
            clicheCount: idx === 0 ? 1 : 0,
          }))
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [solid(), mockRelay()],
})
