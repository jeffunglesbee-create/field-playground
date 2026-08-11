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

  // Real captured response from a direct probe of
  // /journalism/brief/history?limit=20, 2026-07-27 -- not synthesized.
  // BriefReconcile (added by the parallel chat session directly to main)
  // reads this; it had no dev mock, so its fetch fell through to Vite's
  // index.html fallback and failed to parse as JSON in dev. Added while
  // verifying BriefArchive doesn't regress anything else in this tab.
  // Real captured response from a direct probe of /wc/projections,
  // 2026-07-27 -- not synthesized. Trimmed to the top 15 teams by pChamp
  // (the real response has ~44) and all 4 real bracketTraps entries;
  // bracketSlots/thirdPlaceRanking omitted since WcBracketOdds doesn't
  // read them -- same convention as DramaLeaderboard's downsampled
  // drama_arc, trading unused fields for a smaller mock file.
  const wcProjectionsMock = {"teams":[{"name":"Spain","fifaCode":"ESP","group":"H","fifaRank":2,"pR32":1,"pR16":0.509,"pQF":0.271,"pSF":0.148,"pFinal":0.077,"pChamp":0.042},{"name":"England","fifaCode":"ENG","group":"L","fifaRank":4,"pR32":1,"pR16":0.504,"pQF":0.246,"pSF":0.118,"pFinal":0.063,"pChamp":0.04},{"name":"Norway","fifaCode":"NOR","group":"I","fifaRank":31,"pR32":1,"pR16":0.498,"pQF":0.254,"pSF":0.133,"pFinal":0.07,"pChamp":0.037},{"name":"Belgium","fifaCode":"BEL","group":"G","fifaRank":9,"pR32":1,"pR16":0.501,"pQF":0.254,"pSF":0.129,"pFinal":0.061,"pChamp":0.036},{"name":"Switzerland","fifaCode":"SUI","group":"B","fifaRank":19,"pR32":1,"pR16":0.518,"pQF":0.265,"pSF":0.135,"pFinal":0.069,"pChamp":0.035},{"name":"Colombia","fifaCode":"COL","group":"K","fifaRank":13,"pR32":1,"pR16":0.501,"pQF":0.255,"pSF":0.132,"pFinal":0.068,"pChamp":0.035},{"name":"South Korea","fifaCode":"KOR","group":"A","fifaRank":25,"pR32":0.889,"pR16":0.451,"pQF":0.211,"pSF":0.115,"pFinal":0.058,"pChamp":0.034},{"name":"Morocco","fifaCode":"MAR","group":"C","fifaRank":8,"pR32":1,"pR16":0.514,"pQF":0.256,"pSF":0.126,"pFinal":0.064,"pChamp":0.033},{"name":"Argentina","fifaCode":"ARG","group":"J","fifaRank":3,"pR32":1,"pR16":0.499,"pQF":0.249,"pSF":0.122,"pFinal":0.059,"pChamp":0.033},{"name":"Mexico","fifaCode":"MEX","group":"A","fifaRank":15,"pR32":1,"pR16":0.491,"pQF":0.249,"pSF":0.123,"pFinal":0.06,"pChamp":0.032},{"name":"Australia","fifaCode":"AUS","group":"D","fifaRank":27,"pR32":0.994,"pR16":0.5,"pQF":0.236,"pSF":0.119,"pFinal":0.065,"pChamp":0.032},{"name":"Ivory Coast","fifaCode":"CIV","group":"E","fifaRank":34,"pR32":1,"pR16":0.513,"pQF":0.27,"pSF":0.134,"pFinal":0.062,"pChamp":0.032},{"name":"Iran","fifaCode":"IRN","group":"G","fifaRank":21,"pR32":0.924,"pR16":0.439,"pQF":0.218,"pSF":0.119,"pFinal":0.057,"pChamp":0.032},{"name":"France","fifaCode":"FRA","group":"I","fifaRank":1,"pR32":1,"pR16":0.483,"pQF":0.238,"pSF":0.12,"pFinal":0.063,"pChamp":0.032},{"name":"Austria","fifaCode":"AUT","group":"J","fifaRank":24,"pR32":0.984,"pR16":0.485,"pQF":0.244,"pSF":0.127,"pFinal":0.072,"pChamp":0.032}],"bracketTraps":[{"team":"Germany","group":"E","fifaCode":"GER","pChampIf1st":0.027,"pChampIf2nd":0.046,"delta":0.018,"pFinalIf1st":0.062,"pFinalIf2nd":0.079},{"team":"Netherlands","group":"F","fifaCode":"NED","pChampIf1st":0.026,"pChampIf2nd":0.039,"delta":0.013,"pFinalIf1st":0.055,"pFinalIf2nd":0.061},{"team":"Croatia","group":"L","fifaCode":"CRO","pChampIf1st":0.015,"pChampIf2nd":0.024,"delta":0.01,"pFinalIf1st":0.029,"pFinalIf2nd":0.056},{"team":"Japan","group":"F","fifaCode":"JPN","pChampIf1st":0.027,"pChampIf2nd":0.032,"delta":0.005,"pFinalIf1st":0.071,"pFinalIf2nd":0.065}],"generatedAt":"2026-07-27T01:19:28.563Z","N":2000}

  const journalismHistoryMock = {"ok":true,"count":8,"briefs":[{"date":"2026-07-27","brief":"Jackson Koivun finished the 3M Open at -25 through 18 holes to secure the title, while Scottie Scheffler trailed at -22 through 18 holes. Hideki Matsuyama, Brian Harman, and Denny McCarthy tied for third at -20 through 18 holes.\n\nTropicana Field saw the Rays (62-43 this season) edge the Guardians (54-53 this season) 1-0 behind Drew Rasmussen's 3.07 ERA this season.","proseScore":140,"wordCount":125,"model":null,"source":"client","generatedAt":"2026-07-27 01:30:38"},{"date":"2026-07-26","brief":"Jackson Koivun leads the 3M Open at -20 through 18 holes, while Ben Kohles and Emiliano Grillo sit at -17 through 18 holes. Yordan Alvarez, a 34-goal slugger this season, anchors the Astros (52-54 this season) as they face the White Sox (54-49 this season).","proseScore":139,"wordCount":195,"model":null,"source":"client","generatedAt":"2026-07-26 14:39:16"},{"date":"2026-07-26","brief":"Jackson Koivun claimed the 3M Open title at -25 through 18 holes, finishing three strokes ahead of Scottie Scheffler at -22 through 18 holes. Hideki Matsuyama, Brian Harman, and Denny McCarthy shared third place at -20 through 18 holes.","proseScore":123,"wordCount":130,"model":"gemini-3.1-flash-lite","source":"cron","generatedAt":"2026-07-26 10:01:05"},{"date":"2026-07-25","brief":"Jackson Koivun leads the 3M Open at -20 through 18 holes, while Emiliano Grillo and Ben Kohles sit at -17 through 18 holes. Pete Crow-Armstrong's 4-hit, 3-RBI night paced the Cubs (59-45 this season) in an 11-0 shutout of the Pirates (53-52 this season).","proseScore":108,"wordCount":209,"model":"gemini-3.1-flash-lite","source":"cron","generatedAt":"2026-07-25 10:01:14"},{"date":"2026-07-24","brief":"Brice Turang's 3-for-4 night and a home run powered the Brewers (64-39 this season) to a 5-2 win over the Rockies (42-63 this season). Shane Drohan (3.51 ERA this season) earned the victory, while Tomoyuki Sugano (4.69 ERA this season) took the loss.","proseScore":138,"wordCount":116,"model":"gemini-3.1-flash-lite","source":"cron","generatedAt":"2026-07-24 10:01:23"},{"date":"2026-07-24","brief":"Michael Kim, a 13-under leader through 18, holds a two-stroke advantage over Ben Kohles at the 3M Open. Gary Woodland sits at 10-under through 18, keeping the field within reach as the second round concludes at TPC Twin Cities.","proseScore":128,"wordCount":120,"model":null,"source":"client","generatedAt":"2026-07-24 01:55:40"},{"date":"2026-07-23","brief":"Ozzie Albies (Braves) went 2-4 with a home run and an RBI to help the Braves (60-42 this season) edge the Padres (50-53 this season) 6-5. Dominic Smith (Braves) added a home run and 3 RBIs tonight.","proseScore":123,"wordCount":129,"model":null,"source":"client","generatedAt":"2026-07-23 16:22:27"},{"date":"2026-07-23","brief":"Ozzie Albies (Braves, 2-4 tonight) homered and Dominic Smith (Braves, 1-3 tonight) drove in 3 RBIs to edge the Padres (50-53 this season) 6-5. Chris Sale (Braves, 11-6, 2.19 ERA this season) outdueled Kyle Hart (Padres, 0-2, 5.50 ERA this season) at Truist Park.","proseScore":136,"wordCount":187,"model":"gemini-3.1-flash-lite","source":"cron","generatedAt":"2026-07-23 10:01:15"}]}

  // Real captured response from a direct probe of /archive/query?date=2026-07-26,
  // 2026-07-27 -- not synthesized. Only real for that one date; the mock
  // handler below returns it for 2026-07-26 and an empty (but real-shaped)
  // {ok, count:0, results:[]} for any other date, so BriefArchive's date
  // stepper is actually exercised in dev instead of showing identical rows
  // no matter which date is selected.
  const archiveQueryMock = {"ok":true,"count":10,"results":[{"id":"game_recap_pga tour_golf_401811959_R4","date":"2026-07-26","brief_type":"game_recap","sport":"PGA TOUR","game_id":"golf_401811959_R4","brief_text":"Jackson Koivun secured a victory at the 3M Open, finishing at 25-under par to win by three strokes over Scottie Scheffler. Ben Kohles made the most significant move of the final round, climbing into the top ten after carding an impressive nine-under 62.","model":"claude-haiku-4-5-20251001","quality_score":125,"word_count":43,"source":"cron","created_at":"2026-07-26 22:31:26"},{"id":"mlb_game_2026-07-26_g29","date":"2026-07-26","brief_type":"mlb_game","sport":"MLB","game_id":"g29","brief_text":"Camden Yards is a launch pad tonight, featuring a +17% runs factor and a +21% HR factor that will test Reynaldo López against a lineup built for this park. Sean Barber is behind the plate with a 78% K-rate, though his tendency to miss the down-right zone could turn this into a long night for both pitchers.","model":null,"quality_score":117,"word_count":57,"source":"client","created_at":"2026-07-26 14:55:26"},{"id":"mlb_game_2026-07-26_g30","date":"2026-07-26","brief_type":"mlb_game","sport":"MLB","game_id":"g30","brief_text":"Fenway Park, a venue that plays to a +8% runs factor but suppresses home runs by 89 percent, demands a different approach from Kevin Gausman tonight. Quinn Wolcott behind the plate adds a layer of uncertainty with his 50% overturn rate on calls, particularly in a right zone that has been consistently weak for hitters.","model":null,"quality_score":121,"word_count":55,"source":"client","created_at":"2026-07-26 14:55:26"},{"id":"mlb_game_2026-07-26_g31","date":"2026-07-26","brief_type":"mlb_game","sport":"MLB","game_id":"g31","brief_text":"PNC Park suppresses runs by 4% and home runs by 7%, making it a difficult venue for the Cubs to find their rhythm against Braxton Ashcraft. Jameson Taillon brings his experience to the mound in a matchup where the Pirates are looking to improve upon their 3-7 record over the last ten games.","model":null,"quality_score":116,"word_count":53,"source":"client","created_at":"2026-07-26 14:55:26"},{"id":"mlb_game_2026-07-26_g1","date":"2026-07-26","brief_type":"mlb_game","sport":"MLB","game_id":"g1","brief_text":"Cleveland's 54-52 record leaves them 1.5 GB in the AL Central, a gap they hope to close against the 61-43 Rays at Tropicana Field. Tampa Bay enters this series with a 5-5 record over their last 10 games, while the Guardians have struggled to a 3-7 mark in that same 10-game window.","model":null,"quality_score":116,"word_count":52,"source":"client","created_at":"2026-07-26 14:44:41"},{"id":"mlb_game_2026-07-26_g16","date":"2026-07-26","brief_type":"mlb_game","sport":"MLB","game_id":"g16","brief_text":"Camden Yards plays as a true launch pad tonight with its +17% runs and +121 HR factor, forcing Reynaldo Lopez and Shane Baz to navigate a park that punishes mistakes. Umpire Sean Barber adds another layer of complexity, as his 78% overturn rate and weak down-right zone suggest a strike zone that will shift under the pressure of these two lineups.","model":null,"quality_score":110,"word_count":61,"source":"client","created_at":"2026-07-26 14:39:19"},{"id":"mlb_game_2026-07-26_g18","date":"2026-07-26","brief_type":"mlb_game","sport":"MLB","game_id":"g18","brief_text":"PNC Park suppresses runs by 4% and home runs by 7%, a reality that complicates life for Jameson Taillon and Braxton Ashcraft as they take the mound tonight. Chicago arrives with a 59-45 record, holding a significant edge over a Pittsburgh squad that has struggled to a 3-7 mark in its last 10 games.","model":null,"quality_score":139,"word_count":54,"source":"client","created_at":"2026-07-26 14:39:19"},{"id":"mlb_game_2026-07-26_g17","date":"2026-07-26","brief_type":"mlb_game","sport":"MLB","game_id":"g17","brief_text":"Fenway Park suppresses home runs by 11 percent, forcing Kevin Gausman and Ranger Suarez to navigate a cavernous outfield rather than relying on the long ball. Quinn Wolcott behind the plate adds another layer of complexity, as his 50 percent strikeout rate and narrow right-side zone will likely turn this matchup into a grind for both starters.","model":null,"quality_score":139,"word_count":57,"source":"client","created_at":"2026-07-26 14:39:19"},{"id":"mlb_game_2026-07-26_g2","date":"2026-07-26","brief_type":"mlb_game","sport":"MLB","game_id":"g2","brief_text":"Cleveland sits 1.5 GB in the AL Central, a gap they hope to close starting tonight at Tropicana Field. Tampa Bay holds a 61-43 record, but their 5-5 mark over the last 10 games suggests a team that is currently vulnerable to a Guardians squad looking to sharpen their postseason path.","model":null,"quality_score":119,"word_count":51,"source":"client","created_at":"2026-07-26 14:39:18"},{"id":"slate_2026-07-26_all","date":"2026-07-26","brief_type":"slate","sport":null,"game_id":null,"brief_text":"Jackson Koivun leads the 3M Open at -20 through 18 holes, while Ben Kohles and Emiliano Grillo sit at -17 through 18 holes. Yordan Alvarez, a 34-goal slugger this season, anchors the Astros (52-54 this season) as they face the White Sox (54-49 this season). Jacob Misiorowski brings a 1.57 ERA this season to the mound for the Brewers (65-39 this season) against the Rockies (42-64 this season). Cristopher Sanchez carries a 2.65 ERA this season into his start for the Phillies (56-49 this season) against the Yankees (59-45 this season).\n\nParker Messick's 2.68 ERA this season is the headline for the Guardians (54-52 this season) against the Rays (61-43 this season). Kohl Drake enters with a 1.80 ERA this season for the Diamondbacks (55-50 this season) against the Nationals (53-52 this season). Shane Baz holds a 4.05 ERA this season for the Orioles (51-54 this season) against the Braves (61-43 this season). Braxton Ashcraft maintains a 3.95 ERA this season for the Pirates (53-52 this season) against the Cubs (59-45 this season). Ranger Suarez carries a 3.15 ERA this season for the Red Sox (53-50 this season) against the Blue Jays (48-57 this season).","quality_score":139,"word_count":195,"source":"client","created_at":"2026-07-26 14:39:16"}]}

  // Real captured response from a direct probe of /health, 2026-07-27 --
  // a plain-text status line, not JSON (see relay.js's relayHealth comment).
  const relayHealthMock = 'RELAY OK — nba + nhl + fpl + fd + odds + squiggle + kali + atp + bdl + espn-gambit + espn-summary + dropbox + field-data + v2 + ws-game-do + jq-gate + jq-analytics + wc-d1 + wc-team-context + soccer-wp + cfl-odds + r2-mlb + r2-nfl + r2-nfl-b + soccer-fbref + nhl-series + nba-clutch + nhl-gsax + bracket-do + ambient-do + v2-cache + analytics-cron, quality-source=analytics-cron'

  // Real games + real drama_peak scores from a direct probe of
  // /archive/drama/leaderboard, 2026-07-27 (see relay.js's dramaLeaderboard
  // comment). drama_arc arrays are downsampled from the real, much longer
  // captured arrays (real values, real order, just fewer points) to keep
  // this mock file a reasonable size -- not synthesized values.
  const dramaLeaderboardMock = {
    MLB: {
      ok: true, sport: 'MLB', season: '2026', limit: 8,
      games: [
        { id: '2026-05-25-mlb-baltim-tampa', sport: 'MLB', date: '2026-05-25', home: 'Baltimore Orioles', away: 'Tampa Bay Rays', home_score: 9, away_score: 7, drama_peak: 74, drama_arc: '[52,52,52,44,44,44,51,51,59,59,68,68,74,74,74,66,66,74,74,51]', game_type: 'regular' },
        { id: '2026-05-26-mlb-chicag-minnes', sport: 'MLB', date: '2026-05-26', home: 'Chicago White Sox', away: 'Minnesota Twins', home_score: 3, away_score: 5, drama_peak: 74, drama_arc: '[52,52,44,44,29,29,36,36,59,59,68,68,74,74,74,37,37,51,51]', game_type: 'regular' },
        { id: '2026-05-31-mlb-seattl-arizon', sport: 'MLB', date: '2026-05-31', home: 'Seattle Mariners', away: 'Arizona Diamondbacks', home_score: 3, away_score: 2, drama_peak: 74, drama_arc: '[52,52,44,44,52,52,51,51,59,59,68,68,74,74,74,66,66]', game_type: 'regular' },
      ],
    },
    MLS: {
      ok: true, sport: 'MLS', season: '2026', limit: 8,
      games: [
        { id: '2026-05-23-mls-minnes-reals', sport: 'MLS', date: '2026-05-23', home: 'Minnesota United FC', away: 'Real Salt Lake', home_score: 1, away_score: 1, drama_peak: 78, drama_arc: '[52,52,52,52,52,37,37,37,37,37,37,37,37,37,37,42,42,47,47,78]', game_type: 'regular' },
        { id: '2026-05-24-mls-lagal-housto', sport: 'MLS', date: '2026-05-24', home: 'LA Galaxy', away: 'Houston Dynamo FC', home_score: 1, away_score: 1, drama_peak: 62, drama_arc: '[52,52,52,52,52,52,37,37,37,52,52,52,52,52,52,57,57,62,62]', game_type: 'regular' },
        { id: '2026-05-24-mls-chicag-toront', sport: 'MLS', date: '2026-05-24', home: 'Chicago Fire FC', away: 'Toronto FC', home_score: 2, away_score: 1, drama_peak: 55, drama_arc: '[52,52,52,52,52,37,37,37,52,52,52,52,52,52,52,37,42,42,47,47,55]', game_type: 'regular' },
      ],
    },
  }

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
    // Same variation strategy as houTexLive: nym-phi's local_note changes
    // after the first poll, so LocalNoteLayer's "override goes stale when
    // the relay's own value moves" behavior is actually exercisable in dev,
    // not just asserted in a comment.
    const nymPhiNote = contextRequestCount >= 2 ? 'Editor updated: doubleheader nightcap' : 'Getaway day, bullpen game'
    // DramaSoundscape needs data that actually TRANSITIONS across polls to
    // exercise its six live cues -- found missing 2026-07-31 (user report:
    // "soundboard doesn't play live"; root cause was a separate reactivity
    // bug in the component, but investigating it surfaced that none of the
    // six cues were even reachable in local dev, since nothing here varied
    // in the ways they check for: no drama_peak at all, no repeated score
    // deltas on the same live game, no false->true went_to_ot/finalized_at
    // transition).
    //
    // The dev server fires 3 near-simultaneous /context/date/ requests at
    // page mount (confirmed via server-side request logging -- benign,
    // pre-existing Vite/HMR dev-only startup burst, unrelated to this
    // component), before settling into a clean one-request-per-15s
    // cadence. A ladder keyed to request COUNT has to start comfortably
    // past that burst or its early steps silently get skipped -- counts
    // 1-4 are a quiet baseline for exactly that reason; every real
    // transition below starts at count 5+, one distinct step per poll:
    //   c5: hou-tex goes live (1-0) -- no cue yet, a delta needs a PRIOR
    //       live tick to compare against.
    //   c6: hou-tex 6-0 (margin 1->6, growing, not yet blowout -- the
    //       intermediate step blowout's "still growing" check needs).
    //   c7: hou-tex 9-0 (margin 6->9, still growing, now >=8) -> BLOWOUT.
    //       bos-nyy flips to 3-5 (home lead +1 -> away lead -2) -> LEAD
    //       CHANGE. bos-nyy's drama_peak jumps 50->90, overtaking hou-
    //       tex's static 60 -> NEW HOTTEST. wnba-sea-phx's went_to_ot
    //       flips false->true -> EXTRA FRAMES.
    //   c8: hou-tex 9-5 (margin 9->4, shrank 5) -> COMEBACK. wnba-sea-phx
    //       gets finalized_at set (still went_to_ot true) -> DRAMATIC
    //       FINAL (status flips live->final while went_to_ot holds).
    //   c9+: everything static -- the steady-state control, confirms
    //        cues fire once on the real transition and don't repeat.
    const houTexHome = contextRequestCount < 5 ? null : contextRequestCount === 5 ? 1 : contextRequestCount === 6 ? 6 : 9
    const houTexAway = contextRequestCount < 5 ? null : contextRequestCount < 8 ? 0 : 5
    const bosNyyAway = contextRequestCount < 7 ? 2 : 5
    const bosNyyDramaPeak = contextRequestCount < 7 ? 50 : 90
    const wnbaWentToOt = contextRequestCount >= 7
    const wnbaFinalizedAt = contextRequestCount >= 8 ? `${date}T02:30:00Z` : null
    // Real shape confirmed live (see OddsRow's own comment in DeskCard):
    // string-encoded JSON with a few internal-only fields (_oddsProof)
    // that the UI is expected to ignore, not surface.
    const bosNyyOpeningOdds = JSON.stringify({ source: 'draftkings', captured_at: `${date}T10:00:42.624Z`, _oddsProof: { adapterId: 'odds-api', sourceId: 'odds-api-the-odds-api' }, moneyline: { home: -149, away: 123 }, spread: { home: -1.5, away: 1.5 }, total: { over: 9, under: 9 } })
    const bosNyyClosingOdds = JSON.stringify({ source: 'draftkings', captured_at: `${date}T10:01:05.701Z`, _oddsProof: { adapterId: 'odds-api', sourceId: 'odds-api-the-odds-api' }, moneyline: { home: -149, away: 123 }, spread: { home: -1.5, away: 1.5 }, total: { over: 9, under: 9 } })
    // Real label strings, not invented brand names -- every one of these
    // was directly observed in scripts/probe-streams-availability.mjs's
    // CI output (a -21/+7 day scan of the real relay), comma-separated
    // exactly as the real field arrives (see Arbitrage/index.jsx's own
    // header comment on the format). Chosen to exercise all three real
    // categories Arbitrage/TonightsPick now distinguish: a priced
    // national service (MLB.TV/ESPN Unlmtd/Apple TV), a free broadcast
    // network (FOX), a matched-but-bundled cable national (TBS), and
    // genuinely unmatched team RSN feeds (SNY, NESN, YES, Space City
    // Home Network, Rangers Sports Network, NBC Sports Phil -- real
    // regional networks for these exact real teams, not filler).
    // WNBA League Pass is real and common in the probe data but has no
    // production PRICES entry, so it also exercises the "matched key,
    // still genuinely unpriced" case distinct from both free and RSN.
    const nymPhiStreams = 'MLB.TV, FOX, SNY, NBC Sports Phil'
    const bosNyyStreams = 'MLB.TV, ESPN Unlmtd, NESN, YES'
    const houTexStreams = 'MLB.TV, TBS, Space City Home Network, Rangers Sports Network'
    const mlsStreams = 'Apple TV'
    const wnbaStreams = 'WNBA League Pass'
    return {
      ok: true,
      date,
      games: {
        regular: [
          // drama_arc/drama_peak added 2026-08-11: NO /context/date mock game carried
          // one, so DeskCard's sparkline was unreachable in dev and the
          // self-normalising-scale bug could not be seen by running the app at all.
          // This arc is the REAL one captured in
          // outbox/drama-leaderboard-wp-movement-probe-*, downsampled the same way
          // the leaderboard mocks above are -- a rise from 52 to a 74 peak, which is
          // exactly the shape the old scaling flattened into a wall.
          { id: `${date}-mlb-nym-phi`, sport: 'MLB', home: 'Philadelphia Phillies', away: 'NY Mets',        home_score: 4,    away_score: 2,    venue: 'Citizens Bank Park',        finalized_at: `${date}T02:15:00Z`, went_to_ot: null, drama_peak: 74, drama_arc: '[52,52,52,44,44,44,51,51,59,59,68,68,74,74,74,66,66,74,74,51]', local_note: nymPhiNote, streams: nymPhiStreams, drama_peak: 40 },
          { id: `${date}-mlb-bos-nyy`, sport: 'MLB', home: 'NY Yankees',            away: 'Boston Red Sox', home_score: 3,    away_score: bosNyyAway, venue: 'Yankee Stadium',            finalized_at: null,                went_to_ot: null, opening_odds: bosNyyOpeningOdds, closing_odds: bosNyyClosingOdds, streams: bosNyyStreams, drama_peak: bosNyyDramaPeak },
          { id: `${date}-mlb-hou-tex`, sport: 'MLB', home: 'Texas Rangers',          away: 'Houston Astros', home_score: houTexHome, away_score: houTexAway, venue: 'Globe Life Field',          finalized_at: null,                went_to_ot: null, streams: houTexStreams, drama_peak: 60 },
          { id: `${date}-mls-col-slc`, sport: 'MLS', home: 'Real Salt Lake',         away: 'Colorado Rapids',home_score: null, away_score: null, venue: 'America First Field',       finalized_at: null,                went_to_ot: null, streams: mlsStreams },
          { id: `${date}-mls-cfm-nyr`, sport: 'MLS', home: 'NY Red Bulls',           away: 'CF Montr\xe9al', home_score: null, away_score: null, venue: 'Red Bull Arena',            finalized_at: null,                went_to_ot: null, streams: mlsStreams },
          { id: `${date}-mls-sj-col`,  sport: 'MLS', home: 'Colorado Rapids',        away: 'San Jose Earthquakes', home_score: 0, away_score: 1, venue: "Dick's Sporting Goods Park", finalized_at: `${date}T01:45:00Z`, went_to_ot: null, streams: mlsStreams, drama_peak: 45 },
          { id: `${date}-wnba-sea-phx`,sport: 'WNBA',home: 'Phoenix Mercury',        away: 'Seattle Storm',  home_score: 60,   away_score: 58,   venue: 'Footprint Center',          finalized_at: wnbaFinalizedAt,      went_to_ot: wnbaWentToOt, streams: wnbaStreams },
          { id: `${date}-wnba-ind-min`,sport: 'WNBA',home: 'Minnesota Lynx',         away: 'Indiana Fever',  home_score: null, away_score: null, venue: 'Target Center',             finalized_at: null,                went_to_ot: null, streams: wnbaStreams },
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

  // Real captured element from a direct CI probe of /fpl/bootstrap-static,
  // 2026-08-04 -- not synthesized (scripts/probe-fpl-elements-shape.mjs,
  // outbox/fpl-elements-shape-*.txt). Trimmed to one real player (the
  // real David Raya record) and his real team, same "trade unused
  // fields for a smaller mock" convention as wcProjectionsMock/
  // dramaLeaderboardMock above -- Value Night only needs enough of a
  // real sample to render without crashing in dev; production reads
  // the real, live, full 568-player endpoint.
  const fplBootstrapMock = {
    teams: [{ id: 1, name: 'Arsenal' }],
    elements: [{
      web_name: 'Raya', team: 1, element_type: 1, now_cost: 60,
      total_points: 162, minutes: 3330, code: 154561,
    }],
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
        if (req.url === '/wc/projections') {
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify(wcProjectionsMock))
        }
        if (req.url?.startsWith('/journalism/brief/history')) {
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify(journalismHistoryMock))
        }
        if (req.url?.startsWith('/archive/query')) {
          const date = new URLSearchParams(req.url.split('?')[1] || '').get('date')
          res.setHeader('Content-Type', 'application/json')
          if (date === '2026-07-26') return res.end(JSON.stringify(archiveQueryMock))
          return res.end(JSON.stringify({ ok: true, count: 0, results: [] }))
        }
        if (req.url === '/fpl/bootstrap-static') {
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify(fplBootstrapMock))
        }
        if (req.url === '/health') {
          res.setHeader('Content-Type', 'text/plain')
          return res.end(relayHealthMock)
        }
        if (req.url?.startsWith('/archive/drama/leaderboard')) {
          const sport = new URLSearchParams(req.url.split('?')[1] || '').get('sport')
          res.setHeader('Content-Type', 'application/json')
          if (!sport) {
            res.statusCode = 400
            return res.end(JSON.stringify({ ok: false, error: 'missing ?sport=' }))
          }
          return res.end(JSON.stringify(dramaLeaderboardMock[sport] ?? { ok: true, sport, season: '2026', limit: 8, games: [] }))
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
