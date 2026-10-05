import {
  TRACKER_REFRESH_WITHIN_MS,
  trackerMissingSchema,
  trackerRefreshResult,
  trackerSourceSchema,
  type TrackerMissing,
  type TrackerSource,
} from 'kehikot-module-protocol'
import { HostRefused, type AskOptions } from 'kehikot-module-protocol/client'
import { z } from 'zod'

import type { Held, Trouble } from './sight.ts'

/**
 * Asking the host for the project's tracker reading, and asking it to read again.
 *
 * ## Why the page asks the host and not its own server
 *
 * It used to ask its own server, which ran `gh` in the project folder and so
 * saw GitHub and nothing else. Issue #4: a GitLab project showed its issues and
 * merge requests only through a hand-imported snapshot, and then refused to
 * refresh, because a GitHub-only read would have replaced the imported rows. The
 * host holds the person's logged-in CLIs for both trackers and reads once for
 * every module on the canvas, so the reading is asked of it — `tracker.get`
 * with `project: true`, which is everything the host reads for the project:
 * the refs every epic names, the refs modules have asked about, and the most
 * recent issues and changes of each listed source. The scope References shows.
 *
 * Nothing reads a tracker twice any more. This app holds no credential, starts
 * no subprocess, and keeps no copy beside the project.
 *
 * ## Reading the answer as if it came from a stranger
 *
 * `request` resolves `unknown` by design. The envelope — when, whether a read
 * is in flight, the sources, what is missing — is parsed, and an answer that
 * does not carry one is a `trouble` with a sentence. The rows are NOT parsed
 * here: see `Held` in `sight.ts` for why one odd row must not cost the rest.
 */

/** The `request` this file asks with: the connection's own, handed in so a test can be the host. */
export type Ask = (method: string, params?: Record<string, unknown>, options?: AskOptions) => Promise<unknown>

/** What the host's reading must at least say about itself. The rows are read in `collect.ts`. */
const envelope = z.object({
  at: z.string().datetime({ offset: true }).nullable().default(null),
  refreshing: z.boolean().default(false),
  sources: z.array(z.unknown()).default([]),
  missing: z.array(z.unknown()).default([]),
  rows: z.array(z.unknown()).default([]),
})

/** A host's refusal, as a `Trouble`. Anything that is not a refusal is this page failing, and says so. */
export function troubleFrom(error: unknown): Trouble {
  if (error instanceof HostRefused) {
    if (error.refusal.reason === 'unknown-method') {
      return {
        kind: 'unknown-method',
        why: 'This host does not hand out a shared tracker reading, so there is nothing for this list to show.',
        said: error.refusal.error || null,
      }
    }
    return { kind: 'refused', why: error.refusal.error || 'The host would not hand over its tracker reading, and did not say why.', said: null }
  }
  return {
    kind: 'unreadable',
    why: 'This app failed while reading the host’s answer.',
    said: error instanceof Error ? error.message : null,
  }
}

/**
 * The reading as the host holds it, or why there is none.
 *
 * Never rejects: every way this can go wrong is a state the page draws, and a
 * rejection would be one of them arriving at a `catch` that could only say
 * "something went wrong".
 *
 * Sources and missing refs are read entry by entry, like rows, so one entry a
 * version ahead is one entry not described rather than a reading refused.
 */
export async function askReading(ask: Ask): Promise<{ ok: true; reading: Held } | { ok: false; trouble: Trouble }> {
  let answer: unknown
  try {
    answer = await ask('tracker.get', { project: true })
  } catch (error) {
    return { ok: false, trouble: troubleFrom(error) }
  }
  const read = envelope.safeParse(answer)
  if (!read.success) {
    return {
      ok: false,
      trouble: {
        kind: 'unreadable',
        why: 'The host answered with something this app cannot read as a tracker reading, which means the two are a version apart.',
        said: null,
      },
    }
  }
  const sources = read.data.sources.flatMap((one): TrackerSource[] => {
    const source = trackerSourceSchema.safeParse(one)
    return source.success ? [source.data] : []
  })
  const missing = read.data.missing.flatMap((one): TrackerMissing[] => {
    const gap = trackerMissingSchema.safeParse(one)
    return gap.success ? [gap.data] : []
  })
  return {
    ok: true,
    reading: { at: read.data.at, refreshing: read.data.refreshing, sources, missing, rows: read.data.rows },
  }
}

/**
 * Ask the host to read the trackers again, and say what came of it.
 *
 * For the whole project, because that is what this list shows, and every other
 * module in the project is told through `context.tracker` when it lands. The
 * host joins a refresh already running rather than starting a second, so two
 * presses are one read.
 *
 * Waited on for `TRACKER_REFRESH_WITHIN_MS` rather than the wire's twelve
 * seconds: a read of a few hundred refs over two trackers takes longer than a
 * question. Timing out anyway loses nothing — the read goes on, and the
 * context says when it lands.
 *
 * `null` is "it was read". A sentence is anything else — `failed`, `declined`,
 * or a refusal — which the page draws beside the rows, because a refresh that
 * silently did nothing reads as a broken button.
 */
export async function askRefresh(ask: Ask): Promise<string | null> {
  let answer: unknown
  try {
    answer = await ask('tracker.refresh', { project: true }, { within: TRACKER_REFRESH_WITHIN_MS })
  } catch (error) {
    return troubleFrom(error).why
  }
  const said = trackerRefreshResult.safeParse(answer)
  if (!said.success) return null
  if (said.data.outcome === 'read') return null
  if (said.data.why) return said.data.why
  return said.data.outcome === 'declined'
    ? 'The host declined to read the trackers again.'
    : 'The host could not read every tracker again; the rows below are as each was last read.'
}
