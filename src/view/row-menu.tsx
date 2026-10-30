import { BellDot, Copy, ExternalLink, MoreHorizontal } from 'lucide-react'
import { useId } from 'react'

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { copyPayload, payloadOf } from '@/live/copy.ts'
import { openOutside } from '@/live/links.ts'
import { unaddressed } from '@/live/markers.ts'
import type { Reference } from '@/live/reference.ts'

/**
 * One "⋯" per row, and what used to be loose icons at the row's end behind it:
 *
 * - **Open in your browser**: the tracker's page in the person's own browser
 *   (`openOutside`), never handed to a module on the canvas. Clicking the row is
 *   what shows it in the app.
 * - **Copy reference**: the row's copy (`payloadOf`). The copy button stays
 *   outside the menu from 24rem of the frame; below that only "⋯" is left, and
 *   this is how the copy is reached there.
 * - **The last activity**, when it was somebody else's (`unaddressed`): the bell
 *   only ever told; here it says the same sentence and opens the page in the
 *   person's browser, where that activity is. A small dot on "⋯" keeps the
 *   signal on the row, and the sentence is the trigger's description, so a
 *   screen reader hears it before opening the menu.
 *
 * A Radix menu: the trigger opens it with Enter, Space or the down arrow, the
 * arrows move, Escape closes it and focus goes back to "⋯".
 */
export function RowMenu({ row, now, onCopied }: { row: Reference; now: number; onCopied?: () => void }) {
  const described = useId()
  const last = unaddressed(row, now)
  const url = row.url
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-row-menu
          aria-label={`More for ${row.ref}`}
          aria-describedby={last ? described : undefined}
          className="relative flex shrink-0 items-center self-stretch px-2 text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:text-foreground"
        >
          <MoreHorizontal className="size-3.5" aria-hidden="true" />
          {last ? (
            <>
              <span data-activity-dot aria-hidden="true" className="absolute top-1.5 right-1 size-1.5 rounded-full bg-foreground" />
              <span id={described} className="sr-only">
                Unaddressed activity. {last}
              </span>
            </>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-72">
        <DropdownMenuItem data-item="open" disabled={!url} onSelect={() => void openOutside(url)}>
          <ExternalLink aria-hidden="true" />
          Open in your browser
        </DropdownMenuItem>
        <DropdownMenuItem
          data-item="copy"
          onSelect={() => {
            void copyPayload(payloadOf(row)).then((ok) => {
              if (ok) onCopied?.()
            })
          }}
        >
          <Copy aria-hidden="true" />
          Copy reference
        </DropdownMenuItem>
        {last ? (
          <DropdownMenuItem data-item="activity" disabled={!url} onSelect={() => void openOutside(url)} className="items-start">
            <BellDot aria-hidden="true" className="mt-0.5" />
            <span className="flex min-w-0 flex-col">
              <span>{last}</span>
              <span className="text-xs text-muted-foreground">See it in your browser</span>
            </span>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
