import { Badge } from '@/components/ui/badge'
import type { Reference } from '@/live/reference.ts'

/**
 * What a row says about where its work stands, in one word.
 *
 * ## Five words, and why the fifth exists
 *
 * `open`, `draft`, `merged`, `closed` — and `unseen`, for a reference whose
 * reading contained no state this app recognises. That fifth word is the point
 * of the component. The alternative is drawing nothing, and a blank in the
 * state column of a dense list reads as "open" to anybody scanning, because
 * four hundred rows train the eye to fill gaps. A word that says the state
 * could not be read cannot be misread as a state.
 *
 * `draft` is a state rather than a decoration on `open`, because it is the
 * distinction somebody scanning a list of changes actually wants: a draft is
 * work in hand and an open change is work waiting on a person. It is only ever
 * shown where the tracker itself said `draft`, never inferred from a title
 * beginning "WIP".
 *
 * ## The word is the signal, not the colour
 *
 * Each variant carries a colour, and none of them carries meaning ALONE. A
 * greyscale printout, a badly calibrated projector, a monochrome e-ink reader
 * and a deuteranope all land in the same place, and in every one of them the
 * word still says which of the five it is. The colour is there to make the
 * shape of the list legible at a glance from a metre away; the word is there so
 * that glance can be checked.
 */
export function StateWord({ row }: { row: Reference }) {
  if (row.state === null) {
    return (
      <Badge
        variant="outline"
        className="border-dashed text-muted-foreground"
        title="The reading for this reference carried no state this app could recognise. This is the absence of a reading, not a state."
      >
        unseen
      </Badge>
    )
  }
  if (row.state === 'merged') return <Badge className="bg-violet-600 text-white">merged</Badge>
  if (row.state === 'closed') return <Badge variant="secondary">closed</Badge>
  if (row.draft) {
    return (
      <Badge variant="outline" title="The tracker says this change is still being written.">
        draft
      </Badge>
    )
  }
  return <Badge className="bg-emerald-600 text-white">open</Badge>
}
