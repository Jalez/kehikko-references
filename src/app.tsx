import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ID } from '../manifest.ts'
import { collect, generatedAt } from '@/live/collect.ts'
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

  const { sight, epics, look, resize } = useRoadmap(ID, onGoto)

  /* One place turns a reading into rows, and it is an effect rather than a memo
     because `sight` changing to a different epic has to REPLACE the rows
     rather than leave the previous epic's on screen while the next arrives. */
  useEffect(() => {
    setRows(sight.at === 'read' ? collect(sight.live) : [])
    setLandedOn(null)
  }, [sight])

  const shown = useMemo(() => sift(rows, sifting), [rows, sifting])

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
    <div ref={frame} className="flex h-full flex-col">
      <header className="flex items-baseline gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
        <span className="font-mono text-foreground">{sight.epic}</span>
        {/* Said once, here, rather than on every row: freshness is a fact about
            the reading and not about any one reference in it. */}
        <span>{generated ? `read ${generated}` : 'the roadmap did not say when this was read'}</span>
      </header>
      <Toolbar sifting={sifting} onChange={setSifting} showing={shown.length} total={rows.length} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {shown.length === 0 && narrowing(sifting) ? (
          <NothingMatches total={rows.length} clear={() => setSifting(EVERYTHING)} />
        ) : (
          <ReferenceList rows={shown} landedOn={landedOn} />
        )}
      </div>
    </div>
  )
}
