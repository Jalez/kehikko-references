import type { Sight, Trouble, TroubleKind } from './sight.ts'

/**
 * Asking this app's own server for a project's tracker.
 *
 * ## Why the page does not run anything itself
 *
 * It cannot. A page in a browser has no subprocesses, no `gh`, and no way to
 * hold a credential that would not be a credential in a browser. What it has is
 * a server of its own — the same one that served it, because a module is one
 * origin or it is nothing — and that server can shell out. So the whole of this
 * file is one `fetch` at a relative path, and everything difficult is behind it
 * in `doors.ts`.
 *
 * Relative, and that matters: this page is framed at whatever address the host
 * wrote down, so `api/references` resolves against the document the browser just
 * fetched and is right in every deployment. An absolute path would be right here
 * and a guess behind a proxy.
 *
 * ## Reading the answer as if it came from a stranger
 *
 * It did not — it came from a door in this same repository — and it is read
 * defensively anyway, for the reason `live/keep.ts` gives about the host's kept
 * string: the two halves are separately deployable, a stale one is the normal
 * state of a dev server mid-edit, and half-applying a shape that has moved is
 * the failure that produces a page nobody can explain. Anything that is not the
 * expected shape reads as one `door` trouble with a sentence, which is a
 * situation the page already knows how to draw.
 */

/** The kinds the door may name. Anything else is not a kind this page knows. */
const KINDS: readonly TroubleKind[] = [
  'bad-project',
  'no-gh',
  'not-a-repo',
  'no-remote',
  'unauthenticated',
  'offline',
  'rate-limited',
  'refused',
  'door',
]

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** What this app says when its own server is the thing that failed. */
function doorTrouble(why: string, said: string | null = null): Trouble {
  return { kind: 'door', why, said }
}

/**
 * The `fetch` this module uses, as a parameter with a default.
 *
 * The seam every test in `test/ask.test.ts` goes through, so that the reading of
 * an answer — including every malformed one — is exercised with no server
 * running and no network involved. The same shape as the `Runner` in
 * `tracker/run.ts` and as the host's own `Runner`: the decision is a function,
 * the doing is a parameter.
 */
export type Fetcher = (url: string, init: { signal: AbortSignal }) => Promise<Response>

/**
 * Where the read goes, built here so there is one place that knows the shape.
 *
 * `encodeURIComponent` on the path is not decoration: a project folder may
 * perfectly well contain a `&` or a `#`, and a query assembled without it would
 * name a different directory than the one the host said — which is the quiet
 * kind of wrong this module is written against. `fresh` is sent only when it is
 * true, so that the ordinary read and the pressed one are visibly different in a
 * server log.
 */
export function askUrl(project: string, fresh: boolean): string {
  const query = new URLSearchParams({ project })
  if (fresh) query.set('fresh', '1')
  return `api/references?${query.toString()}`
}

/**
 * One read, turned into the `Sight` it produced.
 *
 * Never throws and never rejects: every way this can go wrong is a state the
 * page draws, and a rejection would be one of them arriving at a `catch` that
 * could only say "something went wrong". An abort is the exception, and it is
 * signalled by returning `null` — the caller started a newer read and this
 * answer is about the previous project, so it must not become the page.
 */
export async function ask(
  project: string,
  fresh: boolean,
  signal: AbortSignal,
  fetcher: Fetcher,
): Promise<Sight | null> {
  let response: Response
  try {
    response = await fetcher(askUrl(project, fresh), { signal })
  } catch (error) {
    if (signal.aborted) return null
    return {
      at: 'trouble',
      project,
      trouble: doorTrouble(
        'This app’s own server did not answer. It serves the page you are reading, so it was there a moment ago — reloading this pane is what tells you whether it still is.',
        (error as Error)?.message ?? null,
      ),
    }
  }
  if (signal.aborted) return null

  if (!response.ok) {
    return {
      at: 'trouble',
      project,
      trouble: doorTrouble(
        `This app’s own server answered ${response.status} to a request for this project’s tracker, which is this program disagreeing with itself rather than anything about the project.`,
      ),
    }
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    if (signal.aborted) return null
    return {
      at: 'trouble',
      project,
      trouble: doorTrouble('This app’s own server answered with something that is not JSON, which means the page and the door it talks to are different versions of this program.'),
    }
  }
  if (signal.aborted) return null

  if (!isObject(body) || body.ok !== true) {
    return {
      at: 'trouble',
      project,
      trouble: doorTrouble(
        'This app’s own server refused the request for this project’s tracker.',
        isObject(body) ? str(body.error) || null : null,
      ),
    }
  }

  const kind = str(body.trouble) as TroubleKind
  const trouble: Trouble | null = KINDS.includes(kind)
    ? { kind, why: str(body.why) || 'The tracker could not be read, and the door did not say why.', said: str(body.said) || null }
    : null

  /* `reading` present is rows, whatever else came back. The `from` beside it is
     reported rather than inferred, and both branches below carry it: a reader
     entitled to know their list is a few minutes old is entitled to know it in
     the failure case too, which is exactly when it matters most. */
  if (body.reading !== null && body.reading !== undefined) {
    const from = body.from === 'gh' ? 'gh' : 'cache'
    return { at: 'read', project, live: body.reading, from, trouble }
  }

  if (trouble) return { at: 'trouble', project, trouble }

  /* No reading, no trouble. Nothing in `doors.ts` produces this, and it is
     drawn rather than ignored because the alternative to a sentence here is a
     page that goes blank when the two halves of this program disagree. */
  return {
    at: 'trouble',
    project,
    trouble: doorTrouble('This app’s own server answered without a reading and without saying why, which is a shape nothing in this program is supposed to produce.'),
  }
}
