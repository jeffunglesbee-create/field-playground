import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

function mockRelay() {
  let contextRequestCount = 0
  let briefCycle = 0
  const briefTexts = [
    'Texas Rangers lead the AL West race and host Houston tonight with Casey Mize on the mound. The Mets visit Philadelphia in a battle of fading wild-card hopefuls. MLS midweek action carries real conference weight: Real Salt Lake host Colorado in a top-four clash, while NY Red Bulls look to extend their unbeaten home run against CF Montréal.',
    'Houston brings José Urquidy against Texas in a critical divisional matchup — Rangers hold a 2.5-game lead. NY Mets have dropped four straight heading into Philly. WNBA Friday: Phoenix at Seattle in a potential playoff preview, Indiana at Minnesota with the Fever riding three straight wins.',
  ]

  const newspaper = (date) => ({
    ok: true,
    date,
    recap_date: '2026-07-23',
    generated_at: `${date}T06:00:00Z`,
    morning_report: 'A full Thursday slate closed with Portland holding on at Seattle — a Cascadia rivalry match that delivered late, keeping the Western Conference standings compressed heading into the weekend. The WNBA double-header produced a finish worth the late watch; Las Vegas’ road win moved them into clearer seeding position. Tonight’s MLS card carries real weight in both conferences.',
    pick: {
      ranked: [
        { game_id: '2026-07-23-mls-por-sea', sport: 'MLS', home: 'Seattle Sounders', away: 'Portland Timbers', score: '2–1', tier: 'A', reasons: ['rivalry', 'prime time', 'late winner'] },
        { game_id: '2026-07-23-wnba-las-chi', sport: 'WNBA', home: 'Chicago Sky', away: 'Las Vegas Aces', score: '88–79', tier: 'B', reasons: ['postseason/elimination', 'road favorite'] },
        { game_id: '2026-07-23-mls-atl-col', sport: 'MLS', home: 'Columbus Crew', away: 'Atlanta United', score: '1–1', tier: 'C', reasons: ['home form'] },
      ],
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
      { division: { id: 201 }, teamRecords: [mlbTeam('New York Yankees', 1, '-', '-', 'W6'), mlbTeam('Boston Red Sox', 2, '3.5', '1.0', 'L1'), mlbTeam('Baltimore Orioles', 5, '14.0', '11.5', 'L2')] },
      { division: { id: 202 }, teamRecords: [mlbTeam('Cleveland Guardians', 1, '-', '-', 'W2'), mlbTeam('Minnesota Twins', 2, '2.0', '0.5', 'L1'), mlbTeam('Kansas City Royals', 4, '9.0', '6.5', 'W1')] },
      { division: { id: 200 }, teamRecords: [mlbTeam('Houston Astros', 1, '-', '-', 'W8'), mlbTeam('Seattle Mariners', 2, '4.0', '2.0', 'W3'), mlbTeam('Athletics', 5, '16.5', '14.0', 'L5')] },
      { division: { id: 204 }, teamRecords: [mlbTeam('Philadelphia Phillies', 1, '-', '-', 'W4'), mlbTeam('New York Mets', 2, '1.5', '-', 'W1'), mlbTeam('Miami Marlins', 5, '19.0', '16.5', 'L3')] },
      { division: { id: 205 }, teamRecords: [mlbTeam('Milwaukee Brewers', 1, '-', '-', 'L2'), mlbTeam('Chicago Cubs', 2, '2.5', '1.0', 'W2'), mlbTeam('Cincinnati Reds', 5, '13.0', '10.5', 'L7')] },
      { division: { id: 203 }, teamRecords: [mlbTeam('Los Angeles Dodgers', 1, '-', '-', 'W3'), mlbTeam('San Diego Padres', 2, '3.0', '0.5', 'W1'), mlbTeam('San Francisco Giants', 4, '8.0', '5.5', 'L1')] },
    ],
  }

  function mlsTeam(team, wins, draws, losses, goals_difference, points) {
    return { team, wins, draws, losses, goals_difference, points }
  }
  const mlsStandingsMock = {
    tables: [{
      entries: [
        mlsTeam('Inter Miami CF', 14, 5, 3, 22, 47),
        mlsTeam('Columbus Crew', 11, 6, 5, 9, 39),
        mlsTeam('D.C. United', 5, 4, 13, -18, 19),
        mlsTeam('Los Angeles Football Club', 13, 7, 2, 19, 46),
        mlsTeam('Seattle Sounders FC', 10, 8, 4, 7, 38),
        mlsTeam('St. Louis CITY SC', 4, 6, 12, -15, 18),
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
