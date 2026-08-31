import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Reading } from './gh.ts'

/**
 * The last reading of a project's tracker, kept beside the project.
 *
 * ## Why there is a cache at all
 *
 * Because reading is now a network call, and it is made every time somebody
 * moves between projects on a canvas. Without a cache, switching back and forth
 * between two projects is four calls to GitHub a minute for a list that has not
 * changed, and the reader watches a blank pane each time. With one, the pane is
 * full the instant it is drawn and the network call is a decision rather than a
 * consequence of looking.
 *
 * The rate limit is the other half of it. GitHub's is five thousand an hour for
 * an authenticated user, which sounds like plenty until a canvas has this pane
 * on it and somebody spends an afternoon moving between four projects — and the
 * limit is shared with every other program on this machine using the same login,
 * including the roadmap's own refresher and Diff. A module that spends somebody
 * else's budget by being on screen is a module people take off the canvas.
 *
 * ## Where it lives, and why not here
 *
 * `<projectPath>/.kehikot/references/tracker.json`.
 *
 * Beside the project rather than in this repository, and spelled to match the
 * convention the storage move is settling on: `.kehikot` because Kehikot is the
 * app — a kehikko is one canvas in it — and a subdirectory per module rather
 * than a shared folder, so that one module's files can be deleted, inspected or
 * ignored without touching anybody else's.
 *
 * The failure that convention exists to prevent has no symptom worth the name: a
 * module writing `.kehikot/` and one writing `.kehikko/` both start, both save,
 * both look right, and the person who opens their project finds one module's
 * data in one folder and another's somewhere else with nothing on any screen to
 * explain it. That is the same class of disagreement as `roadmap.hello` against
 * `roadmap.Hello`.
 *
 * The two constants are spelled here rather than imported, and that is
 * deliberate for exactly as long as it needs to be. The folder name and the
 * id-to-folder derivation are going into the protocol package, and at the time
 * this was written they had not shipped — `roadmap-module-protocol` at
 * `origin/main` still carries the previous shape, so a module importing them
 * today would not start. Agreeing on the path is the whole of the coordination a
 * convention needs; the day the constants land, these two come out and the
 * package's go in, and nothing on disk moves that a person would notice.
 *
 * The directory is created if it is not there; nothing outside it is read,
 * written or assumed, because everything outside it belongs to another module.
 * Everything under `.kehikot/` is gitignored by whoever set the project up, so
 * nothing written here reaches anybody's commit.
 *
 * Beside the project is also the only place that is CORRECT. A cache in this
 * repository would be one file per module installation holding several projects'
 * trackers, which goes stale when a project is deleted, follows nobody when a
 * project is copied to another machine, and is a thing to clean up. In the
 * project, it is derived material sitting next to the thing it is derived from,
 * it dies when the project does, and `rm -rf .kehikot/references` is a complete answer to
 * anybody who does not want it.
 *
 * ## How somebody refreshes it deliberately
 *
 * The Refresh control in the toolbar, which sends `fresh=1` and skips this file
 * on the way in — see `doors.ts`. That is the whole of the deliberate path, and
 * it is deliberate on purpose: there is no interval anywhere in this module. An
 * interval is a program spending a rate limit while nobody is looking at it, and
 * the honest version of "this may be a few minutes old" is a timestamp in the
 * header next to a button, which is what the page has.
 *
 * A read older than `STALE_AFTER_MS` is fetched again on the next context
 * change without anybody pressing anything, so leaving a canvas open all day and
 * coming back to it does not show yesterday.
 *
 * ## It is never the last word
 *
 * Two rules keep this from becoming the quiet lie the rest of this module is
 * written against. The page is always told whether it is looking at a cached
 * reading and when that reading was taken, and it says so in the header. And a
 * FAILED live read that finds a cache hands back both — the rows and the
 * sentence saying the fresh read did not work — rather than either an error over
 * a list somebody could have had or a list pretending it is current.
 */

/** The directory every module puts its own things under, inside a project. */
export const KEHIKOT_DIR = '.kehikot'

/** This module's own subdirectory of it, derived from its id, as the convention says. */
export const MODULE_DIR = 'references'

export const CACHE_FILE = 'tracker.json'

/**
 * How old a reading may be before a context change fetches it again by itself.
 *
 * Ten minutes. Long enough that moving between two projects while working is
 * free, short enough that a pane left open over lunch is not describing the
 * morning. It is not a promise of freshness — the header's timestamp is the only
 * promise made anywhere — it is the point past which this module thinks the
 * network call is worth making without being asked.
 */
export const STALE_AFTER_MS = 10 * 60 * 1000

export function cachePath(dir: string): string {
  return join(dir, KEHIKOT_DIR, MODULE_DIR, CACHE_FILE)
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * What was last read for this project, or null.
 *
 * Read as defensively as anything off the wire, and for the same reason
 * `live/keep.ts` gives: a file that is not JSON, or is JSON of the wrong shape,
 * or was written by a version of this app that no longer exists, must read as
 * "nothing cached" rather than as half a reading. There is no error path here at
 * all — a cache that cannot be read is a cache that is not there, and the
 * consequence is one network call.
 *
 * The four bags are checked for being objects and nothing deeper is checked,
 * because `collect.ts` is already total over whatever is inside them and
 * duplicating its defensiveness here would be two places to keep in agreement.
 */
export function cached(dir: string): Reading | null {
  let raw: string
  try {
    raw = readFileSync(cachePath(dir), 'utf8')
  } catch {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isObject(parsed)) return null
  if (typeof parsed.generated !== 'string' || !parsed.generated) return null
  const bags = ['issues', 'mrs', 'ghIssues', 'ghPrs'] as const
  for (const bag of bags) if (!isObject(parsed[bag])) return null
  return {
    generated: parsed.generated,
    issues: parsed.issues as Record<string, unknown>,
    mrs: parsed.mrs as Record<string, unknown>,
    ghIssues: parsed.ghIssues as Record<string, unknown>,
    ghPrs: parsed.ghPrs as Record<string, unknown>,
  }
}

/**
 * Whether a reading is old enough to be worth reading again unasked.
 *
 * A `generated` that will not parse as a date counts as stale. A cache whose
 * age cannot be established is one this app has no reason to trust the age of,
 * and the cost of being wrong in this direction is one network call.
 */
export function stale(reading: Reading, now = Date.now()): boolean {
  const at = Date.parse(reading.generated)
  if (Number.isNaN(at)) return true
  return now - at > STALE_AFTER_MS
}

/**
 * What makes this module's folder invisible to git, without touching anybody's
 * `.gitignore`.
 *
 * A `.gitignore` containing `*` INSIDE a directory ignores that directory's
 * whole contents, itself included, and git does not report a directory whose
 * every entry is ignored. So one file, written once, is the difference between a
 * cache nobody notices and a cache that turns up as untracked in the owner's
 * next `git status` — in a repository where the diff appears under their name.
 *
 * It is written here rather than by editing `<projectPath>/.gitignore`, and that
 * is the point: this app has no business rewriting a file a person maintains.
 * The convention says everything under `.kehikot/` is ignored, and whoever set
 * the project up may well have added a rule saying so; this makes the promise
 * true whether they did or not, using only a file in this module's own
 * subdirectory. Two rules that agree cost nothing.
 *
 * The comment in it is there because the thing people do with a file they cannot
 * explain is delete it.
 */
const SELF_IGNORE = `# Everything in here is a cache the References module wrote for this project.
# It is derived from GitHub; nothing is lost by deleting the folder.
# Remove this file if you ever want to commit what is in it.
*
`

/**
 * Write a reading down, and never let failing to do so fail the read.
 *
 * A read-only checkout, a full disk, a project on a mounted volume that has gone
 * away — all of them are reasons this cannot be written and none of them is a
 * reason the reader should not see the list that was just fetched. So it returns
 * whether it managed rather than throwing, and the only consequence of `false`
 * is that the next context change costs a network call.
 */
export function remember(dir: string, reading: Reading): boolean {
  try {
    const mine = join(dir, KEHIKOT_DIR, MODULE_DIR)
    mkdirSync(mine, { recursive: true })
    /* Written before the reading, so the cache is never on disk for even a
       moment without the rule that hides it. `wx` so that a person who edited
       this file keeps their edit — it is their repository. */
    try {
      writeFileSync(join(mine, '.gitignore'), SELF_IGNORE, { encoding: 'utf8', flag: 'wx' })
    } catch {
      /* Already there, which is the ordinary case after the first read. */
    }
    writeFileSync(cachePath(dir), `${JSON.stringify(reading, null, 1)}\n`, 'utf8')
    return true
  } catch {
    return false
  }
}
