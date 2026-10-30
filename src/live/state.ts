import type { Reference } from './reference.ts'

/**
 * A row's state as a person says it, and which glyph and tone draw it.
 *
 * The glyph is the signal and the colour the second telling: every state has
 * its own shape (never colour alone), and the words — "Merge request · open",
 * "Issue · closed by !4019" — are the badge's tooltip and its `aria-label`.
 */

export type StateLook =
  | 'change-open'
  | 'change-draft'
  | 'change-merged'
  | 'change-closed'
  | 'issue-open'
  | 'issue-done'
  | 'issue-closed'
  | 'issue-not-planned'
  | 'unseen'

/** What the row is, in its tracker's words, capitalised for the front of a sentence. */
export function kindSaid(row: Pick<Reference, 'kind' | 'origin'>): string {
  if (row.kind === 'issue') return 'Issue'
  return row.origin === 'github' ? 'Pull request' : 'Merge request'
}

/** Which of the looks a row has. */
export function stateLook(row: Pick<Reference, 'kind' | 'state' | 'draft' | 'stateReason' | 'closedByMerge'>): StateLook {
  if (row.state === null) return 'unseen'
  if (row.kind === 'change') {
    if (row.state === 'merged') return 'change-merged'
    if (row.state === 'closed') return 'change-closed'
    return row.draft ? 'change-draft' : 'change-open'
  }
  if (row.state === 'open') return 'issue-open'
  if (row.stateReason === 'NOT_PLANNED' || row.stateReason === 'DUPLICATE') return 'issue-not-planned'
  if (row.closedByMerge || row.stateReason === 'COMPLETED') return 'issue-done'
  return 'issue-closed'
}

/** The words: "Merge request · open", "Issue · closed by !4019", "Issue · closed as not planned". */
export function stateSaid(
  row: Pick<Reference, 'kind' | 'origin' | 'state' | 'draft' | 'stateReason' | 'closedByMerge' | 'closedBy'>,
): string {
  const kind = kindSaid(row)
  const look = stateLook(row)
  switch (look) {
    case 'unseen':
      return `${kind} · state not read`
    case 'change-open':
    case 'issue-open':
      return `${kind} · open`
    case 'change-draft':
      return `${kind} · draft`
    case 'change-merged':
      return `${kind} · merged`
    case 'change-closed':
      return `${kind} · closed`
    case 'issue-not-planned':
      return row.stateReason === 'DUPLICATE' ? `${kind} · closed as a duplicate` : `${kind} · closed as not planned`
    case 'issue-done':
    case 'issue-closed':
      return row.closedBy?.length ? `${kind} · closed by ${row.closedBy.join(', ')}` : `${kind} · closed`
  }
}
