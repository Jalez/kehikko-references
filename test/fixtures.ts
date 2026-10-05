import { readTrackerRef, type TrackerReading } from 'kehikot-module-protocol'

/**
 * Rows and readings in the shape the host's `tracker.get` answers with.
 *
 * Built from the ref, the way a host would: the spelling says which tracker,
 * and for GitLab which kind; everything else is defaulted to something the
 * protocol's schema accepts, and overridden by the case.
 */
export function row(ref: string, more: Record<string, unknown> = {}): Record<string, unknown> {
  const name = readTrackerRef(ref)
  const tracker = name?.tracker ?? 'github'
  const number = name?.number ?? 1
  const kind = name?.kind ?? 'issue'
  const repo = name?.repo ?? (tracker === 'github' ? 'example/repo' : 'group/project')
  const host = tracker === 'github' ? 'github.com' : 'gitlab.com'
  return {
    ref,
    tracker,
    host,
    repo,
    number,
    kind,
    state: 'open',
    title: `the thing that has to become true, number ${number}`,
    url: `https://${host}/${repo}/${kind === 'change' ? 'pull' : 'issues'}/${number}`,
    labels: [],
    assignees: [],
    links: [],
    updatedAt: '2026-08-20T10:00:00Z',
    readAt: '2026-08-27T09:12:00Z',
    ...more,
  }
}

/** A whole reading, with one GitHub source that read cleanly unless the case says otherwise. */
export function reading(rows: Record<string, unknown>[], more: Partial<TrackerReading> = {}): Record<string, unknown> {
  return {
    at: '2026-08-27T09:12:00Z',
    refreshing: false,
    sources: [
      {
        tracker: 'github',
        host: 'github.com',
        repo: 'example/repo',
        default: true,
        listed: true,
        at: '2026-08-27T09:12:00Z',
        error: null,
        refreshing: false,
      },
    ],
    rows,
    missing: [],
    ...more,
  }
}
