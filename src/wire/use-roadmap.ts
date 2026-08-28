import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { Sight } from '@/live/sight.ts'
import { HostRefused, connect, type Host, type HostEvents, type Refusal } from './host.ts'

/**
 * The bridge, as one React value.
 *
 * `host.ts` is the wire and knows no React; this is the only file that turns
 * messages into state, and it is deliberately the only one. Two places driving
 * a `Sight` would eventually disagree about which of the six a page is in, and
 * "which absence is this" is the one question this app cannot afford to be
 * confused about.
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

/** One row of `epics.list`, as much of it as this app reads. */
export interface EpicBrief {
  epic: string
  title: string
}

export interface Roadmap {
  sight: Sight
  /** Every epic the host will name, for the picker. Empty until asked and answered. */
  epics: EpicBrief[]
  /** Ask about one epic — from the picker, or again after a refusal. */
  look: (epic: string) => void
  /** Say how tall this page would like its frame to be. Silent when nothing is framing it. */
  resize: (height: number) => void
  /**
   * What the canvas has picked out, as the host last said it.
   *
   * Never what this page asked for. The protocol's essay on `selection` in
   * `contextSchema` is the argument and it is worth restating here, because the
   * shape of this hook is the place the argument is either kept or quietly
   * broken: a selection is a fact about the canvas, in the same family as which
   * epic is open, and the host owns it. This page asks for a change and then
   * finds out what happened the same way every other framed module does —
   * through `roadmap.context`.
   *
   * The alternative, an optimistic local copy corrected by the echo, would draw
   * a tick for a selection the host had not made, and the two would disagree
   * exactly in the cases that matter: a host that refused, a host that clamped
   * the list, a second module that changed it in the same breath. So there is no
   * local copy at all, and a click that produced no context produced no tick —
   * which is a visible symptom of a real problem rather than a hidden one.
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

/**
 * Read one epic brief defensively.
 *
 * The host promised nothing about this shape — the protocol is explicit that a
 * response is `unknown` — so a row with no usable name is not an epic we can
 * ask about and is left out of the picker. That is not the omission this app
 * forbids: a picker is a set of things to press, and a button that cannot ask a
 * question is worse than no button.
 *
 * ## Two spellings of the name, and why both are read
 *
 * The protocol package renamed this material from journeys to epics, and
 * `epics.list` is the method now. The hosts that exist today were written
 * against the older spelling and answer with rows carrying `slug`. Reading
 * either is not indecision: the field is a name for the same string, the
 * protocol has never said what a response looks like, and a module that read
 * only the newer spelling would show an empty picker against every host in the
 * field while being, technically, correct. When no host answers `slug` any
 * more, the second line goes.
 */
function briefs(data: unknown): EpicBrief[] {
  if (!Array.isArray(data)) return []
  const out: EpicBrief[] = []
  for (const row of data) {
    if (typeof row !== 'object' || row === null) continue
    const named = row as { epic?: unknown; slug?: unknown; title?: unknown }
    const epic = typeof named.epic === 'string' ? named.epic : typeof named.slug === 'string' ? named.slug : ''
    if (!epic) continue
    out.push({ epic, title: typeof named.title === 'string' ? named.title : epic })
  }
  return out
}

export function useRoadmap(id: string, onGoto: GotoHandler): Roadmap {
  const [sight, setSight] = useState<Sight>({ at: 'listening' })
  const [epics, setEpics] = useState<EpicBrief[]>([])
  const [selection, setSelection] = useState<string[]>([])
  const [selectionRefused, setSelectionRefused] = useState<Refusal | null>(null)
  const [kept, setKept] = useState<string | null | undefined>(undefined)
  const host = useRef<Host | null>(null)

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
   * Which question is the current one.
   *
   * Epics switch faster than a slow host answers, and without this the
   * answer to the previous epic arrives after the answer to this one and
   * quietly replaces it — a list of the right length, under the right title,
   * about the wrong work. Every answer checks that it is still the one being
   * waited for before it is allowed to become the page.
   */
  const asking = useRef(0)

  /**
   * The epic the last context put this page on.
   *
   * Kept because context stopped being a message that only ever means "the
   * reader moved". It now also carries the canvas's selection, so the host sends
   * one after every `selection.set` — including ours, a few milliseconds after a
   * click. Re-asking `live.get` on each of those would throw the whole reading
   * away and put the page back into `asking` every time somebody ticked a
   * checkbox: twenty-four rows would vanish, a paragraph would say the question
   * was out, and the rows would come back a moment later having lost the
   * reader's scroll position. The click that caused it would look like a bug in
   * the list.
   *
   * So the fetch is keyed to the epic CHANGING rather than to a context
   * arriving. A repeated context about the same epic is now a normal event and
   * the correct response to it is to read the parts that did change — the theme
   * and the selection — and to leave the reading alone.
   *
   * The cost, stated plainly: this page no longer refetches when a host re-sends
   * the same epic to mean "you were hidden and are visible again". That was
   * never a promise the protocol made, and the fix if it is ever wanted is a
   * context field saying so, not a refetch on every tick.
   *
   * Three values and not two: a slug, `null` for "the host says no epic is
   * open", and `undefined` for "no context has been read yet". Collapsing the
   * last two would make the first context of a conversation that names no epic
   * look like a repeat of a state the page was already in, and the picker that
   * belongs to that state would never be asked for.
   */
  const standingOn = useRef<string | null | undefined>(undefined)

  const look = useCallback((epic: string) => {
    const mine = (asking.current += 1)
    /* Set here rather than only where a context is read, because the picker in
       `absence.tsx` calls this directly. Without it, the host's next context —
       naming the epic the reader just chose — would read as a change and start
       the same question over. */
    standingOn.current = epic
    setSight({ at: 'asking', epic })
    const current = host.current
    if (!current) return
    void current
      /**
       * Both spellings of the same name, and this one is worth reading.
       *
       * `methodParams['live.get']` takes `{ epic }` in the protocol as it
       * stands. The host this app was built beside reads `params.slug` and
       * refuses anything else with "needs a journey slug" — the package
       * renamed this material and the hosts have not caught up. Sending only
       * the newer key would make this app correct and useless; sending only
       * the older one would make it wrong the day a host is updated.
       *
       * So it sends both, which no host can be confused by: each reads the key
       * it knows and neither sees a conflicting value, because there is only
       * one name here spelled twice. The second key comes out when no host in
       * the field reads it — and `briefs()` below has the receiving half of
       * exactly the same transition, for the same reason.
       */
      .request('live.get', { epic, slug: epic })
      .then((data) => {
        if (asking.current !== mine) return
        /* `null` is the roadmap's own word for "there is no reading for this
           epic" — see `live.get` in the host: it answers `readLive(epic) ??
           null`. It is not an error and it is not an empty list, and the whole
           of `sight.ts` exists so that it does not become either. */
        if (data === null || data === undefined) setSight({ at: 'unread', epic })
        else setSight({ at: 'read', epic, live: data })
      })
      .catch((error: unknown) => {
        if (asking.current !== mine) return
        if (error instanceof HostRefused) setSight({ at: 'refused', epic, refusal: error.refusal })
        else {
          setSight({
            at: 'refused',
            epic,
            refusal: { reason: 'failed', error: 'This app failed while reading the roadmap’s answer.' },
          })
        }
      })
  }, [])

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
      context: { epic: string | null; theme: 'light' | 'dark'; selection: string[] },
      /**
       * Whether this was a greeting rather than a later context, which decides
       * whether the reading is asked for again.
       *
       * A greeting always re-asks, because a greeting means the conversation is
       * new: the host greets on every frame LOAD, so one arriving is a page that
       * has just come into existence, or a frame that reloaded itself and has
       * forgotten everything it knew. Answering that with "the epic has not
       * changed, so there is nothing to do" would leave a page with no rows and
       * no question outstanding, forever.
       *
       * `StrictMode` is the case that proves it in the smallest possible space.
       * The effect below is torn down and set up again on purpose in
       * development; the teardown refuses every question still in flight, and
       * the setup replays the greeting out of the mailbox. If the replayed
       * greeting were deduplicated against the epic the refused question had
       * been about, the page would settle on the refusal and stay there — in
       * development only, which is the worst place for a bug to be discovered.
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
       * anything decides whether the epic moved.
       *
       * That order is the whole of "the UI follows rather than showing stale
       * ticks" when the reader changes epic. The host clears the selection as
       * part of moving, and it says so in the same message that names the new
       * epic — so a page that read the selection only on the branch where the
       * epic stayed put would keep drawing the previous epic's ticks against
       * whatever rows happen to share a ref with it. Reading it first means the
       * clear lands whether the epic moved or not, and the refetch below is a
       * separate question.
       */
      setSelection(context.selection)

      const moved = context.epic !== standingOn.current
      standingOn.current = context.epic
      if (!moved) return

      if (context.epic) look(context.epic)
      else {
        setSight({ at: 'no-epic' })
        /* Only here, and only once it matters. A module that asked for the
           epic list on every load would be asking a question whose answer
           it has no use for while an epic is open. */
        /* And the method itself has two names, for the reason the params do.
           `unknown-method` is the protocol's own word for "this host has never
           heard of that", which makes it the one refusal it is safe to answer
           by asking the older question — anything else is a host that knows the
           method and said no, and asking again under another name would be this
           app arguing with it. */
        const list = (method: string) => host.current?.request(method, {}) ?? Promise.resolve(null)
        void list('epics.list')
          .catch((error: unknown) =>
            error instanceof HostRefused && error.refusal.reason === 'unknown-method'
              ? list('journeys.list')
              : Promise.reject(error),
          )
          .then((data) => setEpics(briefs(data)))
          .catch(() => setEpics([]))
      }
    }

    /**
     * The connection is stored BEFORE the greeting is acted on, and the order
     * is the whole of a bug that made this page hang forever.
     *
     * `connect` subscribes to the mailbox, and the mailbox replays what has
     * already arrived SYNCHRONOUSLY, inside that call. The greeting almost
     * always arrives before React mounts — that is the entire reason the
     * mailbox exists — so `onHello` fired on this line, before `host.current`
     * had been assigned. `look` reads `host.current`, found null, returned
     * early, and left the page reading "Asking about …". It started no timer
     * either, so nothing ever timed out: not a slow answer, not a refusal, just
     * a sentence that never changed.
     *
     * Worse, it worked often enough to look fine. When the host happened to
     * greet after this effect returned — a slow module, a reload, a busy
     * machine — the assignment had already happened and everything behaved. A
     * race whose good outcome is the common one is the kind that ships.
     *
     * So anything that fires too early is held and delivered the moment the
     * assignment is done. Not deferred to a microtask: that would fix the
     * symptom and leave the next reader to work out why the order mattered.
     */
    type Arrival = [
      context: { epic: string | null; theme: 'light' | 'dark'; selection: string[] },
      greeting: boolean,
      state: string | null,
    ]
    let ready = false
    /* A box rather than a bare `let`, and only because of the compiler: this is
       assigned inside a callback that `connect` invokes, which the flow analysis
       cannot see, so a plain variable is narrowed to `null` for the rest of this
       function and the replay below stops type-checking. A property is not
       narrowed across a call, which is the truth here. */
    const early: { arrival: Arrival | null } = { arrival: null }
    const held = (...arrival: Arrival) => {
      if (ready) arrived(...arrival)
      else early.arrival = arrival
    }

    host.current = connect(id, {
      onHello: (context, state) => held(context, true, state),
      onContext: (context) => held(context, false, null),
      onGoto: (message, answer) => goto.current(message, answer),
    })
    ready = true
    if (early.arrival) arrived(...early.arrival)

    const grace = setTimeout(() => {
      setSight((was) => (was.at === 'listening' ? { at: 'unhosted' } : was))
    }, GREETING_GRACE_MS)

    return () => {
      clearTimeout(grace)
      host.current?.stop()
      host.current = null
    }
  }, [id, look])

  const resize = useCallback((height: number) => host.current?.resize(height), [])

  /**
   * Ask the host to make this the selection, and say nothing about it here.
   *
   * ## Refs, and deliberately nothing else
   *
   * This page knows more than it sends. It read `gh#131` out of `ghIssues` and
   * `gh#105` out of `ghPrs`, and the bag is the ONLY thing that says which of
   * them is a pull request — see the essay in `collect.ts`. Passing that along
   * would save the next module a lookup and is exactly what `selection.set`
   * forbids: the host relays this into a context every framed module trusts, and
   * a host can vouch that these are the refs somebody picked while it cannot
   * vouch that one of them is an issue, because it was told and never checked. A
   * module that needs the kind asks `live.get` and reads it where this page read
   * it. So: refs, spelled exactly as this list draws them, and nothing more.
   *
   * ## No state is set on the way out
   *
   * The obvious next line — `setSelection(refs)` — is the bug this whole design
   * is arranged to avoid, and it would look like an improvement. See `selection`
   * on `Roadmap` above. What comes back through `roadmap.context` is the answer;
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
          : { reason: 'failed', error: 'This app failed while reading the roadmap’s answer.' },
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

  return useMemo(
    () => ({ sight, epics, look, resize, selection, select, selectionRefused, kept, keep }),
    [sight, epics, look, resize, selection, select, selectionRefused, kept, keep],
  )
}
