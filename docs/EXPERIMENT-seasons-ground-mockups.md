# Experiment: Seasons + Ground mockups

**Status: real finding first, before any code — changes what "mockup"
honestly means for one of these two.**

Both trace back to the ChatGPT product review from earlier this project:
Seasons ("extends existing Stats infrastructure, extract a cross-sport
competition-state model") and Ground ("social/UGC, moderation-heavy,
different category, not equally shovel-ready"). Neither has been built
anywhere. Different from every prior experiment here — those tested
architecture questions with real data; these are product-concept
mockups, and they're not the same *kind* of mockup as each other either.

## Seasons

**The real question:** does "division race / wild-card chase /
clinched / eliminated / relegation battle" actually collapse into one
clean abstraction across MLB, NFL, NBA, soccer — or does it break down
sport-by-sport once you try to build it? Genuinely unknown until tried,
same standard as every experiment here.

**Checked before building anything:** `/context/date/{date}`'s
`standings` field is pre-rendered prose, not queryable data.

**2026-07-24 — correction:** `/wc/standings` is real (D1-backed, clean
fields), but scoped to World Cup group stage, concluded 2026-07-19 — a
final table, not an ongoing race.

**2026-07-24 — the actual question now has real data behind it.**
Checked field-relay-nba further for anything covering a currently-
ongoing sport: both MLB (`/mlb-stats/standings`, proxying
statsapi.mlb.com) and MLS (`/mls/stats/competitions/.../standings`,
proxying stats-api.mlssoccer.com) are real, live, and genuinely
mid-season — confirmed by fetching them directly (MLB `gamesPlayed:
102`, `lastUpdated` today; MLS `match_day: 17`). Both wired up as their
own `LIVE` sections.

MLB additionally gets a derived state (division_lead / wildcard_race /
eliminated) computed from real fields only (`divisionRank`, `gamesBack`,
`wildCardGamesBack`) — deliberately conservative, tagged `LIVE, DERIVED`
rather than plain `LIVE`, and does not claim "clinched" or officially
"eliminated," since those need magic-number fields not confirmed present
or correctly parsed here. MLS stays a plain table, same choice as World
Cup — its playoff-line position isn't confirmed with enough confidence
to label a state honestly.

**Done when:** the abstraction is tried against realistic shapes from at
least three structurally different, currently-ongoing sports and there's
an honest answer to whether one shared shape covers all three or needs
per-sport branches. **Partially answered now:** MLB genuinely uses the
state/label/urgency shape with real data. MLS deliberately doesn't
(table only, no state claimed). NFL and EPL — the seeded-playoff and
promotion/relegation currency types — are still sample; no structured
source found for either yet. Real progress, not a complete answer: one
of three currency types now proven against real data, not zero.

## Ground

**What it actually is:** social/UGC — fan reactions, discussion,
community features tied to games/teams. Confirmed different category
from Seasons: no existing FIELD data source informs it at all, and the
real version needs moderation infrastructure this repo has no way to
mock meaningfully.

**Honest scope:** pure UI/UX mockup. Sample content, clearly marked as
sample, no backend, no persistence, no real posting. Tests "does this
concept look and feel right," not any architecture question.

**Done when:** there's something visual to actually react to and decide
whether the concept is worth further investment — not a structural
result, a product-judgment one.
