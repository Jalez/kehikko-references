import { useEffect, useRef } from 'react'
import { ask } from 'kehikot-module-protocol/client'

import type { Reference } from '@/live/reference.ts'
import { factsOf, type TellFacts } from '@/live/tell.ts'

/** What the page hands its server's `POST /api/tell`: the open epic's rows, where it stands, and the toggle. */
export interface TellPost {
  project: string
  epic: string
  kehikko?: string
  tell: boolean
  rows: TellFacts[]
}

const postToServer = async (body: TellPost): Promise<void> => {
  await ask('/api/tell', { body })
}

/**
 * Hand the open epic's items to this module's own server whenever the reading of them changes, so
 * it can tell the agents at the epic about new activity (`tell.ts` at the root, 3.28.0). The server
 * keeps what was told and decides what is news; this only says what the rows are. Off ("Tell agents
 * about new activity" unchecked) still posts, with `tell: false`, so the server records what
 * happened meanwhile and turning it on again tells nothing old. A failed post is not the page's
 * business: nothing on screen depends on it, and the next reading posts again.
 */
export function useTellAgents(input: {
  hosted: boolean
  project: string | null
  epic: string | null
  epicRefs: readonly string[] | null
  kehikko: string
  rows: readonly Reference[]
  read: boolean
  on: boolean
  post?: (body: TellPost) => Promise<void>
}): void {
  const { hosted, project, epic, epicRefs, kehikko, rows, read, on, post = postToServer } = input
  const last = useRef('')
  useEffect(() => {
    if (!hosted || !project || !epic || !epicRefs || !read) return
    const named = new Set(epicRefs)
    const facts = rows.filter((row) => named.has(row.ref)).map(factsOf)
    if (!facts.length) return
    const body: TellPost = { project, epic, ...(kehikko ? { kehikko } : {}), tell: on, rows: facts }
    const said = JSON.stringify(body)
    if (said === last.current) return
    last.current = said
    void post(body).catch(() => {})
  }, [hosted, project, epic, epicRefs, kehikko, rows, read, on, post])
}
