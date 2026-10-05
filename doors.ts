import { ID, MANIFEST, VERSION } from './manifest.ts'

/**
 * Every door this app answers on that is not the page itself.
 *
 * ## Why this is a file of functions rather than a server
 *
 * A module is ONE ORIGIN or it is nothing. The protocol refuses a manifest whose
 * `entry` points anywhere but the origin that served the manifest, and it is
 * right to — a program that could name somebody else's page would be a program
 * that could have the host frame somebody else. The page is Vite's, because a
 * `dist/` served off disk has cost this codebase whole afternoons of a stale
 * page answering 200 with every symptom of a working app and none of the
 * changes. So the manifest and the health check have to be Vite's too:
 * middleware in front of the same server, not a second process on a second
 * port however much tidier that would look.
 *
 * Hence: no listener here. `answer()` takes a method, a path and a query and
 * returns a status and a document, and `vite.config.ts` adapts a node request to
 * it in a dozen lines — see `test/doors.test.ts`.
 *
 * ## The door that is gone
 *
 * `/api/references` ran `gh` under this machine's login, in a project folder
 * the page named, and kept what it read in
 * `<project>/.kehikot/references/tracker.json`. It saw GitHub and nothing else,
 * and it was a second reader of trackers the host already reads (issue #4). The
 * rows come from the host's shared reading now — `tracker.get`, asked over the
 * bridge in `src/live/ask.ts` — so this app spends no credential, starts no
 * subprocess and writes nothing beside the project. A `tracker.json` an older
 * version left there is read by nothing; `rm -rf .kehikot/references` is a
 * complete answer to it.
 */

export interface Reply {
  status: number
  body: unknown
}

/**
 * What this app answers, for one request.
 *
 * `null` means "not one of ours", and the caller passes the request on to Vite —
 * which is how the page, its modules and the hot-reload socket all keep working
 * through the same middleware stack.
 */
export async function answer(method: string, path: string, _query: URLSearchParams): Promise<Reply | null> {
  if (path === '/healthz') {
    if (method !== 'GET') return { status: 405, body: { ok: false, error: 'this door only answers GET' } }
    return { status: 200, body: { ok: true, id: ID, version: VERSION } }
  }
  return null
}

/** Re-exported so `vite.config.ts` imports its doors from one place. */
export { MANIFEST }
