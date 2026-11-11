import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { EPIC_SLUG, moduleFile } from 'kehikot-module-protocol'
import { mintTicket, placeTeller, refuseTicket, resolveDoorProject, type PlaceTeller, type Reply } from 'kehikot-module-protocol/serve'
import { z } from 'zod'

import { newsFor, placeKey, placeOf, toldRead, toldWritten, type TellFacts } from './src/live/tell.ts'

/**
 * Telling the agents at an epic about new activity on its items (3.28.0): `POST /api/tell`.
 *
 * The page sees the rows and knows the epic and the kehikko; `messages.tell` is a SERVER's method
 * (protocol 2.75.0, under `agents:message`), so the page hands the epic's rows here. This door keeps
 * what was told at each place in `<project>/.kehikot/references/told.json` — beside the project, as
 * every module keeps its own — works out what is news with `newsFor` (the bell's own detector, see
 * `src/live/tell.ts`), writes the record, then tells through the protocol's `placeTeller`: at most
 * one message to a place a minute, the rest merged into one digest.
 *
 * Several containers on one kehikko post the same rows: the record is read and written one post at
 * a time per project, so the second finds it told. A host before 2.75.0 answers `host-too-old`; the
 * record is kept all the same (so nothing old is told once the app is updated) and nothing is said.
 *
 * A write, so the page's ticket is checked (`TICKET`, printed into the page). The project is the
 * host's (`resolveDoorProject`), never a folder taken on the page's word.
 */

/** This process's write ticket, printed into the page by the doors. */
export const TICKET = mintTicket()

/** The door. */
export const TELL_PATH = '/api/tell'

/** Most rows a post carries: an epic's items, generously. */
const ROWS_MOST = 2000

const reviewer = z.object({ login: z.string().max(200), openThreads: z.number().int().nonnegative().optional() }).passthrough()

const row = z
  .object({
    ref: z.string().min(1).max(200),
    at: z.string().max(100),
    kind: z.enum(['issue', 'change']).optional(),
    state: z.enum(['open', 'closed', 'merged']).nullable().optional(),
    createdAt: z.string().max(100).optional(),
    lastActivity: z
      .object({
        kind: z.enum(['comment', 'review', 'commit', 'state']),
        login: z.string().max(200),
        at: z.string().max(100),
        mine: z.boolean().optional(),
        name: z.string().max(200).optional(),
        commits: z.number().int().nonnegative().optional(),
        path: z.string().max(1000).optional(),
        line: z.number().int().nonnegative().optional(),
        verdict: z.enum(['approved', 'changes', 'commented']).optional(),
      })
      .optional(),
    pipeline: z.object({ state: z.string().max(40), at: z.string().max(100).optional() }).passthrough().optional(),
    reviewers: z.array(reviewer).max(100).optional(),
    discussions: z.object({ unresolved: z.number().int().nonnegative().optional() }).passthrough().optional(),
  })
  .passthrough()

export const tellSchema = z.object({
  project: z.string().min(1).max(4096),
  epic: z.string().regex(EPIC_SLUG),
  kehikko: z.string().max(64).optional(),
  /** The header's "Tell agents about new activity": off records and tells nothing. */
  tell: z.boolean(),
  rows: z.array(row).max(ROWS_MOST),
})

export interface TellDoorOptions {
  module: string
  /** The project folder the host has for what the page named, or null. Default `resolveDoorProject`. */
  resolve?: (named: string) => Promise<string | null>
  /** The teller for a project. Default `placeTeller` over `askHost`. */
  tellerFor?: (project: string) => PlaceTeller
  now?: () => number
  /** Read and write the record: injected by the tests. Default the file. */
  read?: (file: string) => Promise<string | null>
  write?: (file: string, text: string) => Promise<void>
}

async function readText(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8')
  } catch {
    return null
  }
}

async function writeText(file: string, text: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  await writeFile(temp, text, 'utf8')
  await rename(temp, file)
}

/** `POST /api/tell` as a function of the request: the door, with what it touches injected. */
export function tellDoor(options: TellDoorOptions) {
  const { module, now = Date.now, read = readText, write = writeText } = options
  const resolve =
    options.resolve ??
    (async (named: string) => {
      const found = await resolveDoorProject(named)
      return found.ok ? found.path : null
    })
  const tellers = new Map<string, PlaceTeller>()
  const tellerFor = options.tellerFor ?? ((project: string) => placeTeller({ module, project }))
  /* One post at a time per project: the record is read, judged and written before the next reads it. */
  const queues = new Map<string, Promise<unknown>>()

  async function told(project: string, input: z.infer<typeof tellSchema>): Promise<number> {
    const file = moduleFile(project, module, 'told')
    if (!file) return 0
    const text = await read(file)
    let raw: unknown = null
    try {
      raw = text ? JSON.parse(text) : null
    } catch {
      raw = null
    }
    const book = toldRead(raw)
    const place = placeOf(input.epic, input.kehikko)
    const key = placeKey(place)
    const { news, book: next } = newsFor(book, key, input.rows as TellFacts[], now(), input.tell)
    if (next !== book) await write(file, toldWritten(next))
    if (!news.length) return 0
    let teller = tellers.get(project)
    if (!teller) tellers.set(project, (teller = tellerFor(project)))
    for (const one of news) await teller.tell(place, one.body, { kind: 'report' })
    return news.length
  }

  return async function answer(method: string, body: Record<string, unknown> | null, ticket: string | null): Promise<Reply> {
    if (method !== 'POST') return { status: 405, body: { ok: false, error: 'this door only answers POST' } }
    const refused = refuseTicket(ticket, TICKET)
    if (refused) return refused
    const parsed = tellSchema.safeParse(body)
    if (!parsed.success) return { status: 400, body: { ok: false, error: 'That is not a list of an epic’s items this door reads.' } }
    const project = await resolve(parsed.data.project)
    if (!project) return { status: 404, body: { ok: false, error: 'The host holds no project at that folder.' } }
    const before = queues.get(project) ?? Promise.resolve()
    const mine = before.then(() => told(project, parsed.data))
    queues.set(project, mine.catch(() => {}))
    try {
      return { status: 200, body: { ok: true, told: await mine } }
    } catch (error) {
      return { status: 500, body: { ok: false, error: error instanceof Error ? error.message : String(error) } }
    }
  }
}
