import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ID } from '../manifest.ts'
import type { Fetcher } from '@/live/ask.ts'
import { collect, generatedAt } from '@/live/collect.ts'
import { reading, writing } from '@/live/keep.ts'
import { DEFAULT_ORDER, order, type Ordering } from '@/live/order.ts'
import { KEHIKKO, hides, narrowing, nothingPicked, offer, sift, siftingOf } from '@/live/sift.ts'
import { useRoadmap, type GotoHandler, type Settled } from '@/wire/use-roadmap.ts'
import {
  Asking,
  Listening,
  NoProject,
  NothingFound,
  NothingMatches,
  NothingPicked,
  Troubled,
  Unhosted,
} from '@/view/absence.tsx'
import { Heading } from '@/view/heading.tsx'
import { ReferenceList } from '@/view/reference-list.tsx'

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
 * scrolls the roadmap to read the module and loses the container's own header —
 * and its filter control — off the top on the way. Asking for a height the list
 * is worth reading in, and scrolling inside it, keeps the count and the column
 * headings on screen while somebody works through four hundred rows. The host clamps whatever we ask for regardless;
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
   * The order, which is the only setting this page still holds.
   *
   * The kind, the state and the typed query are all the host's now — offered as
   * `roadmap.filters`, drawn in the container's own header, and sent back in
   * `context.filters`. There is no local copy of any of them, for the same
   * reason there is no local copy of the selection: a second answer would go
   * stale on its own schedule, and a page that drew what it asked for rather
   * than what the host settled on would disagree with the header in exactly the
   * cases that matter.
   *
   * The order stays because it is not a filter. It hides nothing, so the host
   * neither draws it nor remembers it, and it lives on the column headings —
   * see `view/heading.tsx`.
   */
  const [ordering, setOrdering] = useState<Ordering>(DEFAULT_ORDER)
  const [landedOn, setLandedOn] = useState<string | null>(null)
  /**
   * Why the last `filters.set` did not take, if it did not.
   *
   * The host may decline — the container is pinned, or is not on the kehikko
   * that is open — and every way this page has of putting the narrowing back
   * goes through that one call now. Held so the page can say what did not
   * happen, in the host's own words, beside the list. Null the moment anything
   * is asked again.
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
    refreshable,
    setFilters,
    kept,
    keep,
  } = useRoadmap(ID, onGoto, fetcher)

  /**
   * The whole narrowing, which is entirely the host's now.
   *
   * Read on every render rather than stored, because storing it would be the
   * local copy `chosen` exists to avoid. Everything downstream — `sift`, the
   * count, `narrowing`, `goto` — takes this and cannot tell one group from
   * another, which is right: a reader looking at four rows of four hundred does
   * not care which of the four controls did it.
   *
   * The selection is the second input, and it is the one thing on this page
   * that arrives from another container: the fourth group narrows to what the
   * canvas has picked out, and `context.selection` is where that is read. This
   * is the "reacts" the manifest declares — the list narrows when the pick
   * changes — and it is only ever in force while the header's `Kehikko` group
   * is on, which is the person's to set. See `Sifting.picked` in `sift.ts`.
   */
  const sifting = useMemo(() => siftingOf(chosen, selection), [chosen, selection])

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
    /* And on every selection, because `Picked here 3` is a count of rows a
       pick reaches and changes with the pick. See the note on the fourth
       group in `offer`. */
    const groups = offer(rows, sight.at === 'read', selection)
    if (groups) offerFilters(groups)
  }, [rows, sight.at, selection, offerFilters])

  /**
   * What this page says about being read again, which is the whole of the
   * host's refresh control.
   *
   * Three facts, re-announced whenever any of them changes, and the middle one
   * is why this message exists at all.
   *
   * **`can`** — there is something to read. False when no project has been
   * named, because a read needs a folder to run `gh` in, and a refresh button
   * over a page that says "a roadmap is here and it named no project folder"
   * is a button that cannot work. It is also false while nothing has greeted us
   * yet, which is silent anyway.
   *
   * **`at`** — when this reading was taken, and NOT when the host last asked.
   * This app is the case that proves the difference is not academic: `from` on
   * the door's answer says whether a reading came off GitHub or out of the
   * cache beside the project, and a cached one can be ten minutes old at the
   * moment it arrives. A failed read over a cache is worse again — the rows
   * stay, the reading behind them keeps its own older date, and a host that
   * stamped the moment it asked would print a fresh time over a stale list. The
   * three sentences the old header drew — `read <when>`, `last read <when>`,
   * `this reading is not dated` — are exactly this field plus the host's
   * formatting.
   *
   * Validated before it goes, because the protocol wants an instant and this
   * one arrives from a subprocess's JSON. Anything unparseable is sent as
   * `null`, which is the honest "I cannot say" — better than a message the host
   * refuses whole, which would take the control away rather than the timestamp.
   *
   * **`busy`** — a read is in flight. The host disables its own button and
   * spins its own icon on this; two reads racing is two subprocesses and one
   * answer that wins for no reason anybody could predict, and this page is the
   * only side that knows.
   */
  useEffect(() => {
    const generated = sight.at === 'read' ? generatedAt(sight.live) : null
    const at = generated && !Number.isNaN(Date.parse(generated)) ? new Date(generated).toISOString() : null
    refreshable({ can: sight.at === 'read' || sight.at === 'trouble' || sight.at === 'asking', at, busy })
  }, [sight, busy, refreshable])

  /**
   * One press puts everything back — including the two thirds this page does not
   * hold.
   *
   * One call, because `filters.set` takes a whole choice and `{}` is exactly
   * "clear the narrowing" — every group back to its resting option, the typed
   * query included, since an empty string is how a text group says it is at
   * rest. Per-group clearing would produce a context per group and a page seen
   * part-way through its own reset.
   *
   * This is now the only way this page can undo anything it is showing, and
   * that is the shape of the whole change: nothing here holds a filter, so
   * nothing here can clear one on its own. It reaches all three where it used
   * to reach one, which is why the promise is stronger than it was rather than
   * weaker.
   *
   * The host may decline, and then this says so rather than pretending. That is
   * the honest half of a request: silently doing nothing would teach a reader
   * that the control does not work.
   */
  const clearAll = useCallback(async (): Promise<Settled> => {
    setFilterRefused(null)
    const settled = await setFilters({})
    if (!settled.ok) setFilterRefused(settled.why)
    return settled
  }, [setFilters])

  /**
   * Turn off the narrowing to picks, and nothing else.
   *
   * The one press `NothingPicked` offers, and it is deliberately not `clearAll`:
   * a person looking at open issues who turned on "picked here" and then
   * cleared the canvas selection wants their open issues back, not every row in
   * the project. So the whole choice is re-sent with only this group at rest —
   * `filters.set` takes a whole choice, and leaving a key out is how a group is
   * put back to its fallback. The same refusal handling as `clearAll`, for the
   * same reason.
   */
  const everythingInProject = useCallback(async (): Promise<Settled> => {
    setFilterRefused(null)
    const { [KEHIKKO]: _picked, ...rest } = chosen
    const settled = await setFilters(rest)
    if (!settled.ok) setFilterRefused(settled.why)
    return settled
  }, [chosen, setFilters])

  /**
   * Answering a host that says "go to this reference".
   *
   * Four things happen here that are easy to get wrong and all four matter:
   *
   * 1. **What is hiding the target is cleared.** Answering `found: true` while
   *    the row is filtered out walks the reader to a page where their reference
   *    is invisible, which is worse than the fallback link they would have got
   *    for `found: false`. All three groups are the host's now, so all of it is
   *    ASKED for — there is nothing left here to clear locally, which makes this
   *    simpler than it was rather than more fragile.
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

    setLandedOn(row.ref)

    /* Nothing is narrowed, so there is nothing to ask for and nothing to wait
       on. The common case, and it answers in the same breath it always did. */
    if (!narrowing(sifting)) {
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
      if (hides(siftingOf(settled.filters, selection), row)) {
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
    const remembered = reading(kept) ?? { ordering: DEFAULT_ORDER }
    setOrdering(remembered.ordering)
  }, [kept])

  /**
   * Write the order back, a moment after it stops changing.
   *
   * The delay used to be for the query, which changed on every keystroke; the
   * query is the host's now and an order changes on a press, so the four
   * hundred milliseconds are doing much less work than they were. They are kept
   * anyway, because the reason they were chosen has not gone: a person trying
   * two orders in a row should produce one write and not two, and nothing here
   * is waiting on the write.
   *
   * The cleanup cancels the pending write on every change, so a page torn down
   * mid-press writes nothing rather than something nobody settled on.
   */
  useEffect(() => {
    if (restored.current === undefined) return
    const timer = setTimeout(() => {
      const now = writing({ ordering })
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
  }, [ordering, keep])

  /**
   * The plain click: this row becomes the whole selection.
   *
   * And clicking the one selected row again clears the selection, which is the
   * only reason there is no "clear selection" button anywhere on this page. A
   * canvas has to be able to get back to nothing selected — the protocol says so
   * explicitly, an empty `refs` is a real call rather than an absence — and the
   * gesture people already reach for is pressing the thing again. A dedicated
   * button would be a control that is useless in the state it is most often
   * seen in, in a strip of chrome this module no longer has at all.
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
       widest inside a column two hundred pixels across. So the heading asks
       this element how wide it is — and asks it through the same `@container`
       the row's own middle is, so the heading's columns and the row's cannot
       part company at any width. */
    <div ref={frame} className="@container flex h-full flex-col">
      {/*
        The table's heading, which is the only chrome left.

        Two rows stood here: a header with the project name, the freshness line
        and a Refresh button, and a toolbar with the query, the seven filter
        buttons, the order trigger, the count and Clear. At 220 pixels they came
        to about a hundred pixels over a list that had three hundred to divide.
        Every one of those things is somewhere better now — the filters and the
        query in the container's own header as `roadmap.filters`, the refresh
        and the freshness line as `roadmap.refreshable`, the order on the
        columns it orders — except the count, which could not go, because the
        host cannot count rows it does not render. `view/heading.tsx` has the
        whole argument.
      */}
      <Heading
        project={sight.project}
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

        It is drawn between the heading and the list rather than over them,
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
          is drawn between the heading and the list rather than over them: this
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
          above the list, against the rows it is about. */}
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
        ) : shown.length === 0 && nothingPicked(rows, sifting) ? (
          /* Before `NothingMatches`, because when the pick alone reaches no row
             the menus are not what to change — see `NothingPicked`. */
          <NothingPicked
            picked={sifting.picked?.length ?? 0}
            total={rows.length}
            everything={() => void everythingInProject()}
          />
        ) : shown.length === 0 && narrowing(sifting) ? (
          <NothingMatches total={rows.length} clear={() => void clearAll()} />
        ) : (
          <ReferenceList rows={shown} landedOn={landedOn} selection={selection} onPick={pick} onToggle={toggle} />
        )}
      </div>
    </div>
  )
}
