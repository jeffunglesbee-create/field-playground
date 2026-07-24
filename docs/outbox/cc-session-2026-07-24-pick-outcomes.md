# cc-session-2026-07-24-pick-outcomes

**Status:** COMPLETE  
**Date:** 2026-07-24  
**Repo:** field-playground (main)  
**HEAD:** be89a86

---

## Comparison artifact — chip overflow finding corrected

The published comparison artifact (https://claude.ai/code/artifact/a154ab98-b9f5-4193-b256-86f2439e9315) had a stale finding in the chip overflow row. ChatGPT's review of the artifact (IMG_9640.png) surfaced it; grep against the live codebase confirmed it.

**What was wrong:** the playground column said "Not prevented — same footgun" and carried a `verdict-neutral` badge. That described the state *before* the `shared.chip` extraction, not after it. `AmbientPanel/index.jsx:34` already had `reasonBadge` composing `shared.chip` for containment at the point the artifact was published.

**Corrections made:**

1. **Chip overflow row — playground column.** Rewritten to accurately describe the current state: gap was found during the experiment and closed by extracting `.chip` to `shared.module.css`; `reasonBadge` and tier badges now compose it. Badge changed from `verdict-neutral` to `verdict-pass`.

2. **Chip overflow row — production column.** Verdict updated from "Same footgun, larger file" to "Fixed — explicit rule in 45k block" — production also fixed it (post-incident explicit CSS rule), mechanism differs.

3. **Summary paragraph.** "No difference at the framework level" replaced with the accurate split: the framework doesn't prevent the gap, but module co-location made it detectable during the experiment and fixable in one step (shared primitive at hand); production required a post-hoc fix after a filed incident. Both now fixed; paths differed.

4. **Component isolation row — production column.** Added explicit caveat: production screenshot shows the game-list view, not the Desk panel, so this is a structural comparison, not a panel-for-panel match.

Artifact republished to the same URL (same `file_path`, same `url` param). No git commit — artifact content lives outside the repo.

---

## Pick outcome tracking — built and verified

**What was built:** W/L/P outcome buttons integrated directly into AmbientPanel's Picks section (not a separate component), plus an aggregate record that appears in the section header once any outcome is set.

**New files:**

- `src/data/outcomes.js` — module-level `createSignal` initialized from `localStorage`. Two exports: `setOutcome(gameId, result)` and `clearOutcome(gameId)`, both write through to `localStorage` on every call. Key: `field-pick-outcomes`. Shape: `{ [game_id]: 'W' | 'L' | 'P' }`.

**Modified files:**

- `src/components/AmbientPanel/index.jsx`:
  - `PickRow` — added `pickTrailing` wrapper (flex, `margin-left: auto`) containing score + `outcomeGroup` (W/L/P buttons). `result()` reads `outcomes()[p().game_id] ?? null`. Toggle behavior: clicking the active button clears; clicking another switches. Unset buttons in the group dim to `opacity: 0.2` when another is selected.
  - `Content` — added `createMemo` computing W/L/P tally over ranked picks via `outcomes()`. Record shown in `sectionHeader` (flex, space-between) only when `record().any` is true.

- `src/components/AmbientPanel/AmbientPanel.module.css`:
  - `sectionLabel` → `sectionHeader` wrapper added (flex, space-between, owns `margin-bottom: 8px`).
  - Added: `.record`, `.pickTrailing`, `.outcomeGroup`, `.outcomeBtn`, `.outcome_w`, `.outcome_l`, `.outcome_p`, `.outcomeDim`.
  - `pickScore` `margin-left: auto` removed (now owned by `pickTrailing`).

**Verified via Playwright (Chromium, 820px viewport):**

- Before any outcome set: W/L/P buttons visible but very dim on all three picks, section header shows "PICKS" with no record.
- After clicking W on pick 1 (Portland Timbers @ Seattle Sounders): W button highlights green, L/P fade to near-invisible, section header shows "1–0–0" in green. Picks 2 and 3 unaffected.
- State confirmed reactive — no explicit DOM manipulation, signal write triggers re-render automatically.
- `localStorage` write confirmed by behavior (state survives page reload — verified by the mechanism, not separately probed).

**Merge conflict resolved:** remote had landed design token changes (`var(--field-text-*)` across AmbientPanel.module.css) and a new `StreakBoard` component while this branch was being built. Conflict was in two places: `.sectionLabel` color token vs. my `.record` addition; `.pickScore` color token vs. my `.pickTrailing` block. Both resolved by keeping remote's tokens and slotting in the new blocks. No behavior lost from either side.

---

## Carry-forwards

- `outcomes.js` stores only `{ game_id: result }`. The Outbox can't display pick metadata (matchup, sport, tier, score) across dates without enriching the storage format. When the Outbox is built, `setOutcome` will need to accept pick metadata alongside the result.
- Pick outcome tracking was added to AmbientPanel's editorial picks (tier A/B/C, reasons). The PickEm component (game winner picks, home/away) has its own separate correct/incorrect evaluation — the two outcome stores are independent. An Outbox panel would need to decide which surface to pull from, or both.

---

## Graduation status

**Pick outcome tracking:** Not graduating yet. The pattern (localStorage signal → reactive record display) is clean and works, but depends on AmbientPanel's editorial picks having real game_ids that resolve against actual game results. Mock data has real-shaped game_ids; production relay would need to confirm the same. When the Outbox component is built and the storage is enriched with pick metadata, the full data shape will be clearer — that's the better graduation candidate.

**Comparison artifact corrections:** Not a code change; no graduation question.
