#!/usr/bin/env node
// Is this working copy reasoning about a version of the repo that no longer
// exists?
//
// THE RISK IS STALE PREMISES, NOT COLLISION. Git already surfaces collisions
// loudly -- a conflicting edit fails at push with a message nobody can miss, so
// building infrastructure for that would be solving a problem git has solved.
// The real hazard when several sessions work one repo is quieter: a session
// reads a file, reasons about it for twenty minutes, and acts on state another
// session already replaced. No conflict, no error, just a conclusion built on
// something that stopped being true.
//
// This happened during the very session that specified this check. A local
// checkout sat three commits behind origin while files were being read and
// reasoned about; it surfaced only because a README written minutes earlier
// wasn't where it was expected. Nothing in git had complained.
//
// WHY IT IS A WARNING BY DEFAULT. This repo's operating mode is speed and
// disposability -- "try things, fail fast, throw work away without ceremony."
// A hard gate on every edit would tax exactly what this place exists for. So it
// reports, loudly, and only fails when asked (--strict), which is the mode CI
// or a pre-commit hook would use.
//
// It is also a PREREQUISITE for any CI that auto-commits fixes. A bot rewriting
// files while a session holds them open manufactures the stale-premise problem
// in exchange for solving a smaller one. Freshness has to land first.
//
// Offline-safe: when the remote is unreachable it says so and exits clean,
// because "couldn't check" must never be reported as "fresh."

import { execFileSync } from 'node:child_process'

const args = new Set(process.argv.slice(2))
const STRICT = args.has('--strict')
const QUIET = args.has('--quiet')

const git = (...a) => {
  try { return execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() }
  catch { return null }
}

const say = s => { if (!QUIET) console.log(s) }

function main() {
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
  if (!branch) { say('not a git repo -- nothing to check'); return 0 }

  const localHead = git('rev-parse', 'HEAD')
  const trackedRef = git('rev-parse', '--abbrev-ref', `${branch}@{upstream}`) || `origin/${branch}`
  const remoteName = trackedRef.split('/')[0]
  const remoteBranch = trackedRef.slice(remoteName.length + 1)

  // What this checkout BELIEVES the remote to be, before contacting anything.
  const cachedRemote = git('rev-parse', trackedRef)

  // ls-remote instead of fetch: read-only, touches no local refs, and cannot
  // silently "fix" the staleness it is trying to report.
  const ls = git('ls-remote', remoteName, `refs/heads/${remoteBranch}`)
  if (!ls) {
    say(`freshness: could NOT reach ${remoteName} -- unchecked, not fresh.`)
    say('           Treat any conclusion about repo state as unverified.')
    return 0
  }
  const actualRemote = ls.split(/\s+/)[0]

  say(`freshness: ${branch} @ ${localHead?.slice(0, 8)}  vs  ${trackedRef} @ ${actualRemote.slice(0, 8)}`)

  if (cachedRemote && cachedRemote !== actualRemote) {
    // The dangerous case, and the one that actually happened: the local copy of
    // the remote ref is itself out of date, so `git log origin/main` lies.
    const behind = git('rev-list', '--count', `${cachedRemote}..${actualRemote}`)
    say('')
    say(`STALE REMOTE REF. Your ${trackedRef} is ${behind ?? 'some'} commit(s) behind the real remote.`)
    say(`  cached: ${cachedRemote.slice(0, 8)}   actual: ${actualRemote.slice(0, 8)}`)
    say('  Anything you concluded from `git log`/`git show` against that ref may be wrong.')
    say('  Run: git fetch origin && git status')
    return STRICT ? 1 : 0
  }

  if (localHead === actualRemote) {
    say('  up to date -- HEAD matches the real remote tip.')
    return 0
  }

  const behind = Number(git('rev-list', '--count', `${localHead}..${actualRemote}`) ?? '0')
  const ahead = Number(git('rev-list', '--count', `${actualRemote}..${localHead}`) ?? '0')

  if (behind > 0 && ahead === 0) {
    say('')
    say(`BEHIND by ${behind} commit(s). Files you have read may already have changed.`)
    const changed = git('diff', '--name-only', `${localHead}..${actualRemote}`)
    if (changed) {
      const files = changed.split('\n').filter(Boolean)
      say(`  ${files.length} file(s) differ from what you are working against:`)
      for (const f of files.slice(0, 12)) say(`    ${f}`)
      if (files.length > 12) say(`    ...and ${files.length - 12} more`)
    }
    say('  Run: git pull --rebase origin ' + remoteBranch)
    return STRICT ? 1 : 0
  }

  if (behind > 0 && ahead > 0) {
    say('')
    say(`DIVERGED: ${ahead} local commit(s), ${behind} remote commit(s) you do not have.`)
    say('  Rebase before continuing -- and re-read anything you reasoned about.')
    return STRICT ? 1 : 0
  }

  say(`  ahead by ${ahead} -- nothing upstream you are missing.`)
  return 0
}

process.exit(main())
