# Provenance — `i-have-adhd`

`SKILL.md` in this directory is **vendored verbatim**. It was not written for
this repo and should not be edited here; edits belong upstream, and anything
changed locally will be silently overwritten the next time it is re-synced.

| | |
|---|---|
| Upstream | https://github.com/ayghri/i-have-adhd |
| Path there | `skills/i-have-adhd/SKILL.md` |
| Commit | `b42a45a068e080294924bfba19a7a2e8944c48ff` (2026-08-21) |
| Copied | 2026-08-22, verified byte-identical with `cmp` |
| sha256 | `938d0e350a0c2b0e2e6c3a9032542e062846d108e0f89dd27c798ba5b436397e` |
| Size | 140 lines, 6813 bytes |
| Licence | MIT — © 2026 Ayoub Ghriss |


## Why this file exists

This repo spent a session establishing that a paraphrase of source is not the
source, after a port built from a doc's description of production code turned
out to disagree with the code in three places. A vendored copy with no recorded
upstream commit is the same failure one step removed: it drifts, and nobody can
say from what. The commit hash above is what makes a re-sync checkable rather
than a guess.

## Re-syncing

```sh
git clone --depth 1 https://github.com/ayghri/i-have-adhd /tmp/iha
cmp /tmp/iha/skills/i-have-adhd/SKILL.md .claude/skills/i-have-adhd/SKILL.md
```

Identical means this file's commit line is still accurate. A difference means
upstream moved: copy it across and update the commit, date, size and hash above
in the same change, so the row never describes a file that is no longer there.

## How it behaves

The frontmatter carries `disable-model-invocation: true`. That makes
"installed" and "active" genuinely different states here — the skill sits inert
and is never auto-triggered by topic. It applies only when invoked explicitly:

```
/i-have-adhd
```

It then persists for the rest of the session by its own terms, until told
`stop adhd mode` or `normal mode`.

Being a **project** skill, it covers this repo only. The global install
(`~/.claude/skills/`), which would make it available in every project on a
machine, is a separate act outside this repo:

```sh
npx -y skills add ayghri/i-have-adhd --agent claude-code -g
```

or, inside a Claude Code session:

```
/plugin marketplace add ayghri/i-have-adhd
/plugin install i-have-adhd@i-have-adhd
```
