import { describe, expect, test } from 'bun:test'

import { closing, quietKey, shownTroubles, stillFailing, troubleSaid } from '@/live/trouble.ts'

const source = (error: string | null, over: Record<string, unknown> = {}) =>
  ({ tracker: 'gitlab', host: 'gitlab.innovium.ai', repo: 'a/b', default: true, listed: true, at: null, error, refreshing: false, ...over }) as never

describe('the words for a failed read', () => {
  test('interrupted and timeouts say to try again, and keep the raw text', () => {
    for (const raw of ['The command execution has been interrupted', 'context deadline exceeded', 'timed out after 30s']) {
      const words = troubleSaid(source(raw))
      expect(words.said).toBe('Reading timed out or was interrupted; try again.')
      expect(words.details).toBe(raw)
    }
  })
  test('not signed in says which tool and the command, for each tracker', () => {
    expect(troubleSaid(source('401 Unauthorized')).said).toBe("glab isn't signed in for gitlab.innovium.ai; run `glab auth login --hostname gitlab.innovium.ai`.")
    expect(troubleSaid(source('You are not logged in to any GitLab hosts.')).said).toContain('glab auth login')
    expect(troubleSaid(source('HTTP 401: Bad credentials', { tracker: 'github', host: 'github.com' })).said).toBe(
      "gh isn't signed in for github.com; run `gh auth login --hostname github.com`.",
    )
  })
  test('the network says which host could not be reached', () => {
    expect(troubleSaid(source('dial tcp: lookup gitlab.innovium.ai: no such host')).said).toBe("Couldn't reach gitlab.innovium.ai. Check the connection, then try again.")
    expect(troubleSaid(source('connection timed out: ECONNREFUSED')).said).toContain("Couldn't reach")
  })
  test('what is not known is passed through as the host said it', () => {
    const words = troubleSaid(source('something odd happened'))
    expect(words).toEqual({ said: 'something odd happened', details: 'something odd happened', known: false })
  })
})

describe('closed notices', () => {
  const a = source('boom')
  test('a closed failure is not shown, a different one is', () => {
    const quiet = closing(undefined, [a])
    expect(shownTroubles([a], quiet)).toEqual([])
    expect(shownTroubles([source('bang')], quiet)).toHaveLength(1)
  })
  test('a source that reads cleanly forgets the close, so the same failure shows again', () => {
    const quiet = closing(undefined, [a])
    expect(stillFailing(quiet, [a])).toEqual([quietKey(a)])
    const after = stillFailing(quiet, [source(null)])
    expect(after).toEqual([])
    expect(shownTroubles([a], after)).toHaveLength(1)
  })
})
