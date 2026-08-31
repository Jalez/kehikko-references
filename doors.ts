import { ID, MANIFEST, VERSION } from './manifest.ts'
import { cached, remember, stale } from './tracker/cache.ts'
import { readTracker, type Reading, type Trouble } from './tracker/gh.ts'
import { projectDir } from './tracker/project.ts'
import { runCli, type Runner } from './tracker/run.ts'

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
 * changes. So the manifest, the health check and this app's one credentialed
 * door have to be Vite's too: middleware in front of the same server, not a
 * second process on a second port however much tidier that would look.
 *
 * It reaches further here than it did when this file did not exist. The page
 * fetches `/api/references` as a RELATIVE path, which is what makes it work
 * inside a frame at whatever address the host wrote down; a store on another
 * port would make every one of those fetches cross-origin, which is to say not
 * at all.
 *
 * Hence: no listener here. `answer()` takes a method, a path and a query and
 * returns a status and a document, and `vite.config.ts` adapts a node request to
 * it in a dozen lines. Which also means the whole of what this app will say can
 * be tested by calling a function, with its own runner — see `test/doors.test.ts`,
 * where nothing shells out and nothing needs a network.
 *
 * ## The one door that spends a credential
 *
 * `/api/references` runs `gh` as whoever started this server. That is the reason
 * this module now declares `storage: true` and sets no CORS header, and the long
 * version is in `manifest.ts`. The short version: with a permissive header, any
 * page in any tab could call this and read the issue list of every private
 * repository checked out on this machine.
 *
 * What is left after that is the socket itself, and nothing here pretends
 * otherwise: anything already running as this user can call this port. So the
 * door is still written as if its caller were a stranger. Nothing is trusted,
 * every string is bounded before it is looked at, the project folder is checked
 * by `tracker/project.ts` before anything runs in it, and no request string ever
 * becomes an element of an argument array.
 */

/** As long as a query value is read for. Past this it is a payload rather than a path. */
const MAX_QUERY = 4096

export interface Reply {
  status: number
  body: unknown
}

/**
 * What the page gets back, in the one shape it has to understand.
 *
 * `ok` is about the DOOR rather than about the tracker: a request that was
 * understood answers 200 with `ok: true` even when the read failed, because a
 * failed read is a fact about the world and not an error in this program, and
 * routing it through an HTTP status would put it in a `catch` where all of them
 * look alike. The five sentences are the whole point of this module, and they
 * arrive as data.
 *
 * Every field below is present in every answer, so the page never has to guess:
 *
 * - `reading` — the four bags, or null if there is nothing at all to show.
 * - `from` — where those rows came from THIS time. `'gh'` is a live read;
 *   `'cache'` is the file beside the project. Reported, never inferred.
 * - `trouble` and `why` — null when the live read worked. When they are set and
 *   `reading` is also set, the page has rows AND a sentence: this is what was
 *   last read, and here is why it could not be read again. Those two together
 *   are the state this whole design exists to be able to draw.
 */
export interface Answer {
  ok: true
  project: string
  reading: Reading | null
  from: 'gh' | 'cache' | null
  trouble: Trouble | null
  why: string | null
  /** What `gh` itself printed, when it printed anything. Shown rather than summarised. */
  said: string | null
}

const str = (value: string | null): string => (value ?? '').slice(0, MAX_QUERY)

/**
 * Read one project's tracker, deciding first whether it has to be read at all.
 *
 * The order is the whole of the caching policy and it is four lines:
 *
 * 1. A cache that is present and not stale, on a request that did not ask for
 *    freshness, is the answer. No process is started.
 * 2. Otherwise `gh` runs.
 * 3. A successful run is written down and returned.
 * 4. A failed run returns the cache if there is one, WITH the failure, and the
 *    failure alone if there is not.
 *
 * Step four is the one worth defending. The alternative — an error page over a
 * project whose list was read forty seconds ago — throws away information the
 * reader could have had, to make a point about the network. And the opposite
 * alternative, quietly serving the cache and saying nothing, is the failure that
 * looks like success, which is the specific thing this module refuses.
 */
export async function references(project: string, fresh: boolean, run: Runner): Promise<Answer> {
  const dir = projectDir(project)
  if (!dir.ok) {
    return { ok: true, project, reading: null, from: null, trouble: dir.trouble, why: dir.why, said: null }
  }

  const held = cached(dir.dir)
  if (held && !fresh && !stale(held)) {
    return { ok: true, project: dir.dir, reading: held, from: 'cache', trouble: null, why: null, said: null }
  }

  const read = await readTracker(dir.dir, run)
  if (read.ok) {
    remember(dir.dir, read.reading)
    return { ok: true, project: dir.dir, reading: read.reading, from: 'gh', trouble: null, why: null, said: null }
  }

  return {
    ok: true,
    project: dir.dir,
    reading: held,
    from: held ? 'cache' : null,
    trouble: read.trouble,
    why: read.why,
    said: read.said || null,
  }
}

/**
 * What this app answers, for one request.
 *
 * `null` means "not one of ours", and the caller passes the request on to Vite —
 * which is how the page, its modules and the hot-reload socket all keep working
 * through the same middleware stack.
 *
 * The runner is a parameter with a default rather than an import, which is the
 * seam the tests use: `test/doors.test.ts` calls this with a runner that returns
 * canned `gh` output and asserts on the arguments it was handed, so every
 * decision in this file is exercised without a subprocess.
 */
export async function answer(
  method: string,
  path: string,
  query: URLSearchParams,
  run: Runner = runCli,
): Promise<Reply | null> {
  if (path === '/healthz') {
    if (method !== 'GET') return { status: 405, body: { ok: false, error: 'this door only answers GET' } }
    return { status: 200, body: { ok: true, id: ID, version: VERSION } }
  }

  if (path === '/api/references') {
    if (method !== 'GET') return { status: 405, body: { ok: false, error: 'this door only answers GET' } }
    const project = str(query.get('project')).trim()
    if (!project) {
      return {
        status: 400,
        body: { ok: false, error: 'ask for a tracker by the absolute path of the project folder it is in.' },
      }
    }
    /* Exactly one thing turns the query into behaviour, and it is a boolean.
       Anything else a caller sends is ignored rather than parsed, because a door
       with a second knob is a door with a second thing to get wrong. */
    return { status: 200, body: await references(project, query.get('fresh') === '1', run) }
  }

  return null
}

/** Re-exported so `vite.config.ts` imports its doors from one place. */
export { MANIFEST }
