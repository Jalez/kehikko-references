import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { copyPayload, payloadOf, type Copyable } from '@/live/copy.ts'

/**
 * Copies the row's reference (linked), and its title. Beside the row's button,
 * not inside it, and stops the click anyway so nothing the row does can follow.
 * Shows a check for a moment once the clipboard took it.
 */
export function CopyButton({ row }: { row: Copyable }) {
  const [done, setDone] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-copy
          aria-label={`Copy ${row.ref} with its link and title`}
          onClick={(event) => {
            event.stopPropagation()
            void copyPayload(payloadOf(row)).then((ok) => {
              if (!ok) return
              setDone(true)
              if (timer.current) clearTimeout(timer.current)
              timer.current = setTimeout(() => setDone(false), 1500)
            })
          }}
          className="flex shrink-0 items-center self-stretch px-2 text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
      </TooltipTrigger>
      <TooltipContent>{done ? 'Copied' : 'Copy reference'}</TooltipContent>
    </Tooltip>
  )
}
