import type { MyRole } from 'kehikot-module-protocol'

import type { Reference } from './reference.ts'

/**
 * My role: what the person is on each reference — asked to review it, has
 * reviewed it, wrote it, is assigned it — as the host worked it out from who
 * they are on that tracker (protocol 2.7.0 `myRoles`). This module computes
 * nothing about people; it says the host's answer in words and narrows to it.
 *
 * The point of it is one question a person asks every morning: which changes
 * are waiting on my review? So the reviewer roles come first in the words, and
 * the Scope group can narrow to them in one press (`sift.ts`).
 */

/** What each role is called, on the row and in its tooltip. */
export const ROLE_WORDS: Record<MyRole, string> = {
  'reviewer-asked': 'Reviewer (asked)',
  'reviewer-done': 'Reviewer (done)',
  author: 'Author',
  assignee: 'Assignee',
}

/** The order the words are said in: the reviewer first, since that is what a person looks for. */
const ORDER: readonly MyRole[] = ['reviewer-asked', 'reviewer-done', 'author', 'assignee']

/** The roles in words, `Reviewer (asked) · Author`; '' for none or not known. */
export function roleSaid(roles: readonly MyRole[] | undefined): string {
  if (!roles?.length) return ''
  return ORDER.filter((role) => roles.includes(role))
    .map((role) => ROLE_WORDS[role])
    .join(' · ')
}

/** The refs each role option of the Scope group narrows to. */
export interface RoleRefs {
  /** Rows where the person is asked to review and has not yet. */
  review: string[]
  /** Rows where the person has any role at all. */
  mine: string[]
}

/**
 * The refs the role options narrow to, or `null` when no row says who the
 * person is — the host did not know, or is older than 2.7.0. Then the options
 * are not offered: one that could only ever say 0 would be a claim nobody made.
 */
export function roleRefs(rows: readonly Reference[]): RoleRefs | null {
  if (!rows.some((row) => row.myRoles !== undefined)) return null
  return {
    review: rows.filter((row) => row.myRoles?.includes('reviewer-asked')).map((row) => row.ref),
    mine: rows.filter((row) => (row.myRoles?.length ?? 0) > 0).map((row) => row.ref),
  }
}
