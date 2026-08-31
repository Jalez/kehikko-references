import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ask, type Fetcher } from '@/live/ask.ts'
import type { Sight } from '@/live/sight.ts'
import { HostRefused, connect, type Host, type HostEvents, type Refusal } from './host.ts'

/**
 * The bridge, as one React value.
 *
 * `host.ts` is the wire and knows no React; this is the only file that turns
 * messages into state, and it is deliberately the only one. Two places driving
 * a `Sight` would eventually disagree about which state a page is in, and
 * "which absence is this" is the one question this app cannot afford to be
 * confused about.
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
      context: { projectPath?: string | null; theme: 'light' | 'dark'; selection: string[] },
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
     * The connection is stored BEFORE the greeting is acted on, and the order
     * is the whole of a bug that made this page hang forever.
     *
     * `connect` subscribes to the mailbox, and the mailbox replays what has
     * already arrived SYNCHRONOUSLY, inside that call. The greeting almost
     * always arrives before React mounts — that is the entire reason the
     * mailbox exists — so `onHello` fired on this line, before `host.current`
     * had been assigned. Anything reading `host.current` found null and
     * returned early, and the page was left reading a sentence that never
     * changed.
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
      context: { projectPath?: string | null; theme: 'light' | 'dark'; selection: string[] },
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
      /* The read goes with the listener. A page being torn down has no use for
         an answer, and leaving the fetch running would leave a subprocess being
         waited on for a container that no longer exists. */
      inFlight.current?.abort()
      inFlight.current = null
      host.current?.stop()
      host.current = null
    }
  }, [id, read])

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
    () => ({ sight, busy, read, resize, selection, select, selectionRefused, kept, keep }),
    [sight, busy, read, resize, selection, select, selectionRefused, kept, keep],
  )
}
