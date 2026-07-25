# Experiment: live reconciliation (poll → partial update)

**The question, made sharp enough to actually answer:** the first
experiment (AmbientPanel/DeskCard) only tested *initial load* — skeleton
to content, once. It never tested what happens on *re-fetch*, which is
where FIELD's actual worst bugs have lived: cards stuck on live state
after a game goes final, a pick-resolution flag that never flips,
cross-game text racing on re-render. Those are reconciliation bugs, not
render bugs — a different failure class, untested by the first
experiment entirely. Would a real reactive framework make *that* class
structurally harder to write, the same way it did for skeleton-overlap?

**CONFIRMED, 2026-07-25 — yes, once the actual application bug was found
and fixed. See the full log below; this line is the answer, not a
prediction.**

**Scope, on purpose:** extend the existing `DeskCard` component (not a
new one) to poll `/context/date/{date}` on an interval and reconcile
incoming state against what's already rendered — a live game's score
updating, a game transitioning pre→live→final→final_ot, without a full
remount. Read-only, off the same commodity relay endpoint already in
use. Zero new RUWT tension — nothing computes or ships, same as before.

**Explicitly not doing:** journalism, drama state, picks, anything that
writes. Still just watching public game data change over time.

**Done when:** a live poll cycle correctly transitions a game's rendered
state without a full remount or a stuck intermediate state, AND there's
an honest answer to whether that came free from `createResource`'s
signal-driven refetch or required the same kind of manual bookkeeping
field.js needed.

---

## Log

**2026-07-24** — Checked the mechanism before building: a plain
`createResource` refetch does NOT give free fine-grained updates,
confirmed via SolidJS's own docs and core-team discussion, not guessed.
Built the real fix directly: `deskStore` (`createStore` + `reconcile()`
in the fetcher), `App.jsx` polling every 15s, `DeskCard` reading from the
store with per-game mount-count instrumentation. `npm run build` clean.

**2026-07-24, automated verification attempts (inconclusive).** Tried
Puppeteer (blocked — Chromium unreachable from this sandbox, confirmed
by running it) and a standalone Node script against the real
`solid-js/store` package (four iterations; the reference/unwrap checks
gave a real negative signal, but the more-trustworthy `createEffect`
check couldn't run at all — `solid-js`'s Node/SSR build doesn't drive
the same scheduler a browser does). Conclusion: neither approach could
substitute for an actual browser render. Scripts were scratch work, not
committed.

**2026-07-24, collapsible sport groups.** Same reference-churn question,
applied to local UI state. Fixed with the same pattern (`createStore`
keyed by stable sport name). Same open verification gap noted honestly.

---

**2026-07-25 — six real problems, six real causes, resolved with actual
diagnosis at every step, not repeated guessing. Full chain, in order:**

**1. CI kept failing fast (~2-3 min), three times, on the original
workflow.** Checked this project's own history rather than iterate
blind — found two documented precedents from a prior field-relay-nba
session: a `workflow_dispatch` 422 from a missing PAT scope (ruled out —
dispatch calls were succeeding), and a confirmed GitHub metadata
indexing lag for `workflow_dispatch` after edits (same project, real
precedent). Validated the YAML locally (`yaml.safe_load`) per that same
session's own established diagnostic — clean, ruling out syntax error.

**2. Tested the indexing-lag hypothesis directly.** Pushed a
brand-new-filename workflow (`reconciliation-check-v2.yml`) rather than
keep editing the same file. It ran dramatically longer than the old one
(6+ minutes vs. a consistent ~2m40s death) — real, measurable evidence
the cache theory was genuinely part of the problem. But it still never
finished — cancelled at its own 10-minute ceiling. Progress, not a full
fix.

**3. Reconsidered the whole approach, not just the YAML.** The actual
fragility was spawning `npm run dev` as a background process in an
ephemeral CI runner and hand-polling for readiness — inherently less
reliable than something already proven solid. Rewrote
`scripts/verify-reconciliation.mjs` around a real production build
(`npm run build`, proven reliable every single time it's been run this
project) served statically via plain Python `http.server`, with
Playwright's own `page.route()` intercepting relay calls for
deterministic mock data instead of depending on Vite's dev-only
`mockRelay()` plugin. Fewer moving parts, each independently proven.

**4. New design still failed, fast, with zero visibility.** Traced this
to a real gap in the workflow itself, not the script:
`actions/upload-artifact` stores results as a GHA artifact, which chat
has no tool to download — every previously-working probe in this
project (`chip-overflow-probe.yml` etc.) commits its output back to the
repo directly instead. This one never did. Fixed: added a commit-back
step, `continue-on-error: true` on the script step so the commit always
runs regardless of pass/fail, and real checkpoint logging written to
disk after every stage so a failure leaves evidence instead of nothing.

**5. With real visibility finally working, got a real (partial) result**
— and it directly contradicted itself in an informative way:
`no_gamerow_nodes_removed_from_dom: true` (MutationObserver saw nothing
removed) but `dom_node_references_reused_not_remounted: false` (both
tracked nodes reported `stillConnected: false`). That contradiction
pointed at a real bug in the *test's* own detection: the MutationObserver
only flagged nodes whose own className included "gameRow" — if a
*parent* container gets removed with gameRows inside it, the observer
never sees the individual rows, only the parent. `isConnected` (literal
node-in-document truth) doesn't have that blind spot, and it said the
nodes really were gone.

**6. That pointed straight at `DeskCard`'s own root `<Switch>`, and this
was the actual bug the whole experiment existed to find.** It checked
`deskData.loading` to decide skeleton vs. content — and `createResource`'s
`.loading` flips `true` on *every* refetch by default, not just the
first load. That means `Content` (and every `GameRow` inside it) was
unmounting and remounting on every single poll, regardless of whether
`deskStore`'s own `reconcile()` was working correctly underneath — the
inner fix could have been perfect and this outer structure would have
hidden it completely. Fixed: `<Show when={deskData()} fallback={<Skeleton/>}>`
instead — checks the resolved *value*, which stays truthy across a
refetch, so `Content` only ever unmounts on the genuine first load.

**Re-ran verification after the fix. Confirmed, not inferred:**
```
dom_node_references_reused_not_remounted: PASS
  NY Mets @ Philadelphia Phillies: stillConnected=true, sameNodeReference=true
  Houston Astros @ Texas Rangers:  stillConnected=true, sameNodeReference=true
houtex_transitioned_pre_to_live: PASS (pregame "—" -> live "0–1", status dot pre->live)
no_gamerow_nodes_removed_from_dom: PASS
```
Real DOM node identity — literal `===` reference equality on the actual
browser nodes — for both the game that changed and the one that didn't.
That's the strongest test available, and it's real now, not a proxy.

**One remaining `false` in the manifest that isn't a real finding:**
`all_mount_counts_stayed_at_m1` shows empty arrays, because the
mount-count debug badge only renders in dev mode (`import.meta.env.DEV`),
and this now correctly tests the production build. Artifact of testing
prod instead of dev, not a failure — worth a follow-up to stop that
check from reporting `false` on an empty set, but not worth re-running
verification over.

**Final answer to the experiment's actual question:** yes — SolidJS's
`createStore` + `reconcile()` genuinely prevents unnecessary DOM churn on
poll, confirmed via real node-reference identity, not assumed from
documentation or a proxy metric. It required getting the *consuming*
component's own conditional-rendering right too — a store doing the
right thing internally doesn't help if the component wrapping it
unmounts the whole subtree anyway. Both pieces have to be correct
together; neither alone was sufficient, and this experiment found both
gaps for real, not just the one it set out to test.
