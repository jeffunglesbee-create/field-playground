# CC Session Outbox — free POI geocoding sources for VENUE_COORDS

**Date:** 2026-07-27
**Script:** `scripts/probe-poi-geocode.mjs`
**Workflow:** `.github/workflows/poi-geocode-probe.yml`
**Commits:** 2bd58d0, aba66c5, f46ac22 (parallel session, rounds 1-2) →
2ed65bb, 0706f6a, 92a6e29, 23d4426, c069e9b, 979a9e1, 94a19e4 (this
session, rounds 3-9) -- all pushed directly to `main`, matching the
established convention for probe-script iteration (not a feature PR).

---

## What was asked

Chat's original proposal (in a separate mobile session): the
hand-maintained `VENUE_COORDS` table in `src/data/weather.js` isn't the
only thing that works for stadium coordinates -- Wikidata (SPARQL,
structured P625 coordinates, possibly roof properties) and Overpass/OSM
(`leisure=stadium` tags) could plausibly generate that table instead,
including the roof type flag Open-Meteo's populated-places geocoder
(tested earlier: 1/8) structurally can't know. Chat built the first
version of the probe and ran rounds 1-2. From there, in this session:

- "Run the probes with GitHub Actions runner. Don't forget a user-agent
  for Overpass" -- verify chat's own diagnosis and fixes.
- "Chat feedback on Wikidata" (round 2's regression: an unconditional
  unbounded scan broke all 8 venues chasing one miss) -- fix it.
- "Automate follow-ups" -- pick up chat's own proposed fix since chat
  explicitly offered to avoid duplicate edits.
- "More chat feedback" (chat's inverted single-query reframe) --
  confirmed as a probe-only investigation, built as a side-by-side
  comparison rather than a replacement.
- "Do we have a third free source? Use GitHub Actions runner to get a
  complete answer" -- Nominatim.
- Nominatim's usage policy link, twice -- read it in full both times;
  the second read surfaced an explicit caching requirement the first
  pass had missed.
- "Add simple cache" -- built and verified with two real dispatches
  (before: 0/8 cached: after: 7/8 cached).
- "Any other sources?" -- Photon (chat's own original pick, never
  tested until asked for by name).
- "Roof data has to be available elsewhere" / "Can't believe roof
  information isn't readily available" -- two rounds of direct,
  evidence-based investigation rather than re-running the same narrow
  key checks, ending in a conclusive answer.

---

## The four sources, final state

| Source | Coords (last clean run) | Notes |
|---|---|---|
| **Wikidata** (SPARQL) | 7-8/8 | Two-tier lookup: fast indexed pass (bound label/altLabel triples) with an unbounded case-insensitive scan only as a fallback for a real miss. Zero roof info across every round, even when queried by exact entity ID. |
| **Overpass** (OSM) | 2-5/8, variable | Least reliable of the four today -- public instance visibly strained from repeated dispatches (`429`/`504`). When it does answer, its roof tags are real (Tropicana Field: `dome`). |
| **Nominatim** (OSM) | 8/8 | Most reliable per-venue source today. Cached (30-day TTL, `outbox/poi-geocode-cache.json`) per its usage policy's explicit caching requirement. Independently confirmed the same Tropicana Field `dome` tag via different infrastructure. |
| **Photon** (OSM, komoot) | 8/8 | Best fuzzy-name-matching reliability (resolved `loanDepot park` cleanly, the exact case it was added to test). No roof data -- `extra` tags are only populated if the server operator configured `-extra-tags` at index time, and komoot's public instance evidently didn't for these fields. Also cached. |

**Baseline for comparison:** Open-Meteo's own geocoder (tested earlier
this session, not re-tested here) scored 1/8 -- a populated-places
index, not a POI index, confirming the original premise that a
dedicated POI source beats a general geocoder.

---

## The roof-data question, resolved

Every structured source above returns 0/8 or 1/8 on roof/retractable
info. That result held up under real scrutiny, not just repetition:

1. **Round 8** dumped the complete, unfiltered raw tag set for the two
   retractable-roof venues in the test set (Globe Life Field, loanDepot
   park) from both Overpass and Nominatim -- not the 2-3 candidate keys
   every earlier round guessed at. Both came back genuinely rich
   (email, phone, capacity, operator, opening hours, social handles...)
   with **zero roof-related key of any kind**. Checked against OSM's own
   wiki: `roof:shape=*` is a documented ~30-value catalogue of
   *geometric* shapes (dome, gabled, hipped, flat...) with no value for
   "retractable" as a *mechanical* property -- a real, independent
   explanation for why Tropicana Field's `dome` tag exists (a genuine
   fixed dome, a real geometric shape) while the two retractable venues
   have nothing (retractability isn't a shape).

2. **Round 9**, prompted by the user not accepting that at face value:
   checked Wikipedia's own article prose (a fundamentally different
   kind of source -- human-written text, not a structured database) via
   the free TextExtracts API, and re-checked Wikidata by the *exact*
   entity IDs OSM itself links to (`wikidata=` tag: Q24284037, Q1368138)
   rather than by fuzzy label search.

   Result: both Wikipedia articles state it in their **opening
   sentence** -- *"Globe Life Field is a retractable roof stadium..."*,
   *"LoanDepot Park... is a retractable roof stadium..."* -- not buried
   trivia. Both linked Wikidata entities are genuinely well-populated
   (23 and 29 properties respectively -- not neglected stubs) and
   **still carry no roof-type property under any of them**, checked by
   ID this time, closing the "maybe the label search missed it" gap for
   good.

**Conclusion:** the fact is genuinely, prominently documented and free
to find -- just never transcribed into any *structured, machine-
queryable* data source tested. The only free mechanism that actually
surfaced it today was pattern-matching Wikipedia's own article text,
not querying a database field. If auto-generating `VENUE_COORDS`'s
roof-type flag from a free source is ever revisited, this is the
concrete, evidence-based starting point: text-mining Wikipedia prose,
not any of the four structured sources above.

---

## Fixes made along the way (all real, all CodeRabbit-adjacent
findings caught by re-verification, not assumed)

1. **Overpass 406 → real error, not a data verdict.** Missing
   `User-Agent`; Overpass rejects unidentified requests before running
   any query. Fixed with an explicit, identifying UA on every request.
2. **Wikidata's round-2 regression.** An unconditional unbounded scan
   (case-insensitive `FILTER` over ~100M labelled entities) ran for all
   8 venues instead of only the one it was meant to catch, timing out
   (`504`) on every single venue, every run. Fixed with a two-tier
   lookup: a fast indexed pass first, the expensive scan only on a real
   miss.
3. **Nominatim's caching requirement**, missed on first read of its own
   usage policy, caught on a second read: added a simple, TTL'd,
   git-committed cache. Verified with two real dispatches, not just
   asserted -- first populated it (0/8 cached), second proved it works
   (7/8 cached, only the one previously-failed venue re-queried).
4. **Photon's coordinate order** ([lon, lat], opposite of Nominatim's
   separate lat/lon fields) -- verified against Photon's own documented
   example response before trusting it against real data.

---

## What this does NOT change

- `src/data/weather.js`'s `VENUE_COORDS` is untouched by any of this --
  every round here was investigation, explicitly confirmed in-thread as
  staying probe-only, not a decision to replace the hand-maintained
  table.
- The round-4 inverted single-query section (querying by TYPE rather
  than by name, chat's stronger claim) intermittently fails with a
  `SyntaxError: Bad control character in string literal in JSON` --
  reproduced in 2 of 3 dispatches since it was added, on the
  ~180,000-row response. Flagged twice in-thread, not yet fixed --
  outside the scope of what was actually asked each time it came up.
- Overpass's reliability (2-5/8, `429`/`504`) reflects real strain from
  this session's own repeated dispatches against a donated, capacity-
  limited public server, not a code defect.

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/probe-poi-geocode.mjs` | modified (rounds 3-9) -- two-tier Wikidata lookup, inverted single-query section, Nominatim + Photon sources, shared cache, raw tag dump, Wikipedia/Wikidata-by-ID roof check |
| `outbox/poi-geocode-cache.json` | new -- committed Nominatim/Photon result cache, 30-day TTL |
| `outbox/poi-geocode-probe-*.txt` | new (many) -- one per dispatch, each a complete run's output |
