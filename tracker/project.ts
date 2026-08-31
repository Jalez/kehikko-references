import { statSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

import type { Trouble } from './gh.ts'

/**
 * Which folder a read may run in, and the one uncomfortable fact about it,
 * written down rather than left for somebody to find.
 *
 * ## The rule this file enforces
 *
 * `gh` is run with `cwd` set to a project folder and with no `--repo` argument,
 * so the repository's identity comes from that folder's git remote. Nothing a
 * caller sends ever becomes an element of the argument array — see the essay in
 * `run.ts`. What a caller DOES influence is the working directory, and this file
 * is the whole of what stands between a request and it.
 *
 * ## The residue, stated plainly
 *
 * The path arrives from the page, which was told it by the host in
 * `roadmap.context.projectPath`. Between the host and here it crosses a
 * `postMessage` and a `fetch`, and this process cannot ask the host whether it
 * really said that — there is no channel from a module's server to a host's
 * registry, and inventing one would be a module reading another program's
 * database. So the honest description is: **the folder is caller-named and
 * caller-checked, and the checks below are what makes that acceptable rather
 * than a promise that it is verified.**
 *
 * What the checks buy, in order:
 *
 *  - Absolute, bounded, and free of control characters, so it is a path rather
 *    than a payload.
 *  - Resolved with `resolve`, so `..` is collapsed before anything looks at it
 *    and the string that is checked is the string that is used.
 *  - It must exist and be a directory. A caller cannot make this process create
 *    one, and a `cwd` that is not there makes `spawn` fail rather than fall back
 *    to this process's own directory.
 *  - It must contain `.git`. That is the largest single narrowing: the set of
 *    directories this door will run in is the set of git checkouts on this
 *    machine, and running `gh issue list` in one of the owner's own checkouts is
 *    something the owner can already do in a terminal.
 *
 * What they do NOT buy: this cannot tell one of the owner's repositories from
 * another, so a caller who can reach this port can read the issue list of any
 * repository checked out on this machine. That is why the manifest declares
 * `storage: true` and the server sends no CORS header — the door is closed to
 * every page in the browser, and what is left is a socket that anything already
 * running as this user could reach anyway. The same reasoning, at more length,
 * is in Diff's `manifest.ts`, which spends a much larger credential through the
 * same shape of door.
 *
 * ## Symlinks are not resolved
 *
 * `realpath` is deliberately not called, matching Learning's `projectKey`. Two
 * callers naming the same directory through different mounts would otherwise
 * get different cache files, and resolving means a filesystem call on an
 * arbitrary string, which is the thing being avoided rather than the fix for it.
 */

/** As long as a path may be, matching the protocol's own `LIMITS.PATH`. */
export const MAX_PATH = 4096

export type Project = { ok: true; dir: string } | { ok: false; trouble: Trouble; why: string }

/**
 * The folder a read may run in, or a sentence saying why not.
 *
 * Every no names what to fix, because each of them sends somebody somewhere
 * different: a relative path is a host that sent something it could not have
 * meant, a missing directory is a project that has moved, and a directory with
 * no `.git` is a project that simply is not a repository — which is not a fault
 * at all and gets the same words here that `diagnose()` gives it.
 */
export function projectDir(value: unknown): Project {
  if (typeof value !== 'string') return { ok: false, trouble: 'bad-project' as const, why: 'No project folder was named, so there is nothing to read a tracker from.' }
  const raw = value.trim()
  if (!raw) return { ok: false, trouble: 'bad-project' as const, why: 'No project folder was named, so there is nothing to read a tracker from.' }
  if (raw.length > MAX_PATH) return { ok: false, trouble: 'bad-project' as const, why: 'That project path is longer than any path on this machine could be.' }
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return { ok: false, trouble: 'bad-project' as const, why: 'That project path contains a control character, which no real path does.' }
  }
  if (!isAbsolute(raw)) {
    return {
      ok: false,
      trouble: 'bad-project',
      why: `"${raw}" is not an absolute path. The protocol says a host vouches for an absolute one, so a relative path is something its host could not have meant.`,
    }
  }

  const dir = resolve(raw)

  try {
    if (!statSync(dir).isDirectory()) return { ok: false, trouble: 'bad-project', why: `"${dir}" is not a directory.` }
  } catch {
    return { ok: false, trouble: 'bad-project', why: `"${dir}" is not there. The project this canvas names has moved or been removed.` }
  }

  try {
    /* `.git` rather than `.git/` being a directory: a worktree and a submodule
       both have a `.git` FILE pointing elsewhere, and both are repositories `gh`
       reads perfectly well. Checking for a directory would refuse exactly the
       checkouts an agent is most likely to be working in. */
    statSync(join(dir, '.git'))
  } catch {
    return {
      ok: false,
      trouble: 'not-a-repo',
      why: 'This project is not a git repository, so it has no tracker to read. That is not a failure — a project can be a folder of writing with no repository under it, and this list has nothing to say about one.',
    }
  }

  return { ok: true, dir }
}
