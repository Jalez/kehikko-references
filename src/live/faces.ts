import type { TrackerPerson, TrackerReviewer, TrackerRow } from 'kehikot-module-protocol'

/**
 * People's faces: the tiny avatars the assignee and reviewer markers draw
 * (protocol 2.10.0 `people`). Pure, except for the one image policy a page
 * pins (`pinImagePolicy`).
 *
 * ## Where a picture may come from
 *
 * The host hands over whatever URL the tracker gave, made absolute and
 * `https:`. That is not enough to load it: a picture is a request this page
 * makes, with the person's IP on it, to whoever the URL names. So a picture is
 * loaded only from the forge's own avatar hosts:
 *
 * - **GitHub**: `avatars.githubusercontent.com`, and nothing else.
 * - **GitLab**: the row's own GitLab host (its `/uploads/…` pictures), and
 *   `secure.gravatar.com`, the CDN GitLab hands out for a person with no
 *   upload — only on a GitLab row, i.e. only when GitLab returned it.
 *
 * Anything else — another host, `http:`, a URL with credentials in it — is
 * refused here, and the face falls back to initials. The page's own Content
 * Security Policy says the same (`img-src`), so a picture this check would
 * refuse cannot be loaded by anything else on the page either; see
 * `pinImagePolicy`. Every `<img>` is `referrerpolicy="no-referrer"` and
 * `loading="lazy"`.
 */

export const GITHUB_AVATARS = 'avatars.githubusercontent.com'
export const GRAVATAR = 'secure.gravatar.com'

/** A host name a policy may name: letters, digits, dots and dashes, an optional port. Never a wildcard. */
const HOST = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?$/

const hostOf = (host: string): string | null => {
  const h = host.trim().toLowerCase()
  return HOST.test(h) ? h : null
}

/** The hosts a row's pictures may come from, by its tracker and its tracker's host. */
export function avatarHostsFor(tracker: TrackerRow['tracker'], host: string): string[] {
  if (tracker === 'github') return [GITHUB_AVATARS]
  const own = hostOf(host)
  return own ? [own, GRAVATAR] : [GRAVATAR]
}

/** Whether a picture URL is one this page may load for a row of this tracker and host. */
export function avatarAllowed(url: string, tracker: TrackerRow['tracker'], host: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' || u.username || u.password) return false
  return avatarHostsFor(tracker, host).includes(u.host.toLowerCase())
}

/** One person on a marker: their login when the host said it, a name to say, and a picture this page may load. */
export interface Face {
  login: string | null
  /** What the tooltip and the `alt` say: their display name, else their login. */
  name: string
  avatarUrl: string | null
}

/** A reviewer's face, with where their review stands: the badge on the picture. */
export interface ReviewerFace extends Face {
  state: TrackerReviewer['state']
}

/** A person in the row's `people` map, by login; exact first, then ignoring case. Never a prototype key. */
function personOf(people: Record<string, TrackerPerson> | undefined, login: string): TrackerPerson | undefined {
  if (!people) return undefined
  if (Object.hasOwn(people, login)) return people[login]
  const lower = login.toLowerCase()
  const key = Object.keys(people).find((k) => k.toLowerCase() === lower)
  return key === undefined ? undefined : people[key]
}

/** A face for a login on this row, with its picture only when this page may load it. */
export function faceOf(row: Pick<TrackerRow, 'people' | 'tracker' | 'host'>, login: string, name?: string): Face {
  const person = personOf(row.people, login)
  const url = person?.avatarUrl
  return {
    login,
    name: name || person?.name || login,
    avatarUrl: url && avatarAllowed(url, row.tracker, row.host) ? url : null,
  }
}

/**
 * Who is assigned, as faces. By login when the host said them (2.7.0); an
 * older host's display names become faces with no login and no picture, so
 * the marker still draws initials rather than nothing.
 */
export function assignedFaces(row: Pick<TrackerRow, 'people' | 'tracker' | 'host' | 'assignees' | 'assigneeLogins'>): Face[] {
  if (row.assigneeLogins?.length) return row.assigneeLogins.map((login) => faceOf(row, login))
  return row.assignees.map((name) => ({ login: null, name, avatarUrl: null }))
}

/** A change's reviewers, as faces with their state, in the host's order. */
export function reviewerFaces(row: Pick<TrackerRow, 'people' | 'tracker' | 'host' | 'reviewers'>): ReviewerFace[] | undefined {
  return row.reviewers?.map((r) => ({ ...faceOf(row, r.login, r.name), state: r.state }))
}

/** Initials for a face with no picture: the first letters of the first and last words, or one letter. */
export function initialsOf(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s._-]/gu, '')
    .split(/[\s._-]+/)
    .filter(Boolean)
  if (!words.length) return '?'
  const first = [...words[0]!][0]!
  const last = words.length > 1 ? [...words[words.length - 1]!][0]! : ''
  return (first + last).toUpperCase()
}

/** How many faces a marker draws before it says `+N` for the rest. */
export const FACES_SHOWN = 3

/** The faces a marker draws and how many more it does not. */
export function facesShown<T extends Face>(faces: readonly T[]): { shown: T[]; more: number } {
  return { shown: faces.slice(0, FACES_SHOWN), more: Math.max(0, faces.length - FACES_SHOWN) }
}

/**
 * How wide, in pixels, a faces marker is with this many people: 16 for the
 * first face, 12 for each one after it (they overlap by 4), 12 for a `+N`,
 * and 4 of padding. Nobody: 0.
 */
export function facesWidth(count: number): number {
  if (count <= 0) return 0
  const drawn = Math.min(count, FACES_SHOWN) + (count > FACES_SHOWN ? 1 : 0)
  return 16 + (drawn - 1) * 12 + 4
}

/**
 * The width of the assigned and the review columns for a whole list: the widest
 * either marker is on any of its rows. From 24rem of the frame every row's
 * marker and empty slot is that wide, so the columns line up down the list —
 * and a list where nobody has more than one assignee pays for one face, not
 * three and a `+N`.
 */
export function facesColumns(rows: ReadonlyArray<{ assignedFaces: readonly unknown[]; reviewerFaces?: readonly unknown[] }>): {
  assigned: number
  review: number
} {
  let assigned = 0
  let review = 0
  for (const row of rows) {
    assigned = Math.max(assigned, facesWidth(row.assignedFaces.length))
    review = Math.max(review, facesWidth(row.reviewerFaces?.length ?? 0))
  }
  return { assigned, review }
}

/* ------------------------------------------------------------------------ *
 * The page's image policy
 * ------------------------------------------------------------------------ */

/**
 * Every avatar host a reading's sources and rows may give pictures from,
 * each once: what the page's `img-src` names.
 */
export function avatarHostsOf(of: ReadonlyArray<{ tracker: TrackerRow['tracker']; host: string }>): string[] {
  return [...new Set(of.flatMap((one) => avatarHostsFor(one.tracker, one.host)))].sort()
}

/**
 * The avatar hosts of one reading as this page holds it: its sources, and the
 * rows' own trackers and hosts (a qualified ref can name another GitLab).
 * Rows are read loosely — they have not been through the schema here.
 */
export function avatarHostsOfReading(reading: { sources: ReadonlyArray<{ tracker: TrackerRow['tracker']; host: string }>; rows: readonly unknown[] }): string[] {
  const named = reading.rows.flatMap((raw) => {
    const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
    const tracker: TrackerRow['tracker'] | null = r.tracker === 'github' ? 'github' : r.tracker === 'gitlab' ? 'gitlab' : null
    return tracker && typeof r.host === 'string' ? [{ tracker, host: r.host }] : []
  })
  return avatarHostsOf([...reading.sources, ...named])
}

/** The `img-src` directive for these hosts: this page's own origin and exactly those, `https:` only. */
export function imgSrcPolicy(hosts: readonly string[]): string {
  const named = hosts.map(hostOf).filter((h): h is string => h !== null)
  return ["img-src 'self'", ...named.map((h) => `https://${h}`)].join(' ')
}

let pinned: Set<string> | null = null

/**
 * Pin the page's `img-src` to these hosts, once: a `<meta http-equiv="Content-Security-Policy">`
 * in the head, which the browser enforces from then on for every image on the page.
 *
 * Why at run time and not in the served page: which GitLab host a project
 * reads is known only from its reading, and a self-hosted GitLab's pictures
 * are on that host. A policy can be narrowed after the page loads but never
 * widened — a second policy only adds a second test every image must pass — so
 * it is pinned once, from the first reading that names a source, and not
 * again. A later reading's host that the pinned policy does not name shows
 * initials until the page is loaded again (`imageLoadable` says so before an
 * image is even asked for). Until a policy is pinned no picture is drawn.
 */
export function pinImagePolicy(hosts: readonly string[], doc: Document | undefined = globalThis.document): ReadonlySet<string> | null {
  if (pinned || !hosts.length || !doc?.head) return pinned
  const meta = doc.createElement('meta')
  meta.httpEquiv = 'Content-Security-Policy'
  meta.content = imgSrcPolicy(hosts)
  meta.dataset.avatars = ''
  doc.head.appendChild(meta)
  pinned = new Set(hosts.map(hostOf).filter((h): h is string => h !== null))
  return pinned
}

/** The hosts the pinned policy names, or null before one is pinned. */
export function pinnedImageHosts(): ReadonlySet<string> | null {
  return pinned
}

/** For tests only: forget the pinned hosts. A browser cannot take a policy back. */
export function unpinImagePolicyForTests(): void {
  pinned = null
}

/** Whether the page will load this picture: a policy is pinned and names its host. */
export function imageLoadable(url: string): boolean {
  if (!pinned) return false
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && pinned.has(u.host.toLowerCase())
  } catch {
    return false
  }
}
