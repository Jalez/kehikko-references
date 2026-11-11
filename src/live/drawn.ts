import type { CoverState } from 'kehikot-module-protocol/client/react'

import type { Sight } from './sight.ts'

/**
 * Whether the page shows what it was opened for: the moment to say `ready()` and have the host take
 * its cover off (protocol 2.70.0).
 *
 * Not while waiting to be greeted, and not while the host is reading this project's trackers for
 * the first time with nothing to show yet: the host's cover stands for that wait. Drawn: the list,
 * an empty or troubled reading, or a sentence of the shared cover the page draws itself (nothing
 * framing it, no project, its own server down). Pure, for the tests.
 */
export function drawnOf(cover: CoverState | null, sight: Sight, waiting: boolean): boolean {
  if (cover) return cover !== 'waiting'
  if (sight.at === 'read') return !waiting
  return sight.at === 'trouble'
}

/** What the host's cover says while this page reads the references it shows (protocol 2.84.0). */
export const LOADING_REFERENCES = 'Loading references…'
