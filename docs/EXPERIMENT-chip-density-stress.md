# Experiment (considered, not started): chip-density stress test

**Status: considered, not started, deprioritized below live-reconciliation.**

**The idea:** the first experiment tested principle #6 (shared
containment primitive) against exactly two chip types (`tier`,
`reasonBadge`). A real FIELD slate has far more chip density at once —
broadcast chips, weather, streak badges, ump-watch tags, local-RSN
markers — often several per card, several cards per screen. Would the
shared `.chip` primitive actually hold up at that density, or would a
new, not-yet-seen variant find a new way to skip it?

**Why it's real, not busywork:** it's not nothing — a higher-density
test could plausibly surface a containment gap the two-chip test was too
small to catch (e.g. chips inside a horizontally-scrolling row, chips
with dynamically-truncated sibling widths, RTL-adjacent layout math).

**Why it's ranked below live-reconciliation:** it's still fundamentally
the *same* bug class as what's already been tested — CSS containment
under a shared primitive — just at higher volume. It would likely
re-confirm principle #6's existing (humbled) result rather than produce
genuinely new information. Live-reconciliation tests an entirely
untested failure class (temporal state vs. render state) with real,
documented FIELD incidents behind it. Same-lane-more-instances is a
weaker use of the next experiment slot than a different, untested lane.

**If picked up later:** scope would be real cards, real relay data,
multiple sports rendered simultaneously at real density — not
synthetic/fake chip counts. Done condition: either a genuine new
containment gap found and fixed, or an honest "held up under real
density" result — both are valid outcomes, same standard as every other
experiment here.
