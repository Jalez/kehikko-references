import type { TrackerSource } from 'kehikot-module-protocol'

/**
 * What a person is told about a source that could not be read, and which of those
 * they have closed.
 *
 * ## The words
 *
 * The host hands over the tracker command's own error ("The command execution has
 * been interrupted"), which says what the tool said and nothing about what to do.
 * `troubleSaid` maps the causes that are known to a plain sentence with the next
 * step, and keeps the raw text for a tooltip. Anything not recognised is shown as
 * the host said it: guessing a cause for an error we do not know would be worse.
 *
 * ## Closing
 *
 * A closed notice is a failure of one source with one error: `quietKey`. It stays
 * closed while that same failure stands, and comes back when the source fails
 * differently, and when it fails again after a read that worked (`stillFailing`
 * forgets a key the moment its source stops failing). Kept per kehikko with the
 * rest of the kept state (`keep.ts`), never in browser storage.
 */

/** A source's identity, as the reading names it. */
export const sourceId = (source: Pick<TrackerSource, 'tracker' | 'host' | 'repo'>): string => `${source.tracker}:${source.host}/${source.repo}`

/** One closed failure: the source and the error it closed on, the error cut short so the kept string stays small. */
export const quietKey = (source: Pick<TrackerSource, 'tracker' | 'host' | 'repo' | 'error'>): string =>
  `${sourceId(source)}\n${(source.error ?? '').slice(0, 80)}`

/** The sources that failed. */
export const failedOf = (sources: readonly TrackerSource[]): TrackerSource[] => sources.filter((source) => source.error)

/** The failed sources whose notice has not been closed. */
export function shownTroubles(sources: readonly TrackerSource[], quiet: readonly string[] | undefined): TrackerSource[] {
  const closed = new Set(quiet ?? [])
  return failedOf(sources).filter((source) => !closed.has(quietKey(source)))
}

/** Close these notices: the keys, added to what was closed already. */
export function closing(quiet: readonly string[] | undefined, sources: readonly TrackerSource[]): string[] {
  return [...new Set([...(quiet ?? []), ...sources.map(quietKey)])]
}

/** What is still worth remembering as closed: only a failure that is still standing. A source that read cleanly forgets it. */
export function stillFailing(quiet: readonly string[], sources: readonly TrackerSource[]): string[] {
  const standing = new Set(failedOf(sources).map(quietKey))
  return quiet.filter((key) => standing.has(key))
}

export interface TroubleWords {
  /** The cause, plain, and what to do. */
  said: string
  /** The host's own text, for a "Details" tooltip. */
  details: string
  /** Whether the words are the app's own (a known cause) rather than the host's text passed through. */
  known: boolean
}

const AUTH = /\b401\b|not (?:logged|signed) in|unauthori[sz]ed|unauthenticated|bad credentials|authentication (?:failed|required)|auth login|no token|invalid token/i
const NETWORK = /could not (?:be reached|resolve)|couldn'?t (?:reach|resolve)|unreachable|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|no route to host|dial tcp|unable to connect|connection (?:refused|reset)|network is|no such host|i\/o timeout|tls handshake/i
const TIMEOUT = /interrupted|time(?:d)? ?out|deadline exceeded|ETIMEDOUT|killed|aborted|cancel+ed/i

/** The sign-in command for a tracker's own CLI. */
const signIn = (source: Pick<TrackerSource, 'tracker' | 'host'>): { tool: string; command: string } =>
  source.tracker === 'gitlab'
    ? { tool: 'glab', command: `glab auth login --hostname ${source.host}` }
    : { tool: 'gh', command: `gh auth login --hostname ${source.host}` }

/** A source's error in plain words, with what to do about it where the cause is known. */
export function troubleSaid(source: Pick<TrackerSource, 'tracker' | 'host' | 'error'>): TroubleWords {
  const raw = (source.error ?? '').trim()
  if (AUTH.test(raw)) {
    const { tool, command } = signIn(source)
    return { said: `${tool} isn't signed in for ${source.host}; run \`${command}\`.`, details: raw, known: true }
  }
  if (NETWORK.test(raw)) return { said: `Couldn't reach ${source.host}. Check the connection, then try again.`, details: raw, known: true }
  if (TIMEOUT.test(raw)) return { said: 'Reading timed out or was interrupted; try again.', details: raw, known: true }
  return { said: raw || 'The host gave no reason.', details: raw, known: false }
}
