// Real, confirmed PARK_FACTORS values -- FIELD_Handoff investigation
// (2026-07-26), not fabricated. PARK_FACTORS is a static baked JS constant
// inside jubilant-bassoon/index.html (confirmed via CODE_MAP.json:
// PARK_FACTORS L8456-8488, getParkFactor L8877, buildParkFactorBadge
// L8993) -- not served over any field-relay-nba HTTP route (read_source
// found zero "park factor" hits there, and its HANDOFF.md never mentions
// one), so unlike weather.js this cannot be a live-fetched resource. The
// values below are a fixture built only from confirmed real numbers, not
// an attempt to reproduce the full table (read_lines silently fails on
// index.html's 2.3MB source -- a known FIELD_Handoff limitation -- so the
// full table was never readable this session).
//
// This repo's own mock slate (vite.config.js) has 3 MLB venues -- Citizens
// Bank Park (PHI), Yankee Stadium (NYY), Globe Life Field (TEX) -- and this
// session could not confirm a real park-factor value for any of the three.
// Rather than invent one, this is a reference leaderboard of confirmed real
// MLB park factors, honestly not tied to today's slate.
//
// Sources:
// - Coors Field: docs/outbox/cc-dead-fallback-clause-2026-07-12.md, a real
//   extraction test's exact output -- "Coors Field: +28% runs · HR factor
//   130", badge [LAUNCH PAD].
// - Oriole Park at Camden Yards: user-provided screenshot of the live
//   production app -- "+17% runs and +121 HR factor", badge [LAUNCH PAD].
// - Target Field, Citi Field, PNC Park: docs/outbox/cc-lead-specificity-
//   scoring-2026-07-12.md, real archived brief text pulled via
//   probe_relay_route (not this dataset's own fixture, but genuine
//   production output quoting these figures). HR factor only stated
//   verbatim for PNC Park; Target Field and Citi Field give runs% only --
//   left unset rather than guessed.
export const PARK_FACTORS = [
  { team: 'COL', venue: 'Coors Field', badge: 'LAUNCH PAD', runsPct: 28, hrFactor: 130 },
  { team: 'BAL', venue: 'Oriole Park at Camden Yards', badge: 'LAUNCH PAD', runsPct: 17, hrFactor: 121 },
  { team: 'MIN', venue: 'Target Field', badge: null, runsPct: 4, hrFactor: null },
  { team: 'NYM', venue: 'Citi Field', badge: null, runsPct: -5, hrFactor: null },
  { team: 'PIT', venue: 'PNC Park', badge: null, runsPct: -4, hrFactor: -7 },
]
