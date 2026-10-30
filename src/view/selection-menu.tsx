import { Check, ChevronDown, Copy, ExternalLink, Layers, ListChecks, X } from 'lucide-react'
import { useState } from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { linkSaid, NOT_IN_ANY_EPIC, type EpicsState } from '@/live/epics.ts'
import { openOutside } from '@/live/links.ts'
import type { CopyKind } from './copy-many.tsx'

/**
 * The one menu for what is selected, in the module's bar, shown while one or
 * more rows are selected: "3 selected", and under it open them in the person's
 * own browser (confirmed first past `OPEN_MANY`), copy them linked with their
 * titles or as ids, and clear the selection (`selection.set` with an empty list,
 * which the protocol makes a real call).
 *
 * Under the actions, "In epics": every epic of the project the selected
 * references belong to (`epicsFor` in `live/epics.ts`), each a row that goes
 * there on the person's press (`view.goto { epic }`), the one open now marked.
 * Read when the menu opens (`onOpen`), never before.
 *
 * Drawn in the page, never as a header item: a clipboard write and a new window
 * both need the person's own press in this frame. A Radix menu, so the trigger
 * opens it with Enter, Space or the down arrow, arrows move, Escape closes and
 * focus goes back to the trigger.
 */

/** More pages than this are asked about before they are opened. */
export const OPEN_MANY = 5

/** The sentence a person is asked before many windows open. */
export function openAsk(count: number): string {
  return `Open ${count} pages in your browser?`
}

export function SelectionMenu({
  count,
  urls,
  copied,
  onCopy,
  onClear,
  epics = null,
  onOpen,
  onGo,
}: {
  count: number
  /** The addresses of the selected rows, in the order the list shows them. */
  urls: readonly (string | null | undefined)[]
  /** How many were copied a moment ago, or null. */
  copied: number | null
  onCopy: (kind: CopyKind) => void
  onClear: () => void
  /** The "In epics" section, or null where no host answers (nothing is drawn). */
  epics?: EpicsState | null
  /** The menu opened: the moment to read the epics. */
  onOpen?: () => void
  /** An epic was picked: go there. */
  onGo?: (slug: string) => void
}) {
  const [asking, setAsking] = useState(false)
  const openable = urls.filter((url): url is string => Boolean(url))
  const open = () => {
    for (const url of openable) openOutside(url)
  }
  const done = copied !== null
  const button =
    'flex h-5 items-center rounded-sm px-1.5 text-[11px] leading-none outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring'

  if (asking) {
    return (
      <span data-selection-ask className="ml-2 flex shrink-0 flex-wrap items-center gap-1 text-[11px] leading-none">
        <span role="alert">{openAsk(openable.length)}</span>
        <button
          type="button"
          autoFocus
          onClick={() => {
            setAsking(false)
            open()
          }}
          className={`${button} border border-border bg-background`}
        >
          Open
        </button>
        <button type="button" onClick={() => setAsking(false)} className={`${button} text-muted-foreground`}>
          Cancel
        </button>
      </span>
    )
  }

  return (
    <span data-selection-menu className="ml-2 flex shrink-0 items-center">
      <DropdownMenu onOpenChange={(opened) => opened && onOpen?.()}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`${count} selected: actions for the selected references`}
            className="flex h-5 items-center gap-1 rounded-sm border border-border bg-background px-1.5 text-[11px] leading-none text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:text-foreground"
          >
            {done ? <Check className="size-3" aria-hidden="true" /> : <ListChecks className="size-3" aria-hidden="true" />}
            <span aria-live="polite">{done ? `Copied ${copied}` : `${count} selected`}</span>
            <ChevronDown className="size-3" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="max-w-72">
          <DropdownMenuItem
            data-item="open"
            disabled={openable.length === 0}
            onSelect={() => (openable.length > OPEN_MANY ? setAsking(true) : open())}
          >
            <ExternalLink aria-hidden="true" />
            Open in your browser
          </DropdownMenuItem>
          <DropdownMenuItem data-item="copy" onSelect={() => onCopy('linked')}>
            <Copy aria-hidden="true" />
            Copy with links and titles
          </DropdownMenuItem>
          <DropdownMenuItem data-item="ids" onSelect={() => onCopy('ids')}>
            <Copy aria-hidden="true" />
            Copy ids
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem data-item="clear" onSelect={onClear}>
            <X aria-hidden="true" />
            Clear selection
          </DropdownMenuItem>
          {epics && (
            <>
              <DropdownMenuSeparator />
              <div data-epics={epics.state} className="px-2 py-1 text-[11px] leading-snug">
                <div className="mb-0.5 flex items-center gap-1 font-medium text-muted-foreground">
                  <Layers className="size-3" aria-hidden="true" />
                  In epics
                </div>
                {epics.state === 'reading' && <div className="text-muted-foreground">Reading the epics…</div>}
                {epics.state === 'failed' && <div className="text-muted-foreground">{epics.why}</div>}
                {epics.state === 'read' && epics.links.length === 0 && (
                  <div className="text-muted-foreground">{NOT_IN_ANY_EPIC}</div>
                )}
              </div>
              {epics.state === 'read' &&
                epics.links.map((link) => (
                  <DropdownMenuItem key={link.slug} data-epic={link.slug} onSelect={() => onGo?.(link.slug)}>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{link.title}</span>
                      {linkSaid(link) && <span className="truncate text-[10px] text-muted-foreground">{linkSaid(link)}</span>}
                    </span>
                    {link.open && (
                      <span data-open-now className="ml-auto shrink-0 pl-2 text-[10px] text-muted-foreground">
                        open now
                      </span>
                    )}
                  </DropdownMenuItem>
                ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  )
}
