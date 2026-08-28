import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ID } from '../manifest.ts'
import { collect, generatedAt } from '@/live/collect.ts'
import { reading, writing } from '@/live/keep.ts'
import { DEFAULT_ORDER, order, type Ordering } from '@/live/order.ts'
import { EVERYTHING, narrowing, sift, type Sifting } from '@/live/sift.ts'
import { useRoadmap, type GotoHandler } from '@/wire/use-roadmap.ts'
import { Asking, Listening, NoEpic, NothingFound, NothingMatches, Refused, Unhosted, Unread } from '@/view/absence.tsx'
import { ReferenceList } from '@/view/reference-list.tsx'
import { Toolbar } from '@/view/toolbar.tsx'

/**
 * The composition, and only the composition.
 *
 * Every hard thing this app does is somewhere else: the wire in `wire/`, the
 * reading of a reading in `live/collect.ts`, the narrowing in `live/sift.ts`,
 * the words for each absence in `view/absence.tsx`. What is left here is the
 * one job nothing else can do — deciding which of them the reader is looking
 * at — and that decision is a single `switch` over `Sight`, which is the shape
 * it should be. If this file ever grows a second concern, the concern is in the
 * wrong file.
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

export function App() {
  const [sifting, setSifting] = useState<Sifting>(EVERYTHING)
  const [ordering, setOrdering] = useState<Ordering>(DEFAULT_ORDER)
  const [landedOn, setLandedOn] = useState<string | null>(null)
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
   * Answering a host that says "go to this reference".
   *
   * Three things happen here that are easy to get wrong and all three matter:
   *
   * 1. **The filter is cleared when it is hiding the target.** Answering
   *    `found: true` while the row is filtered out walks the reader to a page
   *    where their reference is invisible, which is worse than the fallback
   *    link they would have got for `found: false`.
   * 2. **`found` is answered from the whole reading, not from what is drawn.**
   *    What is drawn is a function of a filter the host knows nothing about.
   * 3. **A `goto` naming another epic is refused rather than obeyed.** The
   *    host re-points a module by sending context; a module that switched
   *    epics on its own would be showing an epic nobody asked it for and
   *    telling the host it succeeded.
   */
  const onGoto = useCallback<GotoHandler>(
    (message, answer) => {
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
      setSifting(EVERYTHING)
      setLandedOn(row.ref)
      /* After paint, because the row may have been hidden by the filter a
         moment ago and cannot be scrolled to before it exists. */
      requestAnimationFrame(() => {
        frame.current?.querySelector(`[data-ref="${CSS.escape(row.ref)}"]`)?.scrollIntoView({ block: 'center' })
        answer(true, '')
      })
    },
    [rows],
  )

  const { sight, epics, look, resize, selection, select, selectionRefused, kept, keep } = useRoadmap(ID, onGoto)

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
    const remembered = reading(kept) ?? { sifting: EVERYTHING, ordering: DEFAULT_ORDER }
    setSifting(remembered.sifting)
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
   */
  useEffect(() => {
    if (restored.current === undefined) return
    const timer = setTimeout(() => {
      const now = writing({ sifting, ordering })
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
  }, [sifting, ordering, keep])

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
   * clicked here. Two panes disagreeing about that is exactly the failure the
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
     because `sight` changing to a different epic has to REPLACE the rows
     rather than leave the previous epic's on screen while the next arrives. */
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

  /* What we would like to be, recomputed when the length of the list changes.
     Fire and forget: the host may ignore it, and this page is laid out to be
     correct at whatever height it actually gets. */
  useEffect(() => {
    resize(Math.min(96 + shown.length * ROW_HEIGHT, TALLEST))
  }, [shown.length, resize])

  if (sight.at === 'listening') return <Listening />
  if (sight.at === 'unhosted') return <Unhosted />
  if (sight.at === 'no-epic') return <NoEpic epics={epics} look={look} />
  if (sight.at === 'asking') return <Asking epic={sight.epic} />
  if (sight.at === 'refused') {
    return <Refused epic={sight.epic} refusal={sight.refusal} again={() => look(sight.epic)} />
  }
  if (sight.at === 'unread') return <Unread epic={sight.epic} />

  const generated = generatedAt(sight.live)
  if (rows.length === 0) return <NothingFound epic={sight.epic} generated={generated} />

  return (
    /* `@container` is the one thing this element does beyond stacking three
       boxes, and it is what every size decision below it is measured against. A
       module's width is its pane's width, and a reader changes that by dragging
       a corner on somebody else's canvas: the window is never resized, no
       viewport breakpoint fires, and a layout keyed to `md:` would sit at its
       widest inside a column two hundred pixels across. So the header and the
       toolbar ask this element how wide they are; a row asks itself, because a
       row's own width is what its columns have to divide. */
    <div ref={frame} className="@container flex h-full flex-col">
      {/* It wraps, because the two things here are an epic's name and a
          timestamp and neither of them shortens. In a narrow pane they take a
          line each. The alternative was truncating an identifier, which is the
          one kind of text on this page that has to be readable in full. */}
      <header className="flex flex-wrap items-baseline gap-x-2 border-b border-border px-3 py-1.5 text-xs break-words text-muted-foreground @md:py-2">
        <span className="font-mono text-foreground">{sight.epic}</span>
        {/* Said once, here, rather than on every row: freshness is a fact about
            the reading and not about any one reference in it. */}
        <span>{generated ? `read ${generated}` : 'the roadmap did not say when this was read'}</span>
      </header>
      <Toolbar
        sifting={sifting}
        onChange={setSifting}
        ordering={ordering}
        onOrder={setOrdering}
        showing={shown.length}
        total={rows.length}
      />
      {/* A refused `selection.set` gets a sentence, because the symptom without
          one is a checkbox that will not tick and a page that looks broken. It
          is drawn between the toolbar and the list rather than over them: this
          is a fact about what just happened to a click, and it belongs where the
          click was, not in a corner. It disappears the moment the next set is
          asked for — see `selectionRefused` in `use-roadmap.ts`. */}
      {selectionRefused && (
        <p className="border-b border-border bg-destructive/10 px-3 py-1.5 text-xs text-muted-foreground">
          The roadmap would not record that selection ({selectionRefused.reason}). Nothing on this list has
          changed, and the rows are still exactly what the last reading found.
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {shown.length === 0 && narrowing(sifting) ? (
          <NothingMatches total={rows.length} clear={() => setSifting(EVERYTHING)} />
        ) : (
          <ReferenceList rows={shown} landedOn={landedOn} selection={selection} onPick={pick} onToggle={toggle} />
        )}
      </div>
    </div>
  )
}
