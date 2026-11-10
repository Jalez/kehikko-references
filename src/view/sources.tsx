import type { TrackerSource } from 'kehikot-module-protocol'

import { ageOf } from './heading.tsx'
import { shownTroubles, sourceId, troubleSaid } from '@/live/trouble.ts'

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
export function SourceTrouble({
  sources,
  now,
  quiet,
  busy = false,
  onRetry,
  onClose,
}: {
  sources: readonly TrackerSource[]
  now?: number
  /** The failures the person closed on this kehikko (`trouble.ts`): not drawn. */
  quiet?: readonly string[]
  /** A read is under way: "Reading…" in place of "Try again". */
  busy?: boolean
  /** Ask for a fresh read. Without it there is no button. */
  onRetry?: () => void
  /** Close one notice until the source fails differently. */
  onClose?: (source: TrackerSource) => void
}) {
  const failed = shownTroubles(sources, quiet)
  if (!failed.length) return null
  return (
    <div data-sources="trouble" className="border-b border-border bg-destructive/10 px-3 py-1.5 text-xs text-muted-foreground">
      {failed.map((source) => {
        const words = troubleSaid(source)
        return (
          <p key={sourceId(source)} className="flex items-start gap-2 break-words">
            <span className="min-w-0 flex-1">
              <span className="font-mono text-foreground">
                {source.host}/{source.repo}
              </span>{' '}
              could not be read:{' '}
              <span data-trouble="said" title={words.known ? `Details: ${words.details}` : undefined}>
                {words.said}
              </span>{' '}
              {source.at
                ? `Its rows below are as it was last read (${ageOf(source.at, now)}).`
                : 'It has never been read, so nothing below comes from it.'}
            </span>
            {onRetry && (
              <button
                type="button"
                data-trouble="retry"
                disabled={busy}
                onClick={onRetry}
                className="shrink-0 rounded px-1.5 py-0.5 text-foreground underline underline-offset-2 hover:bg-muted disabled:no-underline disabled:opacity-70"
              >
                {busy ? 'Reading…' : 'Try again'}
              </button>
            )}
            {onClose && (
              <button
                type="button"
                data-trouble="close"
                aria-label={`Dismiss the notice about ${source.host}/${source.repo}`}
                title="Dismiss until it fails differently"
                onClick={() => onClose(source)}
                className="shrink-0 rounded px-1.5 py-0.5 text-foreground hover:bg-muted"
              >
                ×
              </button>
            )}
          </p>
        )
      })}
    </div>
  )
}
