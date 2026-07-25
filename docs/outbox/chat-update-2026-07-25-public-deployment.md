# chat-update-2026-07-25-public-deployment

**From:** chat (claude.ai)
**Status:** ✅ LIVE and verified — 2026-07-25
**Supersedes the "no URL exists" part of** `chat-update-2026-07-25-live-probe-url.md`

---

## Live

**`https://field-playground.jeffunglesbee.workers.dev`** — HTTP 200,
serving the real built app.

Verified beyond the status code, because a 200 alone would not have been
proof here: `not_found_handling = "single-page-application"` means a
broken asset path would still return 200 with `index.html` as the body.
So the hashed asset was fetched directly —
`/assets/index-BRw4tb1I.js` returns `HTTP 200`,
`content-type: application/javascript`, 159,581 bytes. Real asset, not
an SPA fallback. Code-splitting intact.

---

## What's in the repo

- `wrangler.toml` — assets-only Cloudflare Worker serving `dist/`,
  `not_found_handling = "single-page-application"` so deep links work.
- `.github/workflows/deploy-playground.yml` — builds and publishes on
  `workflow_dispatch` and on source-touching pushes to `main`
  (path-filtered, so the constant docs/outbox traffic doesn't trigger
  deploys). Ends with a real `curl` assertion on the deployed root —
  deploying and verifying, not just deploying.

Chose a Worker over Pages to match `jubilant-bassoon`, already hosted
exactly this way in the same account. One hosting pattern, not two.

**Deploys `dist/`, not `dist-artifact/`** — deliberately. The zero-chunk
artifact build exists only because a single inlined HTML file has
nowhere to fetch a chunk from. Over HTTP chunks are fine, so the hosted
version keeps real code-splitting, meaning the `lazy()`/`Suspense`
experiments are genuinely exercised there in a way the artifact
structurally cannot exercise them.

---

## Correction to an earlier version of this file

The prior version said this was "pending one manual step from Jeff" and
that the credential-free route "would mean adding `field-playground` to
[the Courier's] allowed `repository` claims."

**That second claim was wrong.** Read against
`field-relay-nba/workers/field-deploy/src/index.js` at HEAD:

- `ALLOWED_REPOS` (~line 29) gates the **caller's** OIDC `repository`
  claim, not the target. It already contains
  `jeffunglesbee-create/field-relay-nba`.
- `/secret` (~line 129) accepts `{name, value, repo, owner}` — `repo`
  defaults to `jubilant-bassoon` but is a plain body parameter, so any
  target repo can be named.

So no Courier change was ever needed, and no manual token entry was
either. `CC-CMD-2026-07-25-playground-secret-bootstrap.md` (in
field-relay-nba) covers the one workflow step that does it via the
existing OIDC chain. The mistake came from assuming the allowlist
covered targets without reading it — noted here so it isn't inherited.

---

## For Claude Code — the URL you were blocked on

It exists now and resolves. Two things still worth keeping in mind:

1. **It is a different build than the artifact.** Hosted is chunked, at
   a real origin. The artifact is zero-chunk, inlined, at an opaque
   origin.
2. **So it can pass while the artifact fails** — which is exactly the
   class of failure that produced three blank artifacts today. Use the
   hosted URL for real-device testing and sharing; keep
   `scripts/verify-artifact.mjs` as the gate on anything actually handed
   over, since it tests the exact shipped bytes.

---

## Still open

`wrangler.jsonc` and `wrangler.toml` both exist. The `.toml` is
authoritative (it carries `account_id`, which the deploy workflow relies
on). The `.jsonc` is a parallel-session duplicate, currently kept as an
exact functional mirror so the ambiguity is harmless — but it should be
deleted (`git rm wrangler.jsonc`). Chat has no delete capability.
