// Real, confirmed UMPIRE_ABS_RATINGS values -- confirmed the same way as
// parkFactors.js (see that file's header for the shared architecture
// finding: static baked constant, no field-relay-nba HTTP route). Source:
// docs/CC-CMD-2026-07-01-umpire-weakness-zone.md (real shape --
// {challenged, overturned, rate, fullName, weakness, zones} -- computed
// from Statcast CSV `zone` aggregation, min 3 challenges to compute a
// rate, weakness only flagged when genuinely above the umpire's own
// overall rate) and docs/outbox/cc-mlb-umpire-abs-sync-2026-07-10.md,
// whose real Node `vm` extraction test against the actual committed
// getUmpireABSRating function produced these exact strings verbatim:
//   getUmpireABSRating('Little')    -> "40% overturn (2/5) · weak: down-right zone"
//   getUmpireABSRating('Visconti')  -> "50% overturn (3/6) · weak: down-left zone"
//   getUmpireABSRating('Tumpane')   -> "71% overturn (5/7) · weak: down-left zone -- above league avg 53%"
// Tumpane's rate (0.714) exceeds UMP_WATCH_THRESHOLD (0.65), production's
// own real constant, so buildUmpWatchBadge would show [UMP WATCH] for
// that game. Barber is the 4th real data point, from the user-provided
// screenshot of the live production app (Sean Barber, Camden Yards game,
// "78% overturn rate", weakness "down-right zone") -- no challenged/
// overturned fraction was visible in the screenshot, so `record` is left
// unset rather than guessed.
//
// UMPIRE_ABS_RATINGS also carries 48 real current umpire last names
// (little, visconti, tumpane, tichenor, miller, diaz, beck, ...), but only
// these 4 have a confirmed rate/weakness -- the other 44 are not included
// here rather than backfilled with invented numbers.
export const UMP_WATCH_THRESHOLD = 0.65

export const UMPIRE_WATCH = [
  { name: 'Little', rate: 0.40, record: '2/5', weakness: 'down-right zone' },
  { name: 'Visconti', rate: 0.50, record: '3/6', weakness: 'down-left zone' },
  { name: 'Tumpane', rate: 0.71, record: '5/7', weakness: 'down-left zone' },
  { name: 'Barber', rate: 0.78, record: null, weakness: 'down-right zone' },
]
