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

**2026-07-24 — real MLB + MLS wiring.** Both `/mlb-stats/standings` and
`/mls/stats/competitions/.../standings` confirmed real, live, mid-season
(MLB `gamesPlayed: 102`; MLS `match_day: 17`). MLB gets a conservative
derived state from real fields only; MLS stays a plain table.

**2026-07-24 — tabs rebuild ("split the difference" between the compact
row version and the original card version).** Card format restored
(state badge + urgency bar + detail line), organized into tabs instead
of one long scroll: MLB gets 7 tabs (6 divisions + Wild Card), MLS gets
2 (Eastern/Western), World Cup gets 12 (one per group, full tables now
that tabs give room — no longer trimmed to winners-only).

**Two groupings needed that don't exist in either API, both verified
before use, not guessed:**
- MLB division names: the API only returns numeric division IDs. Mapped
  by checking which real teams belong to each ID in the live response
  (division 201 = Rays/Yankees/Red Sox/Orioles/Blue Jays = AL East, etc.)
  — derived from real data, not memory.
- MLS conference membership: not present anywhere in the API (checked
  standings and club metadata both). Searched for the real, current 2026
  breakdown and cross-referenced every team name against the live
  standings' exact strings ("Los Angeles Football Club" not "LAFC",
  etc.) before using it. This one is externally-maintained, not derived
  from any FIELD/relay source — flagged as such in the code comment.

NFL/EPL sample section was dropped in the first pass of this rebuild,
then added back — wasn't asked to remove it, and it's the only remaining
representation of the seeded-playoff and promotion/relegation currency
types MLB/MLS/WC don't cover. Worth being explicit that dropping it
without being asked would have quietly narrowed the experiment's scope.

**2026-07-24 — detail-line format, and a real correction to how I
described fixing it.** Jeff pointed at an earlier screenshot (the
pre-tabs build) showing the division detail line as `X GB · WC Y.Z ·
LN` — three fields together. The tabs rebuild had quietly shortened this
to just `GB · streak`, dropping the explicit wild-card-games-back number.
Fixed by restoring the three-field format inside the current tab
structure. Described that fix in chat as "not a revert, an addition" —
which was wrong and got corrected directly: it was plainly both. Adding
the tab system was new. Putting the detail-line format back to match the
earlier build was, exactly, a revert. Avoiding the word "revert" when a
change genuinely is one isn't more accurate, it's just less precise —
noting it here so the log matches what actually happened rather than a
softened description of it.

`npm run build` clean, 22 modules each pass.

**Done when:** the abstraction is tried against realistic shapes from at
least three structurally different, currently-ongoing sports and there's
an honest answer to whether one shared shape covers all three or needs
per-sport branches. Still partially answered: MLB uses the full
state/label/urgency shape with real data; MLS and World Cup deliberately
don't (table only); NFL/EPL remain sample. One of three currency types
proven against real data.

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
