import type { PipelineState } from 'kehikot-module-protocol'

import { agoSaid } from './markers.ts'
import type { Reference } from './reference.ts'

/**
 * A change's pipeline, as the row marker draws it (issue #38).
 *
 * `state` is the reading's word (protocol `pipeline`: GitLab's words, with
 * GitHub's check rollup mapped onto them by the host). `url` and `at` came later
 * (protocol 2.34.0 `pipelineUrl`, `pipelineAt`) and an older host leaves them
 * out: the marker is then drawn without a link and without a time, never with a
 * guessed one. No pipeline in the reading, no marker.
 */
export interface Pipeline {
  state: PipelineState
  /** Where a person sees it, `http(s):`, as the reading said. Never built here. */
  url?: string
  /** When its state last moved, as the reading said. */
  at?: string
}

/**
 * What a person calls each state. `success` is the forge's word and "passed" is
 * the one people say about a pipeline; the rest are the same word.
 */
export const PIPELINE_WORD: Record<PipelineState, string> = {
  success: 'passed',
  failed: 'failed',
  running: 'running',
  pending: 'pending',
  canceled: 'canceled',
  skipped: 'skipped',
  manual: 'waiting for a manual step',
}

/** `Pipeline: failed · 12 min ago`, or without the time when the reading gave none. */
export function pipelineSaid(pipeline: Pipeline, now: number): string {
  const said = `Pipeline: ${PIPELINE_WORD[pipeline.state]}`
  return pipeline.at && !Number.isNaN(Date.parse(pipeline.at)) ? `${said} · ${agoSaid(pipeline.at, now)}` : said
}

/**
 * The refs the "Pipeline failing" option narrows to: open changes whose pipeline
 * failed. `null` when no row in the reading has a pipeline at all — an older host,
 * or a project with none — and then the option is not offered, since one that
 * could only ever say 0 would be a claim nobody made.
 */
export function failingRefs(rows: readonly Reference[]): string[] | null {
  if (!rows.some((row) => row.pipeline)) return null
  return rows.filter((row) => row.kind === 'change' && row.state === 'open' && row.pipeline?.state === 'failed').map((row) => row.ref)
}
