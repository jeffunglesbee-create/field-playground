# chat-update-2026-07-25-public-deployment

**From:** chat (claude.ai)
**Status:** wired, pending one manual step from Jeff
**Supersedes the "no URL exists" part of** `chat-update-2026-07-25-live-probe-url.md`

---

## What's now in the repo

- `wrangler.toml` — assets-only Cloudflare Worker serving `dist/`,
  `not_found_handling = "single-page-application"` so deep links work.
- `.github/workflows/deploy-playground.yml` — builds and publishes on
  `workflow_dispatch`, and on pushes to `main` that touch actual source
  (path-filtered so the constant docs/outbox traffic doesn't trigger
  deploys). Ends with a real `curl` assertion that the deployed root
  returns 200 — deploying and verifying, not just deploying.

Chose a Worker over Pages to match `jubilant-bassoon`, which is already
hosted exactly this way in the same account. One hosting pattern to
maintain, not two.

**Deploys `dist/`, not `dist-artifact/`** — deliberately. The zero-chunk
artifact build exists only because a single inlined HTML file has
nowhere to fetch a chunk from. Over HTTP chunks are fine, so the hosted
version keeps real code-splitting — meaning the `lazy()`/`Suspense`
experiments are genuinely exercised there in a way the artifact
structurally cannot exercise them.

---

## The one manual step (Jeff)

Add a repo secret `CLOUDFLARE_API_TOKEN` with **Workers Scripts:Edit**
permission, then run the workflow.

Chat cannot add GitHub secrets, and under Rule 80 must not handle the
token value at all — so this isn't an oversight, it's the boundary
working. Nothing else is blocked by it: the workflow fails only at the
deploy step until the secret exists.

**Credential-free alternative worth considering:** this account already
runs `field-deploy`, an OIDC courier built precisely so CI can deploy
with zero stored credentials. Using it would mean adding
`field-playground` to its allowed `repository` claims — that lives in
its own repo, which chat has no access to, so it wasn't attempted.
Preferable to a second stored token if the effort is acceptable.

---

## For Claude Code — the URL you were blocked on

Once the secret is added and the workflow runs:

**`https://field-playground.jeffunglesbee.workers.dev`**

Two things worth keeping in mind before pointing a probe at it:

1. **It doesn't exist until that workflow runs successfully.** Verify
   with a real request before building anything that depends on it.
2. **It still may not be the right target.**
   `scripts/verify-artifact.mjs` tests the *exact bytes shipped in the
   artifact*, at an opaque origin that matches the artifact sandbox. A
   hosted URL is a different build (chunked) at a real origin, so it
   can pass while the artifact fails — which is precisely the class of
   failure that produced three blank artifacts today. Use the hosted
   URL for real-device testing and sharing; keep `verify-artifact.mjs`
   as the gate on anything actually handed over.
