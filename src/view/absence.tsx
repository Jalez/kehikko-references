import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import type { Trouble, TroubleKind } from '@/live/sight.ts'

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
 * Not here. `Troubled` below draws a sentence it is handed, and that sentence is
 * written in `tracker/gh.ts` and `tracker/project.ts`, beside the code that
 * knows which failure it is. That is a deliberate exception to the paragraph
 * above and it is worth saying why: the door is the only place holding the exit
 * code and the CLI's own words, so a page that rewrote the sentence would be
 * guessing at a distinction the door had already made. What this file owns for
 * those is the TITLE and the second paragraph — what it is not, and what to do
 * — because those are about the reader rather than about the process.
 */

/**
 * The frame every one of these paragraphs sits in.
 *
 * ## It scrolls itself, for the reason the list does
 *
 * These are the states with no rows, and it is easy to forget that one of them
 * is still the whole of a container — a container that is often 220 by 340. "Nothing has
 * told me anything" is three paragraphs and wants about six hundred pixels of
 * height there. Without a scroller of its own the last of those paragraphs sat
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

/** The page has just loaded and nothing has said anything yet. It still might. */
export function Listening() {
  return (
    <Panel title="Waiting to be greeted.">
      <p>
        A roadmap greets a frame as that frame loads. If one is out there, this page fills in by itself in a
        moment.
      </p>
    </Panel>
  )
}

/**
 * Nothing greeted us. The standalone state, and the one this app is most likely
 * to be in — somebody opened it on its own port to see what it is.
 */
export function Unhosted() {
  return (
    <Panel title="Nothing has told me anything.">
      <p>
        This app holds no references of its own. Every row on this list is read out of one project’s GitHub,
        with the login the <code className="font-mono text-foreground">gh</code> command on this machine
        already holds — and which project that is comes from a roadmap that frames this page and says where
        it is standing.
      </p>
      <p>
        Nothing has. So there is no project, no reading, and nothing to list — which is different from a list
        with nothing in it. An empty list would mean somebody went and looked and found no work. Nobody has
        looked.
      </p>
      <p>
        Frame this page from a roadmap and the rows arrive with the greeting. Until then this is the whole of
        what the app honestly knows.
      </p>
    </Panel>
  )
}

/**
 * A roadmap is there; its context names no project folder.
 *
 * The protocol is explicit that this is a real state rather than an oversight: a
 * host with no filesystem of its own knows the name of the project somebody is
 * looking at and has no folder to point at. So this paragraph is careful not to
 * read as a fault — there is nothing here for anybody to fix, and the previous
 * version of this page offered a picker in the equivalent state, which is a
 * thing this one deliberately does not do. Which project a canvas stands in is
 * the host's to decide, and a module offering to change it would be a container
 * steering the whole canvas from the corner.
 */
export function NoProject() {
  return (
    <Panel title="A roadmap is here, and it named no project folder.">
      <p>
        The greeting arrived and the context it carried had no{' '}
        <code className="font-mono text-foreground">projectPath</code> in it. This list is read out of a
        project’s own GitHub, so with no folder there is nothing to read and nothing to be about.
      </p>
      <p>
        That is not a fault. A roadmap with no filesystem of its own knows which project you are looking at
        and has no folder to point at, and the protocol says so. Open a project with a folder behind it and
        this fills in.
      </p>
    </Panel>
  )
}

/**
 * The read is out and there is nothing on screen to keep somebody company.
 *
 * The one state on this page where a whole container of waiting is honest, and the
 * only one — a read that happens over rows that are already drawn leaves them
 * there and says what it is doing in the header instead. See `busy` in
 * `use-roadmap.ts`.
 */
export function Asking({ project }: { project: string }) {
  return (
    <Panel title={`Reading the tracker in ${projectName(project)}.`}>
      <p>
        The <code className="font-mono text-foreground">gh</code> command is being asked for this project’s
        issues and pull requests. This is the one wait on this page that means an answer is coming.
      </p>
    </Panel>
  )
}

/**
 * What each kind of failure is NOT, and what to do about it.
 *
 * The sentence saying what happened comes from the door — see the note at the
 * top of this file — and these are the two things the door is in no position to
 * write, because they are about the reader. Each is different because the
 * futures are different: some of these fix themselves, one of them is not a
 * failure at all, and exactly one of them is worth pressing the button again
 * about.
 */
const WHAT_IT_MEANS: Record<TroubleKind, string> = {
  'bad-project':
    'This is the roadmap and this app disagreeing about where the project is, rather than anything about the project itself. Nothing was read and nothing was cached, so there is no older list hiding behind this.',
  'no-gh':
    'This is not an empty list and it is not a failed read: no read was attempted, because the program that does the reading is not here. Every row on this page comes through it.',
  'not-a-repo':
    'Nothing is wrong and nothing is being waited for. There is no button on this panel because there is nothing to press: a project with no repository has no issues and no pull requests anywhere for this list to be missing.',
  'no-remote':
    'The repository is real and the work in it is real; it is the tracker that does not exist, because a tracker lives on a forge and this repository has not been pushed to one.',
  unauthenticated:
    'The project is fine and the network is fine. This is the one failure on this page that is entirely about this machine, and it stays until somebody logs in — waiting will not clear it.',
  offline:
    'Nothing is wrong with the project, the login or this app. This is the failure worth simply trying again once there is a network.',
  'rate-limited':
    'This is a limit rather than a refusal: the same read works later without anything being changed. Note that the limit is shared with every other program on this machine using the same login, so it may not have been this container that spent it.',
  refused:
    'This app has no specific sentence for this one, which means it is something neither this program nor its author has seen. The words above are the whole of what is known about it.',
  door:
    'This is this program disagreeing with itself rather than anything about the project, the login or the network. The page and the server that answers it are two halves of one app, and they are out of step.',
}

/**
 * A read that did not happen, with nothing cached to fall back to.
 *
 * The button is offered for the failures that can pass on their own — a network
 * that comes back, a rate limit that resets, a machine somebody logs in on — and
 * withheld for the ones that cannot, because a button that cannot work is worse
 * than no button: it invites somebody to press it four times before reading the
 * sentence that says it will not help.
 */
export function Troubled({ project, trouble, again }: { project: string; trouble: Trouble; again: () => void }) {
  const worthRetrying =
    trouble.kind === 'offline' ||
    trouble.kind === 'rate-limited' ||
    trouble.kind === 'unauthenticated' ||
    trouble.kind === 'door' ||
    trouble.kind === 'refused'
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
          Read it again
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
  'bad-project': 'That project folder is not one this app can read.',
  'no-gh': 'The GitHub CLI is not on this machine.',
  'not-a-repo': 'This project is not a git repository.',
  'no-remote': 'This repository has no remote, so it has no tracker.',
  unauthenticated: 'This machine is not logged in to GitHub.',
  offline: 'GitHub could not be reached.',
  'rate-limited': 'GitHub is rate-limiting this machine.',
  refused: 'The GitHub CLI refused this read.',
  door: 'This app’s own server did not answer.',
}

/**
 * A reading, containing nothing. The one genuinely empty list on this page, and
 * the only place the word "found" is honest.
 */
export function NothingFound({ project, generated }: { project: string; generated: string | null }) {
  return (
    <Panel title="This project’s tracker has nothing in it.">
      <p>
        This one is an answer rather than a gap. GitHub was asked
        {generated ? ` — the reading is dated ${generated} — ` : ' '}
        for every issue and every pull request in{' '}
        <code className="font-mono text-foreground">{projectName(project)}</code>, in every state, and it
        named none.
      </p>
      <p>
        Nothing is hidden and nothing is being waited for. There is genuinely no work filed against this
        repository — which is the ordinary state of a new one.
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
