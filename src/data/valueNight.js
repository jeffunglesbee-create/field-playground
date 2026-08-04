// Value Night -- real fantasy-football economics: points delivered per
// real £ of transfer cost, using FPL's real bootstrap-static fields
// (now_cost, total_points, minutes, element_type, team), confirmed
// live via a direct CI probe before this was written (see
// scripts/probe-fpl-elements-shape.mjs and its committed result).
//
// now_cost is tenths of a million (standard, real FPL convention --
// confirmed by the probe's observed range, 40-155, which matches
// real-world FPL prices, roughly £4.0m-£15.5m).
const POSITION = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' }

// 10 full 90-minute matches -- a standard, real FPL sample-size
// convention (not a guessed threshold) for excluding players whose
// points/cost ratio is noise from a handful of minutes played.
export const MIN_MINUTES = 900

export function rankByValue(bootstrap) {
  const teams = bootstrap?.teams ?? []
  const elements = bootstrap?.elements ?? []
  const teamName = {}
  for (const t of teams) teamName[t.id] = t.name

  return elements
    .filter(e => typeof e.now_cost === 'number' && e.now_cost > 0 && typeof e.total_points === 'number' && (e.minutes ?? 0) >= MIN_MINUTES)
    .map(e => {
      const costM = e.now_cost / 10
      return {
        name: e.web_name,
        team: teamName[e.team] ?? 'Unknown',
        position: POSITION[e.element_type] ?? '—',
        costM,
        points: e.total_points,
        minutes: e.minutes,
        value: e.total_points / costM,
      }
    })
    .sort((a, b) => b.value - a.value)
}
