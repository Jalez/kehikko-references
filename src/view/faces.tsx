import { useState, type ReactNode } from 'react'
import { CircleAlert, CircleCheck, Eye, Hourglass } from 'lucide-react'

import { cn } from '@/lib/utils'
import { facesShown, imageLoadable, initialsOf, type Face, type ReviewerFace } from '@/live/faces.ts'

/**
 * Tiny round avatars, 16 pixels, overlapping, `+N` past three — what the
 * assignee and reviewer markers draw (protocol 2.10.0). Which pictures may be
 * loaded is `live/faces.ts`'s; this file draws what it is handed.
 *
 * A face with no picture, one the page's image policy does not name, or one
 * that fails to load is the person's initials on a plain disc: the marker
 * keeps its shape and still says who.
 *
 * A reviewer's face carries a badge at its lower right: the same shapes the
 * review marker has always used — an hourglass for asked, an eye for
 * reviewing, a ring with a bang for changes requested, a ring with a tick for
 * approved — so their state is never told by colour alone. The first face is
 * drawn on top, so each badge sits over the next face rather than under it.
 */

const STATE_BADGE: Record<ReviewerFace['state'], { icon: ReactNode; tone?: string }> = {
  requested: { icon: <Hourglass className="size-2" aria-hidden="true" strokeWidth={3} /> },
  commented: { icon: <Eye className="size-2" aria-hidden="true" strokeWidth={3} /> },
  changes: { icon: <CircleAlert className="size-2" aria-hidden="true" strokeWidth={3} />, tone: 'text-amber-700 dark:text-amber-400' },
  approved: { icon: <CircleCheck className="size-2" aria-hidden="true" strokeWidth={3} />, tone: 'text-emerald-700 dark:text-emerald-400' },
}

/** One face: the picture when it may be loaded and has not failed, else initials. */
function Avatar({ face, badge, z }: { face: Face; badge?: ReviewerFace['state']; z: number }) {
  const [failed, setFailed] = useState(false)
  const src = face.avatarUrl && !failed && imageLoadable(face.avatarUrl) ? face.avatarUrl : null
  return (
    <span
      data-face={face.login ?? face.name}
      data-state={badge}
      className="relative -ml-1 inline-flex size-4 shrink-0 first:ml-0"
      style={{ zIndex: z }}
    >
      <span className="inline-flex size-4 items-center justify-center overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--muted-foreground)_22%,var(--background))] ring-1 ring-background">
        {src ? (
          <img
            src={src}
            alt={face.name}
            width={16}
            height={16}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            draggable={false}
            onError={() => setFailed(true)}
            className="size-4 object-cover"
          />
        ) : (
          <span data-initials role="img" aria-label={face.name} className="text-[7px] leading-none font-semibold text-foreground">
            {initialsOf(face.name)}
          </span>
        )}
      </span>
      {badge && (
        <span
          data-badge={badge}
          className={cn(
            'absolute -right-0.5 -bottom-0.5 inline-flex size-2.5 items-center justify-center rounded-full bg-background text-muted-foreground',
            STATE_BADGE[badge].tone,
          )}
        >
          {STATE_BADGE[badge].icon}
        </span>
      )}
    </span>
  )
}

/** Up to three faces overlapping, and `+N` for the rest. */
export function Faces({ faces }: { faces: readonly (Face | ReviewerFace)[] }) {
  const { shown, more } = facesShown(faces)
  return (
    <span data-faces className="inline-flex items-center">
      {shown.map((face, i) => (
        <Avatar key={`${face.login ?? face.name}:${i}`} face={face} badge={'state' in face ? face.state : undefined} z={shown.length - i + 1} />
      ))}
      {more > 0 && (
        <span
          data-more={more}
          aria-hidden="true"
          className="relative -ml-1 inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--muted-foreground)_22%,var(--background))] px-0.5 text-[8px] leading-none font-semibold text-foreground tabular-nums ring-1 ring-background"
        >
          +{more}
        </span>
      )}
    </span>
  )
}
