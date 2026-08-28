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
 *   `opened`, and drawing it as open would be this app inventing the one fact
 *   somebody came here to check.
 */

/** Which tracker filed it. Read from which bag it was in, never parsed out of the ref. */
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

/** The three words a tracker uses. Null when the reading did not contain one. */
export type State = 'opened' | 'closed' | 'merged'

export interface Reference {
  /**
   * A stable key for this row, distinct from `ref`.
   *
   * `ref` is not unique and cannot be made so: GitHub numbers issues and pull
   * requests in one sequence, so `gh#41` is filed under `ghIssues` or `ghPrs`
   * and a refresh that put the same number in both — which is a bug in a
   * refresher, but is a bug this app might be handed — produces two rows that
   * spell themselves identically. Keying the list by `ref` would make React
   * draw one of them and the other would be gone with nothing said. So the key
   * carries the bag it came out of, and both rows appear.
   */
  key: string
  /** As people write it: `#2274`, `!1848`, `gh#41`. */
  ref: string
  kind: Kind
  origin: Origin
  state: State | null
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
   * The reading filed under this reference was not a reading — not an object at
   * all, but a null, a number, a string.
   *
   * It earns a field because the alternative is a row that is simply blank, and
   * a blank row invites the reader to assume this app failed to draw it. It did
   * not: it drew what it was given. The row says so, and the reference stays on
   * the list where somebody can go and look it up by hand.
   */
  unreadable: boolean
}
