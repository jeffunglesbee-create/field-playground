# The claims ledger

A confidence gate that only lists what you *know* you don't know measures humility,
not accuracy.

On 2026-08-11 an outbox doc scored itself 88/100 and enumerated six honest unknowns. Three
separate claims in it were then corrected by a session with relay access. **None of the three was
among the six.** Every one lived in a sentence written flatly, without hedging, because I had not
noticed it was an inference or a stale quotation rather than an observation.

So the gate's number was not wrong so much as *unfalsifiable*. This ledger makes it operate on
claims instead of feelings.

---

## The record

One JSON file per session: `docs/outbox/claims/<session-doc-basename>.json`, an array of claims.

```jsonc
{
  "id": "relay-ccmds-unpicked",           // stable, referenced by resolutions
  "text": "All three CC-CMDs are staged and none picked up",
  "provenance": "RETRIEVED",              // MEASURED | DERIVED | RETRIEVED | ASSUMED
  "source": "codex:cc-cmd-2026-08-08-desk-sports-followups",
  "asOf": "2026-08-08T22:38:47Z",         // when the SOURCE was written, not when I read it
  "reverified": false,
  "falsifier": "search the relay repo for cc-session-2026-08-08-* outboxes",
  "falsifierCost": "one tool call",
  "falsifierAttempted": false,
  "verifiableHere": true,
  "confidence": 0.9,                      // 0..1, a real forecast
  "resolution": "REFUTED",                // added later, never at write time
  "resolvedAt": "2026-08-11T02:10:00Z",
  "resolutionNote": "all three had been picked up; status line was 3 days stale"
}
```

## The four provenance types, and why the split is the whole point

| Type | Means | Required fields |
|---|---|---|
| `MEASURED` | I ran something and read the output | `source` must be a real path on disk |
| `DERIVED` | I concluded it from something measured | `derivedFrom` — the inference stated in one line |
| `RETRIEVED` | Quoted from a doc, codex entry, or another session | `source` + `asOf` |
| `ASSUMED` | Neither measured nor sourced | nothing, but confidence is capped |

The three errors were two `RETRIEVED` and one `DERIVED`. Not one was `MEASURED`. That split is
not bookkeeping — it is the signal.

## What `check-claims.mjs` enforces

1. **Provenance is typed and complete.** A `MEASURED` claim whose `source` is not a file that
   exists is not measured; it is `ASSUMED` wearing a costume.
2. **Retrieval freshness.** `RETRIEVED` claims carry `asOf`. Past a staleness threshold without
   `reverified: true`, they fail. `check-freshness.mjs` already does this for git refs; a quoted
   status line needs it just as much and had none.
3. **Unattempted cheap falsifiers.** Every claim states what would refute it and whether that was
   run. A claim with a *cheap* falsifier that was **not attempted** is the highest-risk line in any
   document, and it is mechanically detectable.
4. **Access boundary.** Claims depending on something this session cannot reach must be
   `verifiableHere: false`. The boundary is knowable in advance — `src/index.js` was unreadable
   the whole time — so stating a flat claim about it is a category error, not bad luck.

## What `gate-score.mjs` does — the part that closes the loop

A confidence gate is a forward-stated probability that never gets resolved. That is *exactly* the
defect fixed in the Calibration component the same day: forward ratings that could never complete.

`gate-score.mjs` resolves them. When a correction lands, the claim it refutes gets a `resolution`,
and the tool computes a **Brier score over your own confidence gates, broken down by provenance**.
Two rounds of that would have shown `RETRIEVED` claims as systematically overconfident long before
anyone had to correct three of them by hand.

Same metric, same honesty rule as the app: a forecast only counts if it was stated before the
outcome was known. `resolution` is never written at authoring time, and the checker enforces that.
