import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import type { Focus, Scope } from '@/live/sift.ts'
import type { Held, Trouble, TroubleKind } from '@/live/sight.ts'

/**
 * The words for every way this page can have no rows.
 *
 * ## Why this file exists at all
 *
 * Because "no rows" is not one situation, and drawing it as one is the quiet
 * lie this whole app is built against. A spinner says an answer is coming. An
 * empty list says somebody looked and found nothing. "No results" says the
 * filter is too narrow. Each of those is a specific claim, each is false in
 * most of the cases where a list is empty, and a reader who has been told a
 * false one goes off and does the wrong thing about it — logs in again when
 * they were never logged out, or reports work missing that was never filed.
 *
 * So every state gets its own paragraph, written to be read by somebody who has
 * to decide what to do next, and the paragraph says three things: what happened,
 * what that is NOT, and what would change it. The middle one is the part that
 * is usually left out and is usually the whole difficulty.
 *
 * The sentences are here, in one file, rather than spread through the
 * components that trigger them, so that they can be read next to each other —
 * which is the only way to notice that two of them say the same thing about
 * different situations. They are tested, word for word, for the same reason.
 *
 * ## Where the words for a failed read actually live
 *
 * Not here. A tracker that could not be read is the host's to describe — it
 * holds the CLI and its words — and its sentence arrives per source in the
 * reading, drawn by `view/sources.tsx` over the rows that source gave before.
 * `Troubled` below is only for the conversation with the host failing, and
 * draws the host's own sentence where there is one. What this file owns for
 * those is the TITLE and the second paragraph — what it is not, and what to do
 * — because those are about the reader rather than about the process.
 */

/**
 * The frame every one of these paragraphs sits in.
 *
 * ## It scrolls itself, for the reason the list does
 *
 * These are the states with no rows, and it is easy to forget that one of them
 * is still the whole of a container — a container that is often 220 by 340. A
 * failed conversation with the host is three paragraphs and wants about six
 * hundred pixels of height there. Without a scroller of its own the last of those paragraphs sat
 * below the bottom edge of the frame, and it is the one that says what to DO
 * about the situation. An honest sentence nobody can reach is worth no more
 * than one that was never written.
 *
 * So the panel is the container and scrolls inside it, which is the same shape the
 * list has — see the note about `h-full` in `main.tsx`.
 *
 * `@container` is declared here rather than inherited because a panel is drawn
 * INSTEAD of the frame in `app.tsx` rather than inside it, so there is nothing
 * above it to ask. What it asks about is the padding: ten rems of vertical air
 * is right on a screen and is a third of the height of a short container.
 *
 * `break-words` is for the identifiers. Most of these paragraphs name a project
 * folder or quote a CLI's own error, and an absolute path is one long
 * unbreakable token that would otherwise push the whole page sideways.
 */
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="@container h-full overflow-y-auto">
      <div className="mx-auto max-w-prose px-3 py-5 text-sm break-words @md:px-4 @md:py-10">
        <h2 className="text-base font-medium text-foreground">{title}</h2>
        <div className="mt-3 space-y-3 text-muted-foreground">{children}</div>
      </div>
    </div>
  )
}

/*
 * Three states are not here: waiting to be greeted, nothing framing the page,
 * and a host that named no project folder. Every module has those, and they are
 * the protocol's `Cover` — drawn in `app.tsx` — so that they read the same in
 * every container on a canvas. What follows is what only this app can say.
 */

/**
 * The read is out and there is nothing on screen to keep somebody company.
 *
 * The one state on this page where a whole container of waiting is honest, and the
 * only one — a read that happens over rows that are already drawn leaves them
 * there and says what it is doing in the header instead. See `busy` in
 * `use-kehikot.ts`.
 */
export function Asking({ project }: { project: string }) {
  return (
    <Panel title={`Reading the trackers for ${projectName(project)}.`}>
      <p>
        The host is being asked for this project’s issues, merge requests and pull requests, or is reading
        them from GitHub and GitLab for the first time. This is the one wait on this page that means an
        answer is coming.
      </p>
    </Panel>
  )
}

/**
 * What each kind of failure is NOT, and what to do about it.
 *
 * The sentence saying what happened comes from the host where it said one —
 * see the note at the top of this file — and these are what the host is in no
 * position to write, because they are about the reader. Each is different
 * because the futures are different: one of them will not change by asking
 * again, and the other two might.
 */
const WHAT_IT_MEANS: Record<TroubleKind, string> = {
  'unknown-method':
    'This is not an empty list and it is not a failed read: nothing was read, because the host framing this page is older than the shared tracker reading. A host that answers `tracker.get` fills this list in; asking this one again will not.',
  refused:
    'The host was asked for its reading of this project’s trackers and said no, in the words above. Nothing is wrong with the trackers themselves; whether it is worth asking again depends on what it said.',
  unreadable:
    'This is the host and this app being a version apart rather than anything about the project or the trackers. Updating whichever of the two is older is what fixes it.',
}

/**
 * The host was asked for its reading and gave nothing this page can draw.
 *
 * The button is offered for the failures that can pass on their own — a host
 * that failed this once, a version mismatch somebody is fixing — and withheld
 * for the one that cannot: a host that has never heard of the question will not
 * learn it from being asked twice, and a button that cannot work invites
 * somebody to press it four times before reading the sentence that says so.
 */
export function Troubled({ project, trouble, again }: { project: string; trouble: Trouble; again: () => void }) {
  const worthRetrying = trouble.kind !== 'unknown-method'
  return (
    <Panel title={TITLES[trouble.kind]}>
      <p>{trouble.why}</p>
      {trouble.said && <p className="border-l-2 border-border pl-3 font-mono text-xs italic">{trouble.said}</p>}
      <p>{WHAT_IT_MEANS[trouble.kind]}</p>
      <p className="text-xs">
        The project is <code className="font-mono">{project}</code>.
      </p>
      {worthRetrying && (
        <Button variant="outline" size="sm" onClick={again}>
          Ask again
        </Button>
      )}
    </Panel>
  )
}

/**
 * The heading for each failure, which is the only line most people read.
 *
 * Written as statements of fact rather than as apologies, and each names the
 * thing that is actually wrong — because the heading is what somebody sees in a
 * 220-pixel container before deciding whether to read the rest.
 */
const TITLES: Record<TroubleKind, string> = {
  'unknown-method': 'This host has no shared tracker reading.',
  refused: 'The host would not hand over its tracker reading.',
  unreadable: 'The host’s tracker reading could not be read.',
}

/**
 * A reading, containing nothing. The one genuinely empty list on this page, and
 * the only place the word "found" is honest — or, with no sources at all, the
 * host saying it reads no tracker for this project, which is a different
 * sentence because it sends somebody somewhere different.
 */
export function NothingFound({ project, reading }: { project: string; reading: Held }) {
  const name = <code className="font-mono text-foreground">{projectName(project)}</code>
  if (!reading.sources.length) {
    return (
      <Panel title="The host reads no tracker for this project.">
        <p>
          It was asked for everything it reads for {name}, and it named no GitHub repository and no GitLab
          project to read. That is not a failure — a project can be a folder of writing with no tracker
          behind it — and nothing is being waited for.
        </p>
        <p>
          If this project does have a tracker, it is the host that has to be told where it is; this list
          shows whatever the host reads.
        </p>
      </Panel>
    )
  }
  const failed = reading.sources.filter((source) => source.error)
  return (
    <Panel title="This project’s tracker has nothing in it.">
      <p>
        This one is an answer rather than a gap. The host read{' '}
        {reading.sources.map((source) => `${source.host}/${source.repo}`).join(', ')}
        {reading.at ? ` — the reading is dated ${reading.at} — ` : ' '}
        for {name}, and it named no issue, merge request or pull request.
      </p>
      {failed.map((source) => (
        <p key={`${source.host}/${source.repo}`}>
          {source.host}/{source.repo} could not be read: {source.error}
        </p>
      ))}
      <p>
        {failed.length
          ? 'So this may be emptier than the work: the sources above gave nothing because they could not be read.'
          : 'Nothing is hidden and nothing is being waited for. There is genuinely no work filed against this project — which is the ordinary state of a new one.'}
      </p>
    </Panel>
  )
}

/**
 * The filter is hiding everything.
 *
 * Deliberately worded so it can never be mistaken for the state above. This is
 * the only absence on the page the reader caused, so it is the only one whose
 * remedy is a button rather than a sentence about somewhere else.
 */
export function NothingMatches({ total, clear }: { total: number; clear: () => void }) {
  return (
    <Panel title="Nothing here matches what you asked for.">
      <p>
        This project has {total} {total === 1 ? 'reference' : 'references'} and the filter is hiding every one
        of them. Nothing has gone missing; the list is narrower than the work.
      </p>
      <Button variant="outline" size="sm" onClick={clear}>
        Show all {total}
      </Button>
    </Panel>
  )
}

/**
 * The list is narrowed to what is picked on the kehikko, and that reaches
 * nothing here.
 *
 * Two situations, one panel, and the sentence changes because what to do next
 * does. Nothing picked at all: pick something, anywhere on the canvas — a row
 * here, a step in a journey — and it appears. Something picked that this
 * project's tracker does not hold: the pick is real and is about references
 * that are not in this reading, which is worth saying because the other
 * container is showing them and this one is not, and a reader deserves to know
 * that is not a fault.
 *
 * It is NOT `NothingMatches`, on purpose. That panel says the reader narrowed
 * the list with a menu and offers to loosen every menu at once; this state is
 * not fixed by loosening — the toggles may be exactly what the
 * reader wants — and it is very often fixed by a click in another container.
 * The one press here turns off only this group, and leaves the rest as they
 * were.
 *
 * An empty selection MUST NOT be an empty list. A pane that goes blank because
 * nothing is picked reads as a broken module, and this is the sentence that
 * stops it.
 */
export function NothingPicked({
  picked,
  total,
  everything,
}: {
  /** How many references the canvas has picked out, none of which is here. */
  picked: number
  total: number
  /** Turn off the narrowing to picks, leaving every other filter alone. */
  everything: () => void
}) {
  return (
    <Panel title={picked ? 'What is picked on this kehikko is not in this list.' : 'Nothing is picked on this kehikko.'}>
      {picked ? (
        <p>
          {picked === 1 ? 'One reference is' : `${picked} references are`} picked out on the canvas, and{' '}
          {picked === 1 ? 'it is not' : 'none of them is'} among the {total} in this project’s tracker. The pick is
          real; it is about work that is not filed here.
        </p>
      ) : (
        <p>
          This list is showing only what is picked out on the canvas, and nothing is. Pick a row here, tick a
          step in a journey, or pick a reference in any other container on this kehikko and it appears.
        </p>
      )}
      <p>Nothing has gone missing: the project has {total} {total === 1 ? 'reference' : 'references'}.</p>
      {/* Three words, because at 220 pixels "Show everything in the project"
          ran off the panel's edge — measured in the scratch host — and a press
          whose last word is clipped reads as a broken control. */}
      <Button variant="outline" size="sm" onClick={everything}>
        Show everything
      </Button>
    </Panel>
  )
}

/**
 * The scope is on, and nothing it names is in this reading.
 *
 * Its own panel rather than `NothingMatches`, for the reason `NothingPicked`
 * is: the remedy is not to loosen a menu somebody set, because nobody set this
 * one — the scope is on by default. Two cases with two sentences. An epic whose
 * refs are all elsewhere is the common one: its steps cite a tracker the
 * host does not read for this project, or the epic simply names nothing yet.
 * Picked containers that show nothing here is the other, and the sentence says
 * where to look instead.
 *
 * The press turns the scope to Everything and leaves the other groups alone.
 */
export function NothingInScope({
  scope,
  total,
  everything,
}: {
  scope: Scope
  total: number
  everything: () => void
}) {
  const named = scope.refs.length
  const containers = scope.from === 'containers'
  return (
    <Panel
      title={
        containers
          ? 'The picked containers show nothing in this list.'
          : named
            ? 'Nothing this epic names is in this list.'
            : 'This epic names no references.'
      }
    >
      {containers ? (
        <p>
          This list is showing what the containers picked out on this kehikko say they are showing, and{' '}
          {named
            ? `the ${named === 1 ? 'reference they name is' : `${named} references they name are`} not in this project’s tracker.`
            : 'none of them says it is showing a reference.'}{' '}
          Untick them, or pick a container that shows references, and the list follows.
        </p>
      ) : named ? (
        <p>
          The open epic names {named === 1 ? 'one reference' : `${named} references`} in its steps and umbrella, and{' '}
          {named === 1 ? 'it is not' : 'none of them is'} among the {total} in this project’s tracker. They are
          real; they are filed somewhere this list does not read.
        </p>
      ) : (
        <p>
          This list is narrowed to the references the open epic names in its steps and umbrella, and it names none
          yet. A step that cites an issue or a change puts it here.
        </p>
      )}
      <p>Nothing has gone missing: the project has {total} {total === 1 ? 'reference' : 'references'}.</p>
      <Button variant="outline" size="sm" onClick={everything}>
        Show everything
      </Button>
    </Panel>
  )
}

/**
 * Parts of the epic are picked out, and every row the list would otherwise
 * draw is outside them.
 *
 * Its own panel for the reason the two above have one, and a stronger version
 * of it: nobody narrowed this in the container's header, and nothing on this
 * page can undo it. The parts are picked in the host's bar, so there is no
 * button here — a press that promised to show everything and could not would
 * be the broken control the other panels are careful not to draw. What there
 * is instead is the count, the names, and where the control is.
 *
 * A reference no part lists is outside every focus. That is the protocol's
 * rule, and it is why an epic whose parts list three refs can leave thirty
 * here: they are counted, in this sentence and in the heading, and not shown.
 */
export function NothingInFocus({ focus }: { focus: Focus }) {
  const one = focus.picked.length === 1
  return (
    <Panel title={one ? 'Nothing in the picked part is in this list.' : 'Nothing in the picked parts is in this list.'}>
      <p>
        This epic is focused on {one ? 'one part' : `${focus.picked.length} parts`} — {focus.picked.join(', ')} — and{' '}
        {focus.outside === 1
          ? 'the one reference this list would otherwise show is'
          : `all ${focus.outside} references this list would otherwise show are`}{' '}
        outside {one ? 'it' : 'them'}. A reference is in a part when the epic lists it under that part’s heading, or a
        step assigned to the part names it.
      </p>
      <p>
        Nothing has gone missing. The parts are picked in the host’s bar, beside the epic; unpick them there and the
        list is whole again.
      </p>
    </Panel>
  )
}

/**
 * The short name for a project folder, for a heading in a 220px container.
 *
 * The last segment, which is what a person calls their project. The full path is
 * never dropped from the page — `Troubled` prints it, and the header's tooltip
 * carries it — because a label that could be two different checkouts is fine on
 * a screen that is only ever showing one of them, and is not fine in a sentence
 * about a failure somebody has to go and fix.
 *
 * Exported because the header in `app.tsx` needs the same rule, and two copies
 * of "what do we call this project" would eventually disagree.
 */
export function projectName(project: string): string {
  const trimmed = project.replace(/\/+$/, '')
  const cut = trimmed.lastIndexOf('/')
  return (cut === -1 ? trimmed : trimmed.slice(cut + 1)) || project
}
