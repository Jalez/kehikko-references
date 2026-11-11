import { rmSync } from 'node:fs'

import { moduleFile } from 'kehikot-module-protocol'
import { KNOWN_PROJECTS_RETRY_MS, watchKnownProjects, type KnownProjectsOptions } from 'kehikot-module-protocol/serve'

import { ID } from './manifest.ts'

/**
 * The record 3.28.0 kept of what it had told the agents at each place,
 * `<project>/.kehikot/references/told.json`, removed (3.29.0). Kehikot itself
 * now tells the agent sessions at an epic about new activity on its items, so
 * this module no longer tells them, and keeps nothing for it.
 *
 * At start, the server asks the host which projects this module keeps its
 * folder in (`projects.mine`, under `agents:message`) and removes the file in
 * each. Once the host has answered it stops asking; a file that is not there
 * is nothing to do. A host that does not answer is no reason to fail: the
 * file is then left, read by nothing.
 */
export const TOLD = 'told'

/** Remove the old record from one project. Answers whether there was one. */
export function forgetTold(project: string): boolean {
  const file = moduleFile(project, ID, TOLD)
  if (!file) return false
  try {
    rmSync(file)
    return true
  } catch {
    return false
  }
}

/** Ask the host for this module's projects until it answers (or says it never will), and forget the record in each. */
export function forgetToldEverywhere(options: Partial<Pick<KnownProjectsOptions, 'ask' | 'log'>> & { retryMs?: number } = {}): Promise<void> {
  const { retryMs = KNOWN_PROJECTS_RETRY_MS, ...rest } = options
  const watch = watchKnownProjects({ module: ID, know: (path) => void forgetTold(path), ...rest })
  return new Promise((done) => {
    const look = () =>
      void watch.tick().then((tick) => {
        if (tick.said !== 'not-now') return done()
        const timer = setTimeout(look, retryMs)
        ;(timer as { unref?: () => void }).unref?.()
      })
    look()
  })
}
