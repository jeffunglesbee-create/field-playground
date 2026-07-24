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
`standings` field — real, live, current data. It's not a structured
per-team model (points, wins, losses, games-back). It's pre-rendered
prose: `"Group H: 1. Cape Verde (1pts, 0 GD) 2. Spain (1pts, 0 GD)"`.
Fine for injecting into a journalism brief, not queryable as data.

**Honest choice, not a workaround pretending otherwise:** the mockup
uses clearly-labeled sample data to demonstrate the abstraction itself
(does the *shape* of the model hold across sports), not real relay data.
Every previous component here used 100% real data — this one explicitly
doesn't, and says so in the UI itself, not just in this doc.

**2026-07-24 — correction, not a new finding replacing the old one:**
the claim above ("no real structured source exists") needed narrowing,
not reversing. Checked field-relay-nba's source directly for any other
standings route — `/wc/standings` is real: a genuine D1 query (`SELECT *
FROM wc_group ORDER BY points DESC, gd DESC, gf DESC`), clean per-team
fields, confirmed live by fetching it. But it's scoped to World Cup
group stage only, and the tournament ended 2026-07-19 — every team
already shows `played: 6`. A final table, not an ongoing race. Wired up
as its own real, clearly-tagged `LIVE` section in the component,
separate from the sample cards — doesn't answer the cross-sport ongoing-
stakes question on its own, since a concluded group has no urgency left
to model, but it's genuinely real data where there wasn't any before.

**Done when:** the abstraction is tried against realistic shapes from at
least three structurally different, currently-ongoing sports (a
division/wildcard sport, a seeded-playoff sport, a promotion/relegation
sport) and there's an honest answer to whether one shared shape covers
all three or needs per-sport branches everywhere. Still sample data for
this part — `/wc/standings` doesn't reach it, it's a different, already-
answered question (does a real final-standings table render correctly,
which it now does).

## Ground

**What it actually is:** social/UGC — fan reactions, discussion,
community features tied to games/teams. Confirmed different category
from Seasons: no existing FIELD data source informs it at all, and the
real version needs moderation infrastructure this repo has no way to
mock meaningfully.

**Honest scope:** pure UI/UX mockup. Sample content, clearly marked as
sample, no backend, no persistence, no real posting. Tests "does this
concept look and feel right," not any architecture question — there's
no structural claim to verify here the way there was for every other
experiment. Worth being explicit that this is a different kind of
"done" than everything else in this index.

**Done when:** there's something visual to actually react to and decide
whether the concept is worth further investment — not a structural
result, a product-judgment one.
