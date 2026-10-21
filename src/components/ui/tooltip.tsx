import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'

import { cn } from '@/lib/utils'

/**
 * shadcn's tooltip, with the entrance animation taken out for the reason
 * `popover.tsx` gives: this project does not import `tw-animate-css`, so its
 * class names would mean nothing.
 *
 * Each `Tooltip` carries its own provider, as shadcn's current component does,
 * so a row's markers work wherever the row is drawn — in the list, in a test —
 * without a provider somebody has to remember above them. It opens on hover and
 * on keyboard focus of its trigger, and its text is the trigger's description
 * while open; the trigger keeps its own `aria-label` for when it is not.
 */
function Tooltip({ delayDuration = 200, ...props }: React.ComponentProps<typeof TooltipPrimitive.Root> & { delayDuration?: number }) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipPrimitive.Provider>
  )
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({ className, sideOffset = 4, children, ...props }: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'z-50 max-w-72 rounded-md bg-foreground px-2.5 py-1.5 text-xs whitespace-pre-line text-background shadow-md',
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent }
