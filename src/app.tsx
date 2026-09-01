import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'

import { ID } from '../manifest.ts'
import { Button } from '@/components/ui/button'
import type { Fetcher } from '@/live/ask.ts'
import { collect, generatedAt } from '@/live/collect.ts'
import { reading, writing } from '@/live/keep.ts'
import { DEFAULT_ORDER, order, type Ordering } from '@/live/order.ts'
import { hides, hostNarrowing, narrowing, offer, sift, siftingOf } from '@/live/sift.ts'
import { useRoadmap, type GotoHandler, type Settled } from '@/wire/use-roadmap.ts'
import {
  Asking,
  Listening,
  NoProject,
  NothingFound,
  NothingMatches,
  Troubled,
  Unhosted,
  projectName,
} from '@/view/absence.tsx'
import { ReferenceList } from '@/view/reference-list.tsx'
import { Toolbar } from '@/view/toolbar.tsx'

/**
 * The composition, and only the composition.
 *
 * Every hard thing this app does is somewhere else: the wire in `wire/`, the
 * running of `gh` in `tracker/`, the reading of a reading in
 * `src/live/collect.ts`, the narrowing in `src/live/sift.ts`, the words for each
 * absence in `src/view/absence.tsx`. What is left here is the one job nothing
 * else can do — deciding which of them the reader is looking at — and that
 * decision is a single run of `if`s over `Sight`, which is the shape it should
 * be. If this file ever grows a second concern, the concern is in the wrong
 * file.
 */

/** One row, in CSS pixels. Stated once, because two places believe it: the row's height and the height we ask for. */
const ROW_HEIGHT = 36

/**
 * The tallest frame this app will ask for.
 *
 * A module can ask for its full content height, and with four hundred rows that
 * is fourteen thousand pixels — a host page with a scrollbar the length of a
 * street, inside which this list has no scrollbar of its own, so the reader
 * scrolls the roadmap to read the module and loses the toolbar off the top on
 * the way. Asking for a height the list is worth reading in, and scrolling
 * inside it, keeps the filter and the count on screen while somebody works
 * through four hundred rows. The host clamps whatever we ask for regardless;
 * this is the number we mean.
 */
const TALLEST = 720

/**
 * The `fetch` this app reads its tracker with, handed in for tests.
 *
 * Defaulted, so nothing in the page or in `main.tsx` has to know it is a
 * parameter, and present at all so that `test/app.test.tsx` can drive the whole
 * composition — the read, the rows, the selection round trip through the real
 * bridge — with no server, no subprocess and no network.
 */
export function App({ fetcher }: { fetcher?: Fetcher } = {}) {
  /**
   * The typed query, which is the only part of the narrowing this page still
   * holds.
   *
   * `kind` and `state` are the host's now — offered as `roadmap.filters`, drawn
   * in the container header, and sent back in `context.filters`. There is no
   * local copy of them for the same reason there is no local copy of the
   * selection: a second answer would go stale on its own schedule, and a page
   * that drew what it asked for rather than what the host settled on would
   * disagree with the header in exactly the cases that matter.
   */
  const [query, setQuery] = useState('')
  const [ordering, setOrdering] = useState<Ordering>(DEFAULT_ORDER)
  const [landedOn, setLandedOn] = useState<string | null>(null)
  /**
   * Why the last `filters.set` did not take, if it did not.
   *
   * The host may decline — the container is pinned, or is not on the kehikko
   * that is open — and a `Clear` that then cleared only the query would be a
   * button quietly doing two thirds of what it says. Held so that the page can
   * say which third it could not do, in the host's own words, beside the list.
   * Null the moment anything is asked again.
   */
  const [filterRefused, setFilterRefused] = useState<string | null>(null)
  const frame = useRef<HTMLDivElement>(null)

  /**
   * Every row of the current reading, before any narrowing.
   *
   * Held apart from the sifted list because three things need the whole of it:
   * the count that says how much is hidden, the "show all" that puts it back,
   * and `goto`, which has to be able to find a reference the filter is hiding.
   */
  const [rows, setRows] = useState<ReturnType<typeof collect>>([])

  /**
   * The `goto` handler, reached through a ref so that the bridge can be
   * connected before the handler exists.
   *
   * Answering a walk now needs `setFilters`, which comes out of `useRoadmap`,
   * which is handed the handler — so one of the two has to be indirect. It is
   * this one, because `use-roadmap.ts` already reads the newest handler out of a
   * ref on every `goto` for its own reason (a listener rebuilt on every render
   * would be a torn-down listener during the millisecond a host chose to greet
   * in). This trampoline is stable and the thing it calls is not, which is
   * exactly the arrangement that file expects.
   */
  const walk = useRef<GotoHandler>(() => {})
  const onGoto = useCallback<GotoHandler>((message, answer) => walk.current(message, answer), [])

  const {
    sight,
    busy,
    read,
    resize,
    selection,
    select,
    selectionRefused,
    chosen,
    offerFilters,
    setFilters,
    kept,
    keep,
  } = useRoadmap(ID, onGoto, fetcher)

  /**
   * The whole narrowing: this page's query, and the two groups the host holds.
   *
   * Composed on every render rather than stored, because storing it would be the
   * local copy of the host's choice that `chosen` exists to avoid. Everything
   * downstream — `sift`, the count, `narrowing`, `Clear` — takes the composed
   * value and cannot tell which half came from where, which is right: a reader
   * looking at four rows of four hundred does not care which control did it.
   */
  const sifting = useMemo(() => siftingOf(query, chosen), [query, chosen])

  /**
   * What this module can be narrowed by, announced whenever the words change.
   *
   * The words carry counts — `Issues 17` — so "whenever the words change" is
   * "whenever a reading changes", which is what this effect depends on. The
   * counts are over the whole reading and ignore the query, deliberately;
   * otherwise this would re-send the whole offer on every keystroke to keep a
   * number current in a menu that is usually closed. See `offer` in `sift.ts`.
   *
   * `null` is "nothing to say yet" and is NOT sent. An empty offer is a claim
   * the host acts on by pruning this container's stored choice, and making that
   * claim before a reading has arrived would erase the remembered filter on
   * every single load — the setting would appear to work perfectly and be
   * forgotten every time the page was reloaded. An empty ARRAY is a different
   * message and is sent: a project whose tracker holds nothing has genuinely
   * nothing to be narrowed by, and the control should go away rather than sit
   * there offering `Issues 0`.
   */
  useEffect(() => {
    const groups = offer(rows, sight.at === 'read')
    if (groups) offerFilters(groups)
  }, [rows, sight.at, offerFilters])

  /**
   * One press puts everything back — including the two thirds this page does not
   * hold.
   *
   * The query is cleared here and the container's filters are asked to go back
   * to their resting options, in one call, because `filters.set` takes a whole
   * choice and `{}` is exactly "clear the narrowing". Per-group clearing would
   * produce a context per group and a page seen part-way through its own reset.
   *
   * The host may decline, and then this says so rather than pretending. That is
   * the honest half of a request: a `Clear` that silently cleared the query and
   * left the header narrowing the list would teach a reader that the button does
   * not work, on the one control whose entire promise is that it does.
   */
  const clearAll = useCallback(async (): Promise<Settled> => {
    setQuery('')
    setFilterRefused(null)
    const settled = await setFilters({})
    if (!settled.ok) setFilterRefused(settled.why)
    return settled
  }, [setFilters])

  /**
   * Answering a host that says "go to this reference".
   *
   * Four things happen here that are easy to get wrong and all four matter:
   *
   * 1. **What is hiding the target is cleared, wherever it is held.** Answering
   *    `found: true` while the row is filtered out walks the reader to a page
   *    where their reference is invisible, which is worse than the fallback link
   *    they would have got for `found: false`. The query is cleared here; the
   *    kind and the state are the host's, so they are ASKED for.
   * 2. **The answer is read rather than assumed.** What comes back from
   *    `filters.set` is what the host SETTLED on, which is deliberately not what
   *    was asked for. So the settled choice is put back through the same `hides`
   *    the list uses, against the actual row — and only a row that survives that
   *    is answered `found: true`.
   * 3. **A host that declines gets the honest answer, which is the old one.**
   *    `found: false` with the host's own sentence, so a reader gets the
   *    fallback link instead of a page where their reference is not drawn. This
   *    is the behaviour the essay in `sift.ts` used to protect by refusing to
   *    move the control at all; it is protected now by reading a refusal.
   * 4. **`found` is answered from the whole reading, not from what is drawn.**
   *    What is drawn is a function of a narrowing; what exists is not.
   *
   * And a `goto` naming a step rather than a reference is refused rather than
   * answered vaguely. This app lists references and has never known anything
   * about steps.
   */
  walk.current = (message, answer) => {
    if (!message.ref) {
      answer(false, 'This app lists references and knows nothing about steps.')
      return
    }
    const row = rows.find((candidate) => candidate.ref === message.ref)
    if (!row) {
      answer(
        false,
        rows.length
          ? `Nothing in the reading this app is showing names ${message.ref}.`
          : `This app has no reading yet, so it cannot say where ${message.ref} is.`,
      )
      return
    }

    setQuery('')
    setLandedOn(row.ref)

    /* Nothing the host is holding is hiding anything, so there is nothing to
       ask for and nothing to wait on. The common case, and it answers in the
       same breath it always did. */
    if (!hostNarrowing(sifting)) {
      answer(true, '')
      return
    }

    setFilterRefused(null)
    void setFilters({}).then((settled) => {
      if (!settled.ok) {
        setFilterRefused(settled.why)
        answer(
          false,
          `${message.ref} is in this list, and the roadmap would not move this container’s filters off it: ${settled.why}`,
        )
        return
      }
      /* What the host settled on, against this row, through the same function
         the list uses. A settled choice that still hides it is not a success
         with a caveat — it is a walk to an invisible row, which is the one thing
         this handler exists to refuse. */
      if (hides(siftingOf('', settled.filters), row)) {
        answer(false, `${message.ref} is in this list, but this container’s filters are still hiding it.`)
        return
      }
      answer(true, '')
    })
  }

  /**
   * The kept string this page has already acted on.
   *
   * It holds the VALUE rather than a "have we done it yet" flag, and the
   * difference is what happens when a second greeting arrives. A boolean would
   * make the first greeting the only one that could ever restore anything; a
   * greeting means the conversation is new — see the note in `use-roadmap.ts` —
   * and the string that comes with it is authoritative again. Comparing values
   * means a repeated greeting carrying the same string does nothing, which is
   * the behaviour a boolean was reaching for, and a greeting carrying a
   * different one is obeyed, which a boolean would have refused.
   *
   * It guards the write as well: while this is `undefined` nothing has been
   * restored, so writing would save the defaults this component starts with over
   * the settings the host is in the middle of handing back — the memory erased
   * by the very load that was meant to restore it.
   */
  const restored = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    /* `undefined` is "no greeting yet", and it is the whole reason `kept` has
       three values: applying defaults during it looks exactly like applying them
       because the host genuinely had nothing, and only one of those is a
       decision. Standalone, this never fires, `restored` stays undefined, and
       nothing is ever written — which is right, because there is nobody to
       write to. */
    if (kept === undefined || kept === restored.current) return
    restored.current = kept
    /* A host that keeps nothing, or keeps something unreadable, puts the page in
       its defaults rather than leaving whatever is on screen. On a first load
       those are the same thing and the line looks redundant; on a re-greeting
       they are not, and the alternative is a filter that survives the host
       explicitly saying it has forgotten one. */
    const remembered = reading(kept) ?? { query: '', ordering: DEFAULT_ORDER }
    setQuery(remembered.query)
    setOrdering(remembered.ordering)
  }, [kept])

  /**
   * Write the settings back, a moment after they stop changing.
   *
   * The delay is for the query, which changes on every keystroke: without it,
   * typing `notifications` is fourteen `state.set` calls, thirteen of which
   * describe a filter nobody ever had. Four hundred milliseconds is longer than
   * the gap between two keystrokes and shorter than the gap between typing and
   * doing anything else, so what gets kept is what somebody stopped on.
   *
   * The cleanup cancels the pending write on every change, so a page torn down
   * mid-word writes nothing rather than writing half a word — which is the right
   * way round: the cost of losing the last four hundred milliseconds of a filter
   * is that it is typed again, and the cost of keeping a half-typed one is a
   * page that comes back showing two rows of twenty-four for a reason nobody
   * remembers.
   *
   * Only the query and the order are in it. The kind and the state are kept by
   * the HOST now, per container, and a copy of them here would be a second
   * memory of one setting — see the essay in `live/keep.ts`.
   */
  useEffect(() => {
    if (restored.current === undefined) return
    const timer = setTimeout(() => {
      const now = writing({ query, ordering })
      /* Nothing is sent when the settings are still exactly what the host handed
         back. Restoring them sets state, which runs this effect, which would
         otherwise write the same string back on every single load — a call whose
         only possible effect is to overwrite a value with itself, made once per
         page, by every framed copy of this module. */
      if (now === restored.current) return
      restored.current = now
      keep(now)
    }, 400)
    return () => clearTimeout(timer)
  }, [query, ordering, keep])

  /**
   * The plain click: this row becomes the whole selection.
   *
   * And clicking the one selected row again clears the selection, which is the
   * only reason there is no "clear selection" button anywhere on this page. A
   * canvas has to be able to get back to nothing selected — the protocol says so
   * explicitly, an empty `refs` is a real call rather than an absence — and the
   * gesture people already reach for is pressing the thing again. A dedicated
   * button would be a control that is useless in the state it is most often
   * seen in, sitting in a toolbar this file is otherwise busy making smaller.
   *
   * It reads `selection` rather than any local memory, so "is this the only one
   * selected" is a question about what the host said, not about what was last
   * clicked here. Two containers disagreeing about that is exactly the failure the
   * round trip exists to prevent.
   */
  const pick = useCallback(
    (ref: string) => {
      const alone = selection.length === 1 && selection[0] === ref
      select(alone ? [] : [ref])
    },
    [selection, select],
  )

  /**
   * The checkbox: add or remove, leaving everything else alone.
   *
   * The order of what is already there is preserved and a new ref goes on the
   * end. It is the order somebody picked things in, it is the only order this
   * page has any information about, and sorting it would mean the list a
   * neighbouring module receives changes shape for reasons the reader did not
   * cause.
   */
  const toggle = useCallback(
    (ref: string) => {
      select(selection.includes(ref) ? selection.filter((other) => other !== ref) : [...selection, ref])
    },
    [selection, select],
  )

  /* One place turns a reading into rows, and it is an effect rather than a memo
     because `sight` changing to a different project has to REPLACE the rows
     rather than leave the previous project's on screen while the next arrives. */
  useEffect(() => {
    setRows(sight.at === 'read' ? collect(sight.live) : [])
    setLandedOn(null)
  }, [sight])

  /* Narrowed first, then ordered, and the order of those two is not arbitrary:
     ordering the whole reading and then filtering it does the same sort over
     rows nobody is going to see, which on four hundred references is most of the
     work for none of the result. Neither step can change what the other decides
     — a filter does not care about position and an order does not remove
     anything — so the cheaper arrangement is simply the right one. */
  const shown = useMemo(() => order(sift(rows, sifting), ordering), [rows, sifting, ordering])

  /**
   * Scrolling to the row a `goto` landed on, once it is actually drawn.
   *
   * This used to be a `requestAnimationFrame` inside the handler, which was
   * right when everything hiding the row was cleared by a `setState` in the same
   * tick. It is not right any more: clearing the host's two groups is a round
   * trip, and the rows do not change until the context comes back a few
   * milliseconds after the answer. A scroll in the next frame would look for a
   * row that is still filtered out and quietly do nothing.
   *
   * So the scroll waits for the list instead of for a frame. It fires once per
   * landing — the ref holds which one — because scrolling again on every later
   * render would drag a reader who had scrolled away back to the row they left.
   */
  const scrolledTo = useRef<string | null>(null)
  useEffect(() => {
    if (!landedOn) {
      scrolledTo.current = null
      return
    }
    if (scrolledTo.current === landedOn) return
    const row = frame.current?.querySelector(`[data-ref="${CSS.escape(landedOn)}"]`)
    if (!row) return
    scrolledTo.current = landedOn
    row.scrollIntoView({ block: 'center' })
  }, [landedOn, shown])

  /* What we would like to be, recomputed when the length of the list changes.
     Fire and forget: the host may ignore it, and this page is laid out to be
     correct at whatever height it actually gets. */
  useEffect(() => {
    resize(Math.min(96 + shown.length * ROW_HEIGHT, TALLEST))
  }, [shown.length, resize])

  const again = useCallback(() => read(true), [read])

  if (sight.at === 'listening') return <Listening />
  if (sight.at === 'unhosted') return <Unhosted />
  if (sight.at === 'no-project') return <NoProject />
  if (sight.at === 'asking') return <Asking project={sight.project} />
  if (sight.at === 'trouble') return <Troubled project={sight.project} trouble={sight.trouble} again={again} />

  const generated = generatedAt(sight.live)
  if (rows.length === 0 && !sight.trouble) return <NothingFound project={sight.project} generated={generated} />

  return (
    /* `@container` is the one thing this element does beyond stacking three
       boxes, and it is what every size decision below it is measured against. A
       module's width is its container's width, and a reader changes that by dragging
       a corner on somebody else's canvas: the window is never resized, no
       viewport breakpoint fires, and a layout keyed to `md:` would sit at its
       widest inside a column two hundred pixels across. So the header and the
       toolbar ask this element how wide they are; a row asks itself, because a
       row's own width is what its columns have to divide. */
    <div ref={frame} className="@container flex h-full flex-col">
      {/* It wraps, because the things here are a project name, a timestamp and a
          control, and none of them shortens. In a narrow container they take a line
          each. The alternative was truncating a name, which is the one kind of
          text on this page that has to be readable in full. */}
      <header className="flex flex-wrap items-baseline gap-x-2 border-b border-border px-3 py-1.5 text-xs break-words text-muted-foreground @md:py-2">
        {/* The short name, with the whole path on its `title`. A container 220 pixels
            wide cannot hold `/Users/somebody/Projects/roadmap` without pushing
            the page sideways, and the segment is what people call the thing. */}
        <span className="font-mono text-foreground" title={sight.project}>
          {projectName(sight.project)}
        </span>
        {/*
          Said once, here, rather than on every row: freshness is a fact about
          the reading and not about any one reference in it. Three different
          sentences, and the difference between them is the whole reason the
          door reports `from` rather than leaving it to be inferred —

            "reading GitHub…"  a call is out. The list below is still whatever
                               was last read, and still usable, which is the
                               point of not blanking the container.
            "read <when>"      this reading came off GitHub just now.
            "last read <when>" this reading came out of the cache beside the
                               project, and the button says how to change that.
        */}
        <span>
          {busy
            ? 'reading GitHub…'
            : generated
              ? `${sight.from === 'cache' ? 'last read' : 'read'} ${generated}`
              : 'this reading is not dated'}
        </span>
        {/*
          The deliberate refresh, and the only thing on this page that spends a
          network call on purpose.

          `ml-auto` rather than a fixed position, so that when the header wraps
          in a narrow container the button goes to the end of whichever line it lands
          on rather than sitting alone. `h-6` because the rest of this bar is
          `text-xs` and a default-height button doubles the header.

          It is labelled with a glyph and named in its tooltip, which is the
          same trade the tracker link on a row makes: a word here would cost the
          project name most of a 220-pixel line, and this control is reached for
          rarely enough that a recognisable glyph is fair. Disabled while a read
          is in flight, because two reads racing is two subprocesses and one
          answer that wins for no reason anybody could predict.
        */}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-6 px-1.5"
          disabled={busy}
          onClick={again}
          title="Read this project’s tracker again, ignoring what was last read"
          aria-label="Read this project’s tracker again"
        >
          <RefreshCw className={busy ? 'animate-spin' : undefined} />
        </Button>
      </header>
      <Toolbar
        sifting={sifting}
        onQuery={setQuery}
        onClear={() => void clearAll()}
        ordering={ordering}
        onOrder={setOrdering}
        showing={shown.length}
        total={rows.length}
      />
      {/*
        A read that failed over rows that could still be shown.

        This is the state the whole caching design exists to be able to draw, and
        the sentence is what stops it being the quiet lie: the list below is
        real, it is what was read at the time in the header, and the fresh read
        did not happen for the reason given. Without this the container would show a
        perfectly ordinary list that happened to be hours old, which is exactly
        how a stale list gets believed.

        It is drawn between the toolbar and the list rather than over them,
        because it is a fact about the rows underneath it and belongs against
        them.
      */}
      {sight.trouble && (
        <p className="border-b border-border bg-destructive/10 px-3 py-1.5 text-xs text-muted-foreground">
          {sight.trouble.why} What is below is the last reading of this project, not a current one.
        </p>
      )}
      {/* A refused `selection.set` gets a sentence, because the symptom without
          one is a checkbox that will not tick and a page that looks broken. It
          is drawn between the toolbar and the list rather than over them: this
          is a fact about what just happened to a click, and it belongs where the
          click was, not in a corner. It disappears the moment the next set is
          asked for — see `selectionRefused` in `use-roadmap.ts`. */}
      {/* A refused `filters.set` gets a sentence for the same reason a refused
          `selection.set` does, and a sharper one: the symptom without it is a
          `Clear` that empties the query box and leaves the list exactly as short
          as it was, which reads as a broken button. The host's own words are
          used because they are the only ones that say what to do — "pinned" and
          "not on the kehikko that is open" send a person to two different
          places, and neither is something this page could work out. It goes
          between the toolbar and the list, where the press was. */}
      {filterRefused && (
        <p className="border-b border-border bg-destructive/10 px-3 py-1.5 text-xs text-muted-foreground">
          The roadmap would not put this container’s filters back ({filterRefused}) The typed filter has been
          cleared; whatever the header is narrowing by is still narrowing this list.
        </p>
      )}
      {selectionRefused && (
        <p className="border-b border-border bg-destructive/10 px-3 py-1.5 text-xs text-muted-foreground">
          The roadmap would not record that selection ({selectionRefused.reason}). Nothing on this list has
          changed, and the rows are still exactly what the last reading found.
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <NothingFound project={sight.project} generated={generated} />
        ) : shown.length === 0 && narrowing(sifting) ? (
          <NothingMatches total={rows.length} clear={() => void clearAll()} />
        ) : (
          <ReferenceList rows={shown} landedOn={landedOn} selection={selection} onPick={pick} onToggle={toggle} />
        )}
      </div>
    </div>
  )
}
