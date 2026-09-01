import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ask, type Fetcher } from '@/live/ask.ts'
import type { Sight } from '@/live/sight.ts'
import { filterChoiceSchema, type FilterChoice, type FilterGroup } from 'roadmap-module-protocol'
import {
  HostRefused,
  connect,
  type Connection,
  type HostEvents,
  type Refusal,
} from 'roadmap-module-protocol/client'

/**
 * The bridge, as one React value.
 *
 * `roadmap-module-protocol/client` is the wire and knows no React; this is the
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
 * It is also the only file that decides WHEN a read happens, which used to be a
 * trivial question and is not any more. See `standingOn` below.
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

export interface Roadmap {
  sight: Sight
  /**
   * Whether a read is in flight right now.
   *
   * Held beside `sight` rather than inside it, and that separation is the whole
   * of "the container stays usable while the network is being waited on". A read that
   * happens over rows already on screen must not throw them away: the list goes
   * on scrolling, the filter goes on filtering, the selection goes on being the
   * selection, and the only thing that changes is a word in the header. Folded
   * into `sight` as a state, every refresh would blank the container for as long as
   * GitHub took, which is the failure this flag exists to make impossible.
   *
   * `sight.at === 'asking'` is the other case — busy AND nothing to show — and
   * that one is a whole container, because there is genuinely nothing else to draw.
   */
  busy: boolean
  /**
   * Read the tracker again, deliberately.
   *
   * `fresh` is what the Refresh control sends, and it is the only way past the
   * cache. Everything else — a context arriving, a project changing — takes the
   * cache when it is young enough, because a list that costs a network call
   * every time somebody glances at a canvas is a list that spends a rate limit
   * nobody agreed to. See the essay in `tracker/cache.ts`.
   */
  read: (fresh: boolean) => void
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
   * through `roadmap.context`.
   *
   * The alternative, an optimistic local copy corrected by the echo, would draw
   * a tick for a selection the host had not made, and the two would disagree
   * exactly in the cases that matter: a host that refused, a host that clamped
   * the list, a second module that changed it in the same breath. So there is no
   * local copy at all, and a click that produced no context produced no tick —
   * which is a visible symptom of a real problem rather than a hidden one.
   *
   * Nothing about this changed when the rows started coming from GitHub, and
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
   * `roadmap.context` with `filters` in it, which is where `chosen` above comes
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
   * one, which is the whole reason the message exists. This app is the case that
   * proves it: a reading can come out of the cache beside the project minutes or
   * hours after it was taken, and a failed read leaves the previous reading on
   * screen with its own older timestamp. A host dating the list from the moment
   * it asked would be wrong in both, silently, in the one place this page is
   * most careful to be honest — see the caching essay in `tracker/cache.ts`, and
   * the three sentences the header used to draw.
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

export function useRoadmap(id: string, onGoto: GotoHandler, fetcher: Fetcher = fetch): Roadmap {
  const [sight, setSight] = useState<Sight>({ at: 'listening' })
  const [busy, setBusy] = useState(false)
  const [selection, setSelection] = useState<string[]>([])
  const [selectionRefused, setSelectionRefused] = useState<Refusal | null>(null)
  const [chosen, setChosen] = useState<FilterChoice>({})
  const [kept, setKept] = useState<string | null | undefined>(undefined)
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

  /* Same reasoning, for the same reason: a caller that passed an inline
     function would otherwise re-run every effect in this file on every render. */
  const fetching = useRef(fetcher)
  fetching.current = fetcher

  /**
   * The read in flight, and the one before it.
   *
   * Two mechanisms and they do different jobs. `inFlight` is an
   * `AbortController`, and aborting it stops a `fetch` the answer to which
   * nobody wants — which also stops the subprocess behind it being waited on.
   * `asking` is a counter, and it is what stops a slow answer from BECOMING the
   * page after a newer one already has: projects switch faster than GitHub
   * answers, and without it the previous project's list arrives second and
   * quietly replaces the current one. A list of the right length, under the
   * right heading, about the wrong repository.
   *
   * Both, rather than either. Aborting alone leaves the window where an answer
   * has already been parsed; counting alone leaves a subprocess running for a
   * project nobody is looking at.
   */
  const inFlight = useRef<AbortController | null>(null)
  const asking = useRef(0)

  /**
   * The project the page is standing on, as the host last said it.
   *
   * Three values and not two: a path, `null` for "the host says there is no
   * project folder", and `undefined` for "no context has been read yet".
   * Collapsing the last two would make the first context of a conversation that
   * names no project look like a repeat of a state the page was already in.
   *
   * ## When a read happens, which is the question this whole file answers
   *
   * On the project CHANGING, and on the Refresh control. Not on a context
   * arriving, and not on a timer, and never on a render.
   *
   * Context stopped being a message that only ever means "the reader moved". It
   * carries the canvas's selection, so the host sends one after every
   * `selection.set` — including ours, a few milliseconds after a click. Reading
   * the tracker on each of those would be a network call and a subprocess per
   * tick of a checkbox, it would throw the reading away each time, and the click
   * that caused it would look like a bug in the list.
   *
   * So the read is keyed to the project changing. A repeated context about the
   * same project is a normal event and the correct response to it is to read the
   * parts that did change — the theme and the selection — and to leave the
   * reading alone.
   *
   * There is no interval anywhere in this module, deliberately. An interval is a
   * program spending somebody's GitHub rate limit while nobody is looking at the
   * container, and it buys freshness that a timestamp beside a button buys honestly.
   * The cache decides whether a project change costs a call at all; see
   * `tracker/cache.ts`.
   */
  const standingOn = useRef<string | null | undefined>(undefined)

  const read = useCallback((fresh: boolean) => {
    const project = standingOn.current
    if (!project) return

    const mine = (asking.current += 1)
    inFlight.current?.abort()
    const stop = new AbortController()
    inFlight.current = stop

    setBusy(true)
    /* Only when there is nothing to show. A read over rows already on screen
       leaves them there and says what it is doing in the header — see `busy`
       above, and the header in `app.tsx`. */
    setSight((was) => (was.at === 'read' && was.project === project ? was : { at: 'asking', project }))

    void ask(project, fresh, stop.signal, fetching.current).then((next) => {
      if (asking.current !== mine) return
      setBusy(false)
      /* `null` is an abort, which means a newer read is on its way and this
         answer is about a project the reader has already left. */
      if (next) setSight(next)
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
      context: {
        projectPath?: string | null
        theme: 'light' | 'dark'
        selection: string[]
        filters?: FilterChoice
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

      /* Read once, defensively, and treated as absent unless it is a non-empty
         string. The protocol says the host vouches for it being absolute; this
         page does not check that, because the door does and is the thing that
         would act on it. */
      const project = typeof context.projectPath === 'string' && context.projectPath ? context.projectPath : null

      const moved = project !== standingOn.current
      standingOn.current = project
      if (!moved) return

      if (project) read(false)
      else {
        inFlight.current?.abort()
        asking.current += 1
        setBusy(false)
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
       * `read(true)` — the same thing the deliberate Refresh in this app's own
       * header used to do, which is the only honest reading of the request. The
       * protocol is explicit that a module must not be told whether a tick was
       * automatic, precisely so that it cannot take the cache on one and not on
       * the other; and taking the cache on either would make this control a
       * button that sometimes does nothing, which is the failure the whole
       * caching essay in `tracker/cache.ts` is arranged around. Somebody asking
       * for a fresh reading gets one.
       *
       * Handled here rather than passed in like `onGoto`, because everything it
       * needs is already in this file: `read` is defined above, and the decision
       * about WHEN a read happens has always lived here rather than in the view.
       */
      onRefresh: () => read(true),
    })
    host.current = live
    live.listen()

    const grace = setTimeout(() => {
      setSight((was) => (was.at === 'listening' ? { at: 'unhosted' } : was))
    }, GREETING_GRACE_MS)

    return () => {
      clearTimeout(grace)
      /* The read goes with the listener. A page being torn down has no use for
         an answer, and leaving the fetch running would leave a subprocess being
         waited on for a container that no longer exists. */
      inFlight.current?.abort()
      inFlight.current = null
      live.stop()
      /* Cleared only if it is still ours: under StrictMode the second mount has
         already assigned its own connection by the time some cleanups run. */
      if (host.current === live) host.current = null
    }
  }, [id, read])

  const resize = useCallback((height: number) => host.current?.resize(height), [])

  /* Sent whether or not anybody is listening. See `offerFilters` on `Roadmap`. */
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
   *   roadmap's answer.
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
        return { ok: false, why: 'The roadmap answered that request in a shape this app could not read.' }
      }
      return { ok: true, filters: held.data }
    } catch (error) {
      if (error instanceof HostRefused) return { ok: false, why: error.refusal.error }
      return { ok: false, why: 'This app failed while reading the roadmap’s answer.' }
    }
  }, [])

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
   * module that needs the kind reads the tracker where this page read it. So:
   * refs, spelled exactly as this list draws them, and nothing more.
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
    () => ({
      sight,
      busy,
      read,
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
    }),
    [
      sight,
      busy,
      read,
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
  return mine.length === theirs.length && mine.every((key) => one[key] === other[key])
}
