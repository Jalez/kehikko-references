import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from '@/lib/utils'

/**
 * shadcn's popover, with the entrance animation taken out.
 *
 * The generated component leans on `tw-animate-css` for `animate-in` and the
 * zoom/slide keyframes, and this project does not import it — those class names
 * would be spelled in the markup and mean nothing, which is worse than not
 * spelling them, because the next person to read this file would believe there
 * is an animation to debug. The layer opens instantly instead.
 */
function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverTrigger, PopoverContent }
