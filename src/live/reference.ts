/**
 * One row, as this app understands one.
 *
 * The protocol package is explicit that a response is `unknown`: "a client that
 * asserted a shape here would be asserting something no host promised." So this
 * type is not a claim about what a host sends. It is what this app has managed
 * to read out of what a host sent, which is a different thing, and the fields
 * are shaped for that — every one of them is either something we definitely
 * read or an honest blank, and none of them is a guess.
 *
 * The pointed absences:
 *
 * - `title` may be empty. A row with no title is a row; a row silently dropped
 *   for having no title is a reference nobody will ever look for again.
 * - `url` may be null, and is NEVER constructed. Building
 *   `https://github.com/…` out of a ref and a guess at the repository produces
 *   a link that looks right, opens, and is somewhere else.
 * - `state` may be null, for the same reason: a state we could not read is not
 *   `open`, and drawing it as open would be this app inventing the one fact
 *   somebody came here to check.
 */

/** Which tracker it lives on, as the host's reading says — the row's `tracker`, never parsed out of the ref. */
export type Origin = 'gitlab' | 'github'

/**
 * Issue or change, and `change` covers both a merge request and a pull request.
 *
 * One word for the two because they are the same thing under two trackers'
 * names, and a filter offering "merge requests" and "pull requests" separately
 * would be asking somebody to know which tracker a repository is on before they
 * can look for their own work. The identifier still shows which it is: `!1848`
 * is GitLab's spelling and `gh#2073` is GitHub's, and neither is translated.
 */
export type Kind = 'issue' | 'change'

/**
 * The three words the shared reading uses, which are the facets module's words
 * too — so a row with a state IS a `Sighting`, with nothing to translate. Null
 * when the row could not be read at all.
 */
export type State = 'open' | 'closed' | 'merged'

export interface Reference {
  /**
   * A stable key for this row, distinct from `ref`.
   *
   * The shared reading answers one row per spelling, and `collect` keeps the
   * first of any spelling handed twice, so `ref` happens to be unique today.
   * The key still says which tracker, repository and number the row is, so
   * that two spellings of one item — `gh#41` and `gh:owner/repo#41`, which the
   * protocol says are two rows — are told apart by React by more than luck.
   */
  key: string
  /** As people write it: `#2274`, `!1848`, `gh#41`. */
  ref: string
  kind: Kind
  origin: Origin
  state: State | null
  /**
   * Why the tracker says it closed, in the tracker's own word — GitHub's
   * `stateReason`: `COMPLETED`, `NOT_PLANNED`, `DUPLICATE`. Null where the
   * row carried none, which is every GitLab row and every change.
   * Passed to the facets module as it arrived; `deriveDisposition` there is
   * what reads it.
   */
  stateReason: string | null
  /**
   * True when the reading says a change that closes this issue has merged —
   * GitLab's only sign that a closed issue was done, since GitLab records no
   * reason. The row's own `closedByMerge`, or its `closed-by` links to a merged
   * change in the same reading; never guessed from a title. See `collect.ts`.
   */
  closedByMerge: boolean
  /** A change the tracker says is not finished being written. Never inferred. */
  draft: boolean
  title: string
  /** When it last moved, as the tracker wrote it. An opaque string here. */
  at: string
  url: string | null
  labels: string[]
  /**
   * Whoever the tracker names on it, in one list, deduped and in the order it
   * named them: assignees for an issue; author, assignees and reviewers for a
   * change. Flattened because the question this surface answers is "who is on
   * it", and three separate columns for that answer would cost the width that
   * the title needs.
   */
  people: string[]
  /**
   * The row filed under this reference was not a row the protocol describes —
   * it named a ref, and little else this app could read.
   *
   * It earns a field because the alternative is a row that is simply blank, and
   * a blank row invites the reader to assume this app failed to draw it. It did
   * not: it drew what it was given. The row says so, and the reference stays on
   * the list where somebody can go and look it up by hand.
   */
  unreadable: boolean
}
