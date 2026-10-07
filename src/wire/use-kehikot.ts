import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { askReading, askRefresh } from '@/live/ask.ts'
import type { Sight } from '@/live/sight.ts'
import {
  CONTENT_HOST,
  contentStamp,
  filterChoiceSchema,
  type CanvasContainer,
  type ContentChange,
  type Disposition,
  type EpicPart,
  type FilterChoice,
  type FilterGroup,
} from 'kehikot-module-protocol'
import {
  HostRefused,
  connect,
  type Connection,
  type HostEvents,
  type Refusal,
} from 'kehikot-module-protocol/client'

/**
 * The bridge, as one React value.
 *
 * `kehikot-module-protocol/client` is the wire and knows no React; this is the
 * only file that turns messages into state, and it is deliberately the only
 * one. Two places driving a `Sight` would eventually disagree about which state
 * a page is in, and "which absence is this" is the one question this app cannot
 * afford to be confused about.
 *
 * ## What used to be underneath this
 *
 * `wire/host.ts` and `wire/mailbox.ts` — 423 lines. This module is where the
 * store-before-listen bug was FOUND: a handler that reached for the connection
 * during the mailbox's synchronous replay hung this page forever, with no
 * question sent and no timeout, on a sentence that never changed. The comment
 * below is that afternoon, and it now describes two calls instead of a
 * workaround.
 *
 * `mailbox.ts` also grew a `forget()` here, after a real test-isolation bug:
 * one case's greeting replayed into the next case's freshly mounted app and
 * every counting assertion in `test/app.test.tsx` went off by one. The client
 * ships `MessageSource.forget?()` for exactly that, so the test keeps its
 * `afterEach` and calls the package's.
 *
 * The context was already passed through whole here, so no field starts or
 * stops arriving. The `goto` backstop stays at 500ms, which is this module's
 * lineage and the client's default.
 *
 * It is also the only file that decides WHEN the reading is asked for, which
 * used to be a trivial question and is not any more. See `standingOn` below.
 *
 * ## The grace, and why there is one
 *
 * A page cannot know at load whether it is framed. It has to wait to find out,
 * because the greeting arrives when the host is ready rather than when we are,
 * and a page that concluded "nobody is there" in the first frame would say so
 * and then be greeted a moment later — the reader would see the honest
 * standalone paragraph flash past and be replaced, which teaches them that
 * paragraph is noise. So there is a `listening` state with its own words, it
 * lasts under a second, and only then does the page say the harder thing.
 *
 * It is not a spinner. It says what it is waiting for.
 */
const GREETING_GRACE_MS = 700

/**
 * Whose material the open epic's refs are read out of, in the words
 * `context.content` uses for a source.
 *
 * `CONTENT_HOST` is the epics the host keeps — what `steps.list` and `epic.get`
 * answer from. The other is the Journeys module, by the id it registers under:
 * a journey is where an epic's steps are edited, so a change there is a change
 * to what the open epic names (issue #7 asks for both). The host announces an
 * edit under the journeys without saying which epic it was for, and
 * `contentStamp` counts that for any.
 *
 * Spelled here because this is the only place in this program that names
 * another module, and it names it only as a source to listen for: nothing is
 * asked of Journeys and nothing is sent to it.
 */
const JOURNEYS = 'kehikot.journeys'
const EPIC_KEPT_BY = [CONTENT_HOST, JOURNEYS] as const

/**
 * What came of asking the host to move this container's filters.
 *
 * Two branches and not a boolean, because both halves are read. On success the
 * caller compares the SETTLED choice against the row it is trying to walk
 * somebody to; on a refusal it puts the host's own sentence on screen, which is
 * the only sentence anybody can act on — "the container is pinned" and "the
 * container is not on the kehikko that is open" send a person to two different
 * places, and neither is a thing this module could work out for itself.
 */
export type Settled = { ok: true; filters: FilterChoice } | { ok: false; why: string }

export interface Kehikot {
  sight: Sight
  /**
   * Whether anything is being read right now: this page asking the host for
   * its reading, a refresh this page asked for, or the host reading on its own
   * account — `context.tracker.refreshing`, which a press in another container
   * or the project's schedule sets.
   *
   * Held beside `sight` rather than inside it, and that separation is the whole
   * of "the container stays usable while the network is being waited on". A read that
   * happens over rows already on screen must not throw them away: the list goes
   * on scrolling, the filter goes on filtering, the selection goes on being the
   * selection, and the only thing that changes is the host's refresh icon.
   * Folded into `sight` as a state, every refresh would blank the container for
   * as long as the trackers took, which is the failure this flag exists to make
   * impossible.
   *
   * `sight.at === 'asking'` is the other case — busy AND nothing to show — and
   * that one is a whole container, because there is genuinely nothing else to draw.
   */
  busy: boolean
  /**
   * Ask the host for its reading again, as it holds it now. Spends nothing at
   * any tracker: `tracker.get` answers at once from what the host has.
   */
  read: () => void
  /**
   * Ask the host to read the trackers again — `tracker.refresh`, for the whole
   * project — and then ask for the reading. What the host's refresh control
   * does. See `askRefresh` in `live/ask.ts`.
   */
  refresh: () => void
  /**
   * Why the last refresh did not read everything, in the host's words, or null.
   * Cleared when another refresh is asked for and when the project changes.
   */
  refreshNote: string | null
  /** Say how tall this page would like its frame to be. Silent when nothing is framing it. */
  resize: (height: number) => void
  /**
   * What the canvas has picked out, as the host last said it.
   *
   * Never what this page asked for. The protocol's essay on `selection` in
   * `contextSchema` is the argument and it is worth restating here, because the
   * shape of this hook is the place the argument is either kept or quietly
   * broken: a selection is a fact about the canvas, in the same family as which
   * project is open, and the host owns it. This page asks for a change and then
   * finds out what happened the same way every other framed module does —
   * through `kehikot.context`.
   *
   * The alternative, an optimistic local copy corrected by the echo, would draw
   * a tick for a selection the host had not made, and the two would disagree
   * exactly in the cases that matter: a host that refused, a host that clamped
   * the list, a second module that changed it in the same breath. So there is no
   * local copy at all, and a click that produced no context produced no tick —
   * which is a visible symptom of a real problem rather than a hidden one.
   *
   * Nothing about this changed when the rows started coming from elsewhere, and
   * that is the single most important sentence in this file. The refs are
   * spelled identically, the round trip is identical, and every module that
   * reacts to `gh#105` goes on reacting to it.
   */
  selection: string[]
  /** Ask the host to make this the canvas's selection. An empty list clears it. */
  select: (refs: string[]) => void
  /**
   * Why the last `selection.set` did not take, if it did not.
   *
   * Held because the round trip above has an honest failure mode with no
   * symptom: a host that has never heard of `selection.set` answers
   * `unknown-method`, no context comes back, and a person clicks a row that
   * refuses to tick with nothing on screen saying why. Silence there would read
   * as a broken page. Null the moment a set is asked for again, so the sentence
   * belongs to the most recent attempt and never lingers over a working one.
   */
  selectionRefused: Refusal | null
  /**
   * Which of the options this module offered are chosen for THIS container.
   *
   * `{}` before any host has said anything, and `{}` from a host that has never
   * heard of filters — the true answer in both cases, which is that nothing is
   * narrowed. `live/sift.ts` reads it, and reads it leniently, because the
   * greeting carries a remembered choice before this page has said what it
   * offers.
   *
   * Compared key by key before it is written. The host builds a fresh record on
   * every context whatever happened, and a new identity here would re-narrow the
   * whole list on every context — which arrives after every click on the canvas,
   * including ours.
   */
  chosen: FilterChoice
  /**
   * Say what this page can be narrowed by, so the host can draw the control.
   *
   * Fire and forget, like `resize`: the host may draw it, may draw part of it,
   * or may never have heard of the idea. What comes back is not an answer but a
   * `kehikot.context` with `filters` in it, which is where `chosen` above comes
   * from — including the first time, out of the greeting.
   *
   * Sent unconditionally. A page with no host posts into nothing, which costs
   * nothing, and a page that checked first would have to know whether the
   * greeting had arrived — which is exactly the race the client's own replay of
   * the last offer exists to end.
   */
  offerFilters: (groups: FilterGroup[]) => void
  /**
   * Say that this page can read its tracker again, and when it last did.
   *
   * Fire and forget like the filter offer, and remembered by the client so that
   * a frame which reloads is not left with the host drawing a "last read" time
   * from a conversation that no longer exists.
   *
   * `at` is this module's fact about its own data and the host never guesses
   * one, which is the whole reason the message exists. It is the shared
   * reading's own `at` — when the reading last changed — never the moment this
   * page asked for it.
   */
  refreshable: (state: { can?: boolean; at?: string | null; busy?: boolean }) => void
  /**
   * Ask the host to move this container's filters, and find out what it did.
   *
   * The counterpart of the offer, and the message that made moving these two
   * groups into the header possible at all — the essay at the top of
   * `live/sift.ts` is the whole story. `{}` is the meaningful empty value and is
   * exactly "clear the narrowing".
   *
   * Unlike `select`, this is awaited, and the two are asymmetric on purpose. A
   * refused `selection.set` has a visible symptom and gets a sentence beside the
   * list afterwards. A `filters.set` is asked in the middle of doing something
   * else — answering a `goto`, clearing everything with one press — and the
   * caller has to know what happened before it can decide what to say. So the
   * answer comes back as a value rather than as a side effect.
   *
   * What comes back is what the host SETTLED on rather than what was asked for:
   * a group on its resting option is not written down, and a group this module
   * is no longer offering is dropped. A caller that assumed otherwise would draw
   * one thing and be told another on the next context.
   */
  setFilters: (filters: FilterChoice) => Promise<Settled>
  /**
   * Whatever this module last asked the host to keep, exactly as it was written.
   *
   * Three values again, and again the third is doing real work: a string is what
   * was kept, `null` is a host that keeps nothing for this module, and
   * `undefined` is "no greeting has arrived, so the question has not been
   * answered". Only the first two are a fact; the third is the state a page must
   * not act on, because applying defaults during it and applying them because
   * the host really had nothing look identical on screen and are a reload apart
   * in meaning.
   *
   * It is opaque here, as it is to the host: this file neither writes nor parses
   * it. `live/keep.ts` owns the format and is the only thing that knows there is
   * one.
   */
  kept: string | null | undefined
  /** Ask the host to keep this string. Fire and forget; a host that will not is not an emergency. */
  keep: (state: string) => void
  /**
   * The refs the open epic names — every step's refs and the umbrella — or
   * `null` for "no epic is open, or what it names could not be read".
   *
   * ## Asked of the host, not read off the disk
   *
   * The epic lives in `.kehikot/roadmap/epics/<slug>.json` under the project,
   * and this app's own server could read it there. It does not, because the
   * file is the host's, and the host already answers `steps.list` and
   * `epic.get` out of it: a second reader of somebody else's file is a second
   * answer to what the epic says, and it would be wrong the first time the
   * host moved where it keeps them. So this module declares `steps:read`
   * and `epics:read` and asks, and a host that refuses both leaves this `null`
   * — which the scope reads as "nothing to narrow to", never as "the epic names
   * nothing".
   *
   * Asked again when the epic or the project changes, on the host's refresh,
   * and when `context.content` says the epic's material changed — because
   * steps are edited while an epic is open (issue #7). Not on every context: a
   * context arrives after every click on the canvas.
   *
   * An answer REPLACES this and nothing else. There is no "reading the epic"
   * state between two answers, so a list re-scoped by a later answer is the
   * same list: the rows that stay are the same elements, where the reader
   * scrolled to is where they still are, and the filters and the selection —
   * the host's, both — were never touched.
   */
  epicRefs: string[] | null
  /**
   * What the containers picked out on this kehikko say they are showing, as
   * one list of refs, or `null` when no container is picked out.
   *
   * This module's own container is left out of it. It says nothing with
   * `showing.set`, and a host folding the selection into whoever set it would
   * put this list's own picks here — so a ticked References container would
   * narrow itself to its own clicks, which is the kehikko group's job and not
   * the scope's.
   */
  aimed: string[] | null
  /** `context.dispositions`: what people have marked about why a reference closed. */
  marks: Disposition[]
  /**
   * `context.parts`: every part of the open epic, with the ones a person picked
   * out in the host's bar flagged.
   *
   * `[]` before any host has said anything and from a host that has never
   * heard of parts, which is the true answer in both cases: nothing is picked
   * out, so the whole epic is in front of the reader. Passed through whole —
   * picked or not — because the heading has to say what is picked out of how
   * many, and `live/sift.ts` counts what a focus hides rather than dropping it.
   *
   * There is no setter beside it. Picking a part is the host's own control,
   * with no method and no capability, so this page can only say where that
   * control is.
   */
  parts: EpicPart[]
}

/**
 * What to do when the host says "go to this reference".
 *
 * Handed in rather than handled here, because the answer depends on what is on
 * the list, and the list is the view's business. The contract is the protocol's:
 * `answer` must be called, and calling it late is the same as not calling it —
 * see the backstop in `host.ts`.
 */
export type GotoHandler = NonNullable<HostEvents['onGoto']>

export function useKehikot(id: string, onGoto: GotoHandler): Kehikot {
  const [sight, setSight] = useState<Sight>({ at: 'listening' })
  const [asked, setAsked] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [hostReading, setHostReading] = useState(false)
  const [refreshNote, setRefreshNote] = useState<string | null>(null)
  const [selection, setSelection] = useState<string[]>([])
  const [selectionRefused, setSelectionRefused] = useState<Refusal | null>(null)
  const [chosen, setChosen] = useState<FilterChoice>({})
  const [kept, setKept] = useState<string | null | undefined>(undefined)
  const [epicRefs, setEpicRefs] = useState<string[] | null>(null)
  const [aimed, setAimed] = useState<string[] | null>(null)
  const [marks, setMarks] = useState<Disposition[]>([])
  const [parts, setParts] = useState<EpicPart[]>([])
  const host = useRef<Connection | null>(null)

  /**
   * The handler, held in a ref and read at the moment a `goto` arrives.
   *
   * The view rebuilds this function whenever the rows change, and connecting to
   * the window again on every render would mean a torn-down listener during the
   * one millisecond a host chose to greet in. So the listener is established
   * once and always calls the newest handler — which is also the only one that
   * knows the rows currently on screen.
   */
  const goto = useRef(onGoto)
  goto.current = onGoto

  /**
   * The question in flight, by number.
   *
   * What stops a slow answer from BECOMING the page after a newer one already
   * has: projects switch faster than a host answers, and without it the previous
   * project's list arrives second and quietly replaces the current one. A list
   * of the right length, under the right heading, about the wrong repository.
   * There is nothing to abort any more — the question is a message, and the host
   * answers it from what it holds.
   */
  const asking = useRef(0)
  /** The same, for a refresh: only the newest one's answer is drawn. */
  const refreshed = useRef(0)

  /**
   * The `context.tracker.at` this page has drawn from, so that a context which
   * moved it — the host read again, for whatever reason — is asked about, and
   * one that did not is not. `undefined` before any context has said.
   */
  const seenAt = useRef<string | null | undefined>(undefined)

  /**
   * The project the page is standing on, as the host last said it.
   *
   * Three values and not two: a path, `null` for "the host says there is no
   * project folder", and `undefined` for "no context has been read yet".
   * Collapsing the last two would make the first context of a conversation that
   * names no project look like a repeat of a state the page was already in.
   *
   * ## When the reading is asked for, which is the question this whole file answers
   *
   * On the project CHANGING, on `context.tracker.at` moving, and after a
   * refresh. Not on any other context, not on a timer, and never on a render.
   *
   * Context stopped being a message that only ever means "the reader moved". It
   * carries the canvas's selection, so the host sends one after every
   * `selection.set` — including ours, a few milliseconds after a click. Asking
   * for four hundred rows on each of those would rebuild the list per tick of a
   * checkbox, and the click that caused it would look like a bug in the list.
   *
   * So the question is keyed to the two things that change its answer: which
   * project, and when the host's reading last changed. The second is the
   * `tracker` this module's manifest says it reacts to — a refresh pressed in
   * any container, or the project's own schedule, moves `at` for every module
   * in the project, and this one re-asks.
   *
   * There is no interval anywhere in this module, deliberately. Reading the
   * trackers is the host's to schedule, once, for everybody.
   */
  const standingOn = useRef<string | null | undefined>(undefined)

  /**
   * The epic the page is standing on, and a counter for the question about it.
   *
   * The same arrangement as `asking` above, for the same reason: epics switch
   * faster than a host answers, and without the counter the previous epic's
   * refs could arrive second and narrow the list to the wrong work.
   */
  const epicOn = useRef<string | null | undefined>(undefined)
  const epicAsked = useRef(0)

  /**
   * The `contentStamp` this page last acted on, for the epic it is standing on.
   *
   * The second thing the question about the epic is keyed to, and the
   * `content` this module's manifest says it reacts to — the same arrangement
   * as `seenAt` for the tracker. The stamp is a string that moves only when
   * the host's epics or the journeys changed for THIS epic, so a context that
   * carries the same list again — every click on the canvas does — and one
   * about another epic or another module's material both compare equal and ask
   * nothing.
   */
  const stampOn = useRef('')

  /**
   * What makes a burst of changes one more question rather than one each.
   *
   * `epicOut` is whether the question about the epic is out and unanswered;
   * `epicStale` is whether the material changed again while it was. An agent
   * writing six steps is six contexts in a second, and the answer to the first
   * question may have been composed before the sixth write — so it cannot be
   * the last word, and asking six times to find that out would be five
   * questions too many. One follows the answer, for everything that changed
   * meanwhile.
   *
   * `epicHeard` is which of the two questions the answer on screen came from,
   * so a re-ask can tell losing one of them from never having been granted it.
   */
  const epicOut = useRef(false)
  const epicStale = useRef(false)
  const epicHeard = useRef({ steps: false, whole: false })

  /**
   * Ask what the epic names.
   *
   * `afresh` is the question as it has always been asked — a new epic, a new
   * project, a greeting, the host's refresh: asked now, whatever is out, and
   * the older answer is dropped by the counter. `again` is the re-ask on
   * `context.content` (issue #7), which differs in the two ways a question
   * about material that is still being written has to: it waits its turn
   * behind one already out, and an answer that failed leaves what is on screen
   * alone.
   */
  const readEpic = useCallback(function ask(how: 'afresh' | 'again' = 'afresh') {
    if (how === 'again' && epicOut.current) {
      epicStale.current = true
      return
    }
    const epic = epicOn.current
    const mine = (epicAsked.current += 1)
    /* Whatever was waiting was waiting to be asked no earlier than this. */
    epicStale.current = false
    const current = host.current
    if (!epic || !current) {
      epicOut.current = false
      setEpicRefs(null)
      return
    }
    epicOut.current = true
    /* Both, side by side, and either is enough. `steps.list` is the steps'
       refs under `steps:read`; `epic.get` is the umbrella under `epics:read`.
       A host that grants one and refuses the other still narrows the list to
       what it granted, which is a list somebody can read; one that refuses
       both leaves the scope with nothing to narrow to, and says so. */
    void Promise.allSettled([
      current.request('steps.list', { epic }),
      current.request('epic.get', { epic }),
    ]).then(([steps, whole]) => {
      /* A newer question is out, about this epic or the next — and whatever
         was queued behind this one went with it. */
      if (epicAsked.current !== mine) return
      epicOut.current = false
      const heard = { steps: steps.status === 'fulfilled', whole: whole.status === 'fulfilled' }
      /* Asked again over refs already on screen, and a question that answered
         last time did not answer this time: the scope stays as it is. Putting
         the whole project back, or narrowing the epic to what the other
         question said, would be drawing a failure as if it were an edit. */
      const lost =
        how === 'again' && ((epicHeard.current.steps && !heard.steps) || (epicHeard.current.whole && !heard.whole))
      if (!lost) {
        epicHeard.current = heard
        if (!heard.steps && !heard.whole) setEpicRefs(null)
        else {
          const named = namedBy(
            steps.status === 'fulfilled' ? steps.value : null,
            whole.status === 'fulfilled' ? whole.value : null,
          )
          setEpicRefs((was) => (was && same(was, named) ? was : named))
        }
      }
      if (epicStale.current) ask('again')
    })
  }, [])

  const read = useCallback(() => {
    const project = standingOn.current
    const current = host.current
    if (!project || !current) return

    const mine = (asking.current += 1)
    setAsked(true)
    /* Only when there is nothing to show. A question over rows already on
       screen leaves them there — see `busy` above. */
    setSight((was) => (was.at === 'read' && was.project === project ? was : { at: 'asking', project }))

    void askReading((method, params, options) => current.request(method, params, options)).then((answer) => {
      /* A newer question is on its way, about this project or the next. */
      if (asking.current !== mine) return
      setAsked(false)
      if (answer.ok) {
        setSight({ at: 'read', project, reading: answer.reading, trouble: null })
        return
      }
      /* Asking again failed over a reading already on screen: the rows stay,
         and the sentence says they were not re-asked. */
      setSight((was) =>
        was.at === 'read' && was.project === project
          ? { ...was, trouble: answer.trouble }
          : { at: 'trouble', project, trouble: answer.trouble },
      )
    })
  }, [])

  const refresh = useCallback(() => {
    const current = host.current
    if (!standingOn.current || !current) return
    const mine = (refreshed.current += 1)
    setRefreshing(true)
    setRefreshNote(null)
    void askRefresh((method, params, options) => current.request(method, params, options)).then((note) => {
      if (refreshed.current !== mine) return
      setRefreshing(false)
      setRefreshNote(note)
      /* Asked for whatever the refresh did. `context.tracker.at` moves too
         when a read lands, but a host that read nothing new does not move it,
         and the reading is the only place a source's new error is said. */
      read()
    })
  }, [read])

  useEffect(() => {
    /**
     * What the greeting and every later context both do.
     *
     * The theme is applied here rather than in a component, because it is a
     * fact about the document rather than about any part of it: the host says
     * light or dark and the root element carries it. `light` is set explicitly
     * as well as `dark`, so that a host asking for light over a machine set to
     * dark actually gets it — see the media query in `index.css`.
     */
    const arrived = (
      context: {
        epic?: string | null
        projectPath?: string | null
        theme: 'light' | 'dark'
        selection: string[]
        filters?: FilterChoice
        containers?: CanvasContainer[]
        dispositions?: Disposition[]
        parts?: EpicPart[]
        tracker?: { at?: string | null; refreshing?: boolean }
        content?: ContentChange[]
      },
      /**
       * Whether this was a greeting rather than a later context, which decides
       * whether the tracker is read again.
       *
       * A greeting always re-reads, because a greeting means the conversation is
       * new: the host greets on every frame LOAD, so one arriving is a page that
       * has just come into existence, or a frame that reloaded itself and has
       * forgotten everything it knew. Answering that with "the project has not
       * changed, so there is nothing to do" would leave a page with no rows and
       * nothing outstanding, forever.
       *
       * `StrictMode` is the case that proves it in the smallest possible space.
       * The effect below is torn down and set up again on purpose in
       * development; the teardown aborts the read still in flight, and the setup
       * replays the greeting out of the mailbox. If the replayed greeting were
       * deduplicated against the project the aborted read had been about, the
       * page would sit on "asking" forever — in development only, which is the
       * worst place for a bug to be discovered.
       */
      greeting: boolean,
      /**
       * What the host had kept for this module, on a greeting, and `null` on a
       * later context — where the field does not exist, because a context is
       * broadcast and a module's own state is not.
       */
      state: string | null,
    ) => {
      if (greeting) {
        standingOn.current = undefined
        epicOn.current = undefined
        seenAt.current = undefined
        /* Set even when it is null, and that is the whole point of the third
           value on `kept`: `null` means the host answered and keeps nothing,
           which is a fact the view is entitled to act on, and it is a different
           fact from the `undefined` this starts as. */
        setKept(state)
      }
      const root = document.documentElement
      root.classList.toggle('dark', context.theme === 'dark')
      root.classList.toggle('light', context.theme === 'light')

      /**
       * The selection is taken from every context, unconditionally, before
       * anything decides whether the project moved.
       *
       * That order is the whole of "the UI follows rather than showing stale
       * ticks" when the reader changes project. The host clears the selection as
       * part of moving, and it says so in the same message that names the new
       * project — so a page that read the selection only on the branch where the
       * project stayed put would keep drawing the previous project's ticks
       * against whatever rows happen to share a ref with it. GitHub numbers
       * start at one in every repository, so `gh#1` exists nearly everywhere and
       * that collision is the expected case rather than a contrived one.
       */
      setSelection(context.selection)

      /*
       * And the choice the host is holding for this container, taken from every
       * context for the same reason: it is a fact about the container that this
       * page draws rather than owns, and the greeting carries it before this
       * page has offered anything.
       *
       * Compared key by key before it is written. The host builds a fresh record
       * on every context whatever happened, and a fresh identity here would
       * re-narrow and re-order the whole list on every click anybody makes on
       * the canvas — including every one of ours, because the host sends a
       * context back after each `selection.set`.
       */
      setChosen((was) => (agrees(was, context.filters ?? {}) ? was : (context.filters ?? {})))

      /* The two other facts the narrowing reads, compared for the same reason
         before they are written. */
      const pointed = aimedAt(context.containers ?? [], id)
      setAimed((was) => (was === pointed || (was && pointed && same(was, pointed)) ? was : pointed))
      const marked = context.dispositions ?? []
      setMarks((was) => (JSON.stringify(was) === JSON.stringify(marked) ? was : marked))
      /* And the parts of the epic, taken from every context like the selection
         and for its reason: moving to another epic sends that epic's parts with
         nothing picked in the same message that names it, and a page that kept
         the previous epic's focus would hide rows for parts that are not on
         screen anywhere. Compared before it is written, because the list is
         the same list on nearly every context. */
      const divided = context.parts ?? []
      setParts((was) => (JSON.stringify(was) === JSON.stringify(divided) ? was : divided))

      /* Read once, defensively, and treated as absent unless it is a non-empty
         string. It is only ever a key here — which project the reading is
         about — and the host, which owns the folder, is the one that reads it. */
      const project = typeof context.projectPath === 'string' && context.projectPath ? context.projectPath : null

      const moved = project !== standingOn.current
      standingOn.current = project

      /* The host's signal: when its reading last changed, and whether it is
         reading now. Absent from a host that has never heard of it, which is
         the honest `{ at: null, refreshing: false }`. */
      const signal = context.tracker ?? {}
      const readAt = typeof signal.at === 'string' ? signal.at : null
      const changed = seenAt.current !== undefined && readAt !== seenAt.current
      seenAt.current = readAt
      setHostReading(signal.refreshing === true)

      /* The epic is asked about again when it changes, and when the project
         does: two projects can each have an epic with the same slug. */
      const epic = typeof context.epic === 'string' && context.epic ? context.epic : null
      /* And when its material changes while it is open: the host's epics or
         the journeys, for this epic. Empty with no epic open — there is
         nothing to ask about — and from a host that has never heard of
         content changes, which never moves it. */
      const stamp = epic ? contentStamp(context.content, { sources: EPIC_KEPT_BY, epic }) : ''
      if (moved || epic !== epicOn.current) {
        epicOn.current = epic
        /* A new epic is read whole, so whatever is said to have changed in it
           so far is already in the answer. */
        stampOn.current = stamp
        readEpic()
      } else if (stamp !== stampOn.current) {
        stampOn.current = stamp
        readEpic('again')
      }

      if (!moved) {
        if (changed && project) read()
        return
      }

      setRefreshNote(null)
      refreshed.current += 1
      setRefreshing(false)
      if (project) read()
      else {
        asking.current += 1
        setAsked(false)
        setSight({ at: 'no-project' })
      }
    }

    /**
     * The connection is stored BEFORE it is told to listen, and the order is
     * the whole of a bug that made this page hang forever.
     *
     * `listen()` subscribes to the mailbox, and the mailbox replays what has
     * already arrived SYNCHRONOUSLY, inside that call. The greeting almost
     * always arrives before React mounts — that is the entire reason the
     * mailbox exists — so `onHello` fires on that line. When `connect` also
     * subscribed, that happened before `host.current` had been assigned:
     * anything reading `host.current` found null and returned early, and the
     * page was left on a sentence that never changed, with no question sent
     * and nothing to time out.
     *
     * Worse, it worked often enough to look fine. When the host happened to
     * greet after this effect returned — a slow module, a reload, a busy
     * machine — the assignment had already happened and everything behaved. A
     * race whose good outcome is the common one is the kind that ships.
     *
     * What stood here was a box that caught the too-early arrival and replayed
     * it once the assignment was done. It worked, and it was the wrong shape:
     * it fixed this module's copy of a hazard every module in the family had.
     * `connect` and `listen` are two calls now, so the ordering is three plain
     * lines that read in the order they happen, and the protocol package holds
     * a test that runs a one-step connect against the same greeting and
     * watches it fail.
     */
    const live = connect(id, {
      onHello: (context, state) => arrived(context, true, state),
      onContext: (context) => arrived(context, false, null),
      onGoto: (message, answer) => goto.current(message, answer),
      /**
       * The host's refresh control, or the interval somebody set for this
       * container. Both arrive here and neither says which it was.
       *
       * `tracker.refresh` for the project — the trackers read again, by the
       * host, for every module standing in it — and then the reading asked
       * for. The protocol is explicit that a module must not be told whether a
       * tick was automatic, and nothing here would do anything different if it
       * were: somebody asking for a fresh reading gets one, and the host joins
       * two presses into one read.
       *
       * Handled here rather than passed in like `onGoto`, because everything it
       * needs is already in this file, and the decision about WHEN the reading
       * is asked for has always lived here rather than in the view.
       */
      onRefresh: () => {
        refresh()
        readEpic()
      },
    })
    host.current = live
    live.listen()

    const grace = setTimeout(() => {
      setSight((was) => (was.at === 'listening' ? { at: 'unhosted' } : was))
    }, GREETING_GRACE_MS)

    return () => {
      clearTimeout(grace)
      /* The question goes with the listener. A page being torn down has no use
         for an answer, and one arriving after a remount must not become it. */
      asking.current += 1
      refreshed.current += 1
      live.stop()
      /* Cleared only if it is still ours: under StrictMode the second mount has
         already assigned its own connection by the time some cleanups run. */
      if (host.current === live) host.current = null
    }
  }, [id, read, refresh, readEpic])

  const resize = useCallback((height: number) => host.current?.resize(height), [])

  /* Sent whether or not anybody is listening. See `offerFilters` on `Kehikot`. */
  const offerFilters = useCallback((groups: FilterGroup[]) => host.current?.filters(groups), [])

  /* And the same, for the state that makes the host's refresh control possible.
     Silent standalone, where there is nobody to draw one. */
  const refreshable = useCallback(
    (state: { can?: boolean; at?: string | null; busy?: boolean }) => host.current?.refreshable(state),
    [],
  )

  /**
   * Ask, then read the answer rather than assuming it.
   *
   * Three things are answered here and each is a real state:
   *
   * - **No host.** Standalone, nothing is held for us, so `{}` is not a
   *   consolation prize — it is the truth about what this container is narrowed
   *   by, and the caller's next step (put the row on screen) is correct.
   * - **A refusal.** The host said no and said why; the sentence is handed back
   *   whole. `HostRefused` is what `request` rejects with, always, and anything
   *   else coming out of that promise is this page failing rather than the host
   *   declining — so it gets its own sentence rather than being reported as the
   *   host's answer.
   * - **A success.** Parsed, because `request` resolves `unknown` by design:
   *   the protocol is explicit that a client asserting a shape here would be
   *   asserting something no host promised. An answer that does not carry a
   *   readable choice is treated as a refusal, because a caller that believed it
   *   would go on to claim it had cleared something it knows nothing about.
   */
  const setFilters = useCallback(async (filters: FilterChoice): Promise<Settled> => {
    const current = host.current
    if (!current) return { ok: true, filters: {} }
    try {
      const answer = await current.request('filters.set', { filters })
      const held = filterChoiceSchema.safeParse((answer as { filters?: unknown } | null)?.filters)
      if (!held.success) {
        return { ok: false, why: 'The host answered that request in a shape this app could not read.' }
      }
      return { ok: true, filters: held.data }
    } catch (error) {
      if (error instanceof HostRefused) return { ok: false, why: error.refusal.error }
      return { ok: false, why: 'This app failed while reading the host’s answer.' }
    }
  }, [])

  /**
   * Ask the host to make this the selection, and say nothing about it here.
   *
   * ## Refs, and deliberately nothing else
   *
   * This page knows more than it sends. The reading says `gh#131` is an issue
   * and `gh#105` a pull request. Passing that along would save the next module
   * a lookup and is exactly what `selection.set` forbids: the host relays this into a context every framed module trusts, and
   * a host can vouch that these are the refs somebody picked while it cannot
   * vouch that one of them is an issue, because it was told and never checked. A
   * module that needs the kind asks `tracker.get`, as this page did. So:
   * refs, spelled exactly as this list draws them, and nothing more.
   *
   * ## No state is set on the way out
   *
   * The obvious next line — `setSelection(refs)` — is the bug this whole design
   * is arranged to avoid, and it would look like an improvement. See `selection`
   * on `Kehikot` above. What comes back through `kehikot.context` is the answer;
   * what went out is a request.
   *
   * An empty list is a real call rather than an absence: "nothing is selected"
   * is a state the canvas has to be able to move into, and there is no other way
   * to say it.
   */
  const select = useCallback((refs: string[]) => {
    setSelectionRefused(null)
    const current = host.current
    if (!current) {
      /* Standalone. Not a refusal by anybody — there is nobody to refuse — and
         the page says so in its own words elsewhere, so this is silent. */
      return
    }
    void current.request('selection.set', { refs }).catch((error: unknown) => {
      setSelectionRefused(
        error instanceof HostRefused
          ? error.refusal
          : { reason: 'failed', error: 'This app failed while reading the host’s answer.' },
      )
    })
  }, [])

  /**
   * Hand the host a string to keep, and do not wait to hear about it.
   *
   * Fire and forget, unlike `select`, and the asymmetry is deliberate. A refused
   * `selection.set` has a visible symptom — a row that will not tick — and needs
   * a sentence beside it. A refused `state.set` has none: the page goes on
   * working exactly as it is, and the only consequence is that a filter is
   * forgotten on the next load. Putting a warning on screen for that would be
   * telling a reader about a disappointment they have not had yet, in the space
   * where their work is.
   *
   * Nothing here knows what is in the string. See `live/keep.ts`.
   */
  const keep = useCallback((state: string) => {
    void host.current?.request('state.set', { state }).catch(() => {})
  }, [])

  const busy = asked || refreshing || hostReading

  return useMemo(
    () => ({
      sight,
      busy,
      read,
      refresh,
      refreshNote,
      resize,
      selection,
      select,
      selectionRefused,
      chosen,
      offerFilters,
      refreshable,
      setFilters,
      kept,
      keep,
      epicRefs,
      aimed,
      marks,
      parts,
    }),
    [
      sight,
      busy,
      read,
      refresh,
      refreshNote,
      resize,
      selection,
      select,
      selectionRefused,
      chosen,
      offerFilters,
      refreshable,
      setFilters,
      kept,
      keep,
      epicRefs,
      aimed,
      marks,
      parts,
    ],
  )
}

/**
 * Whether two choices say the same thing, key by key.
 *
 * Written here rather than reached for from a library because it is three lines
 * and because what it is for is specific: the host rebuilds this record on every
 * context, so identity is worthless and only the contents mean anything. A
 * `JSON.stringify` comparison would have depended on key order, which nothing
 * promises.
 */
function agrees(one: FilterChoice, other: FilterChoice): boolean {
  const mine = Object.keys(one)
  const theirs = Object.keys(other)
  return (
    mine.length === theirs.length &&
    mine.every((key) => {
      const a = one[key]
      const b = other[key]
      /* A toggles group's value is a list, and two lists are never `===`. In
         order, because the host keeps the order things were switched on in. */
      return Array.isArray(a) && Array.isArray(b) ? same(a, b) : a === b
    })
  )
}

/** Two lists of strings, element by element. */
function same(one: readonly string[], other: readonly string[]): boolean {
  return one.length === other.length && one.every((value, at) => value === other[at])
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * The refs an epic names, out of what `steps.list` and `epic.get` answered.
 *
 * Read leniently, because the protocol gives neither answer a schema — a module
 * reading them is reading the host's own material. What is taken: every string
 * in every step's `refs`, from either answer, and the epic's `umbrella`. In the
 * order they were found and once each; anything that is not a non-empty string
 * is not a ref and is skipped.
 */
export function namedBy(steps: unknown, epic: unknown): string[] {
  const out = new Set<string>()
  const take = (value: unknown) => {
    if (typeof value === 'string' && value) out.add(value)
  }
  const fromSteps = (list: unknown) => {
    if (!Array.isArray(list)) return
    for (const step of list) if (isObject(step) && Array.isArray(step.refs)) step.refs.forEach(take)
  }
  if (isObject(steps)) fromSteps(steps.steps)
  if (isObject(epic)) {
    take(epic.umbrella)
    fromSteps(epic.steps)
  }
  return [...out]
}

/**
 * What the picked-out containers are showing, as one list, or `null` when no
 * container other than this one is picked out. See `aimed` on `Kehikot`.
 */
export function aimedAt(containers: readonly CanvasContainer[], self: string): string[] | null {
  const picked = containers.filter((container) => container.selected && container.module !== self)
  if (!picked.length) return null
  return [...new Set(picked.flatMap((container) => container.showing?.refs ?? []))]
}
