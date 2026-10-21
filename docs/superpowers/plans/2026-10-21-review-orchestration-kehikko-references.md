# Review orchestration: kehikko-references (C6)

> Task plan for this repository. Master plan: Jalez/kehikko-review
> `docs/superpowers/plans/2026-10-21-review-orchestration.md`, contract **C6**
> (reads **C2**, protocol 2.7.0 `myRoles`, filled by the host, C3). Implement test-first.

**Goal:** the person finds the issues and changes where they are the reviewer
at a glance: a **My role** column ("Reviewer (asked) · Author") and a way to
narrow to it, without a fifth filter group (`LIMITS.FILTER_GROUPS` is four
and all four are in use).

## Decisions

- **Where the filter goes: the Scope group.** Scope already answers "which
  references", and the question "what am I asked to review" is a set of
  references, usually across the whole project rather than one epic. Two
  options join `This epic` and `Everything`: **`Asked to review N`** (rows with
  `reviewer-asked`) and **`Mine, any role N`** (any role). One press from the
  default. The epic stays the fallback. Kehikko (the canvas pick) would have
  composed with the epic but needs two presses and its label is about the
  canvas; the `hide` group is the protocol's facets and takes no other ids.
- **Offered only when the reading knows who the person is**: some row carries
  `myRoles` (even `[]`). A host that does not say leaves the group as it was —
  an option that could only ever say 0 would be a claim nobody made. A stored
  `review`/`mine` choice under such a host narrows nothing (like an epic not
  read) until the host prunes it.
- `myRoles` absent is `null` on the row (not known), never `[]`.
- **Words** (`src/live/roles.ts`): `Reviewer (asked)`, `Reviewer (done)`,
  `Author`, `Assignee`, joined by ` · `, reviewer first.
- **Column**: in the row from 32rem (`@lg`), before the people, fixed width so
  rows align; empty on a row where the person has no role. Always in the row's
  tooltip ("my role: …"). Not searchable: the Scope options are the way to it.
- **Heading** names the role scope: `asked to review` / `mine`.
- **Empty**: `NothingInScope` gains sentences for both role scopes ("Nobody is
  asking you to review anything here.") with the existing Show everything.
- Protocol pinned from `#v2.0.0` to `#v2.7.0` (additive since 2.0; suite green on the bump alone).

## Files

- `package.json`, `bun.lock`: protocol `#v2.7.0`.
- `src/live/roles.ts` (new): `ROLE_WORDS`, `roleSaid(roles)`, `RoleRefs`, `roleRefs(rows)`.
- `src/live/reference.ts`: `myRoles: MyRole[] | null`.
- `src/live/collect.ts`: carries `row.myRoles ?? null`; unreadable rows `null`.
- `src/live/sift.ts`: `REVIEW`, `MINE`; `Scope.from` gains `'review' | 'mine'`; `Canvas.roles`; `offer` adds the two options when known; `siftingOf` reads them.
- `src/app.tsx`: `roles = roleRefs(rows)` into `canvas`.
- `src/view/reference-row.tsx`: the column and the tooltip.
- `src/view/heading.tsx`: `scope` prop gains the two.
- `src/view/absence.tsx`: `NothingInScope` sentences.
- `README.md`: the Scope section says the two options and the column.
- Tests: `test/roles.test.ts` (new), plus cases in `test/collect.test.ts`, `test/sift.test.ts`, `test/reference-list.test.tsx`/`test/absence.test.tsx`.

## Tasks (each: failing test, then code, then green)

1. `roleSaid` words and order; `roleRefs` → `null` when no row knows, refs per option otherwise.
2. `collect` carries `myRoles`; absent → `null`; unreadable → `null`.
3. `offer`: no role options without `myRoles`; with them, `Asked to review N`, `Mine, any role N` after Everything; schema-valid; fallback still `epic`.
4. `siftingOf`/`sift`: `{ scope: 'review' }` narrows to asked rows across the project; `mine` to any role; unknown → not narrowed; `nothingInScope` true when nobody asks.
5. Row: `data-role` column text `Reviewer (asked) · Author`; tooltip carries it; no column text on a row with no role.
6. Heading and `NothingInScope` words.
7. `bun run typecheck`, `bun test`.
8. PR "References: My role".
