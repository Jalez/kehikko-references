import type { TrackerSource } from 'roadmap-module-protocol'

import { ageOf } from './heading.tsx'

/**
 * The sources whose last read failed, one sentence each, over the rows they
 * gave before.
 *
 * ## Why per source
 *
 * The shared reading keeps a failed source's rows rather than blanking them,
 * with `sources[].error` saying why they are not newer — which is the state the
 * old cache beside the project existed to draw, now kept by the host for every
 * module. "GitLab failed" is less use than "gitlab.example.org could not be
 * reached" when a project reads two GitLab hosts, so each is named with its
 * host and repository, its own error in the host's words, and the age of what
 * it last gave.
 *
 * Nothing is drawn for a source that read cleanly: the heading's age covers it,
 * and a line per healthy source would be chrome over every list.
 */
export function SourceTrouble({ sources, now }: { sources: readonly TrackerSource[]; now?: number }) {
  const failed = sources.filter((source) => source.error)
  if (!failed.length) return null
  return (
    <div data-sources="trouble" className="border-b border-border bg-destructive/10 px-3 py-1.5 text-xs text-muted-foreground">
      {failed.map((source) => (
        <p key={`${source.tracker}:${source.host}/${source.repo}`} className="break-words">
          <span className="font-mono text-foreground">
            {source.host}/{source.repo}
          </span>{' '}
          could not be read: {source.error}{' '}
          {source.at
            ? `Its rows below are as it was last read (${ageOf(source.at, now)}).`
            : 'It has never been read, so nothing below comes from it.'}
        </p>
      ))}
    </div>
  )
}
