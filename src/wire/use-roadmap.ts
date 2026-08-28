import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { Sight } from '@/live/sight.ts'
import { HostRefused, connect, type Host, type HostEvents } from './host.ts'

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

  const look = useCallback((epic: string) => {
    const mine = (asking.current += 1)
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
    const arrived = (context: { epic: string | null; theme: 'light' | 'dark' }) => {
      const root = document.documentElement
      root.classList.toggle('dark', context.theme === 'dark')
      root.classList.toggle('light', context.theme === 'light')
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
    let ready = false
    let early: Parameters<typeof arrived>[0] | null = null
    const held = (context: Parameters<typeof arrived>[0]) => {
      if (ready) arrived(context)
      else early = context
    }

    host.current = connect(id, {
      onHello: held,
      onContext: held,
      onGoto: (message, answer) => goto.current(message, answer),
    })
    ready = true
    if (early) arrived(early)

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

  return useMemo(() => ({ sight, epics, look, resize }), [sight, epics, look, resize])
}
