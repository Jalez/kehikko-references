import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import type { Refusal } from '@/wire/host.ts'
import type { EpicBrief } from '@/wire/use-roadmap.ts'

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
 * false one goes off and does the wrong thing about it — refreshes an epic
 * that was never the problem, or reports work missing that was never asked for.
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
 */

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-prose px-4 py-10 text-sm">
      <h2 className="text-base font-medium text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 text-muted-foreground">{children}</div>
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
        This app holds no references of its own. It talks to no tracker, has no credentials to talk with, and
        keeps no copy of anything it has been shown. Every row on this list comes from a roadmap that frames
        this page and says which epic is open.
      </p>
      <p>
        Nothing has. So there is no epic, no reading, and nothing to list — which is different from a list
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

/** A roadmap is there; its context names no epic. */
export function NoEpic({ epics, look }: { epics: EpicBrief[]; look: (epic: string) => void }) {
  return (
    <Panel title="A roadmap is here, and no epic is open.">
      <p>
        The greeting arrived and the context it carried named no epic, so there is nothing yet for this
        list to be about. Open one in the roadmap and this fills in.
      </p>
      {epics.length > 0 && (
        <>
          <p>Or ask about one of these directly:</p>
          <ul className="flex flex-wrap gap-2">
            {epics.map((brief) => (
              <li key={brief.epic}>
                <Button variant="outline" size="sm" onClick={() => look(brief.epic)}>
                  {brief.title}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  )
}

/**
 * The question is out. The one state on this page where waiting is honest,
 * because something really is on its way.
 */
export function Asking({ epic }: { epic: string }) {
  return (
    <Panel title={`Asking about ${epic}.`}>
      <p>
        The question is out: what did the last refresh find in the trackers for this epic. This is the one
        wait on this page that means an answer is coming.
      </p>
    </Panel>
  )
}

/**
 * What each refusal means for the person reading it.
 *
 * The protocol carries two halves and both are shown: `reason` is the word for
 * this code, and the host's own sentence is for whoever is writing a module.
 * Neither is enough on its own for the person who just wanted to see their
 * work, so there is a third sentence here — what this refusal means for them —
 * and it is different for each reason because the futures are different.
 */
const WHAT_IT_MEANS: Record<Refusal['reason'], string> = {
  'unknown-method':
    'This host does not answer live.get at all. That is not a wait: it will not begin answering, and nothing on this page can be filled in from it.',
  'unknown-module':
    'This host has no module by this name any more — most likely it was removed while this frame stayed open. Reinstalling it and reloading the page is what fixes that.',
  failed:
    'Something went wrong on the roadmap’s side. That is the one refusal worth simply asking again about.',
  silent:
    'The roadmap was asked and said nothing at all. It may still be starting, or it may be gone; either way this page will not find out by waiting longer.',
}

export function Refused({ epic, refusal, again }: { epic: string; refusal: Refusal; again: () => void }) {
  return (
    <Panel title="The roadmap refused the question.">
      <p>
        It was asked <code className="font-mono text-foreground">live.get</code> for{' '}
        <code className="font-mono text-foreground">{epic}</code> and answered{' '}
        <code className="font-mono text-foreground">{refusal.reason}</code>.
      </p>
      {refusal.error && <p className="border-l-2 border-border pl-3 italic">{refusal.error}</p>}
      <p>{WHAT_IT_MEANS[refusal.reason]}</p>
      {(refusal.reason === 'failed' || refusal.reason === 'silent') && (
        <Button variant="outline" size="sm" onClick={again}>
          Ask again
        </Button>
      )}
    </Panel>
  )
}

/**
 * The roadmap answered with nothing at all.
 *
 * The absence hardest to draw honestly, and the reason `null` is not collapsed
 * into an empty array anywhere upstream of here.
 */
export function Unread({ epic }: { epic: string }) {
  return (
    <Panel title="This epic has never been refreshed.">
      <p>
        The roadmap answered, and what it had for <code className="font-mono text-foreground">{epic}</code> was
        nothing at all — not an empty set of references, but no reading.
      </p>
      <p>
        Nothing has yet gone and looked at the trackers for this epic, so there is no issue, no merge
        request and no pull request to be missing. Refresh the epic in the roadmap and this list fills in.
      </p>
    </Panel>
  )
}

/**
 * A reading, containing nothing. The one genuinely empty list on this page, and
 * the only place the word "found" is honest.
 */
export function NothingFound({ epic, generated }: { epic: string; generated: string | null }) {
  return (
    <Panel title="The last refresh found no references here.">
      <p>
        This one is an answer rather than a gap. The roadmap looked
        {generated ? ` — the reading is dated ${generated} — ` : ' '}
        and epic <code className="font-mono text-foreground">{epic}</code> named no issue, no merge request
        and no pull request.
      </p>
      <p>Nothing is hidden and nothing is being waited for. There is genuinely no work filed against it.</p>
    </Panel>
  )
}

/**
 * The filter is hiding everything.
 *
 * Deliberately worded so it can never be mistaken for the state above. This is
 * the only absence on the page the reader caused, so it is the only one whose
 * remedy is a button rather than a sentence about the roadmap.
 */
export function NothingMatches({ total, clear }: { total: number; clear: () => void }) {
  return (
    <Panel title="Nothing here matches what you asked for.">
      <p>
        This epic has {total} {total === 1 ? 'reference' : 'references'} and the filter is hiding every one
        of them. Nothing has gone missing; the list is narrower than the work.
      </p>
      <Button variant="outline" size="sm" onClick={clear}>
        Show all {total}
      </Button>
    </Panel>
  )
}
