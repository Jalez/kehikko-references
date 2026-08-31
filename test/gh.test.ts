import { describe, expect, test } from 'bun:test'

import { collect } from '@/live/collect.ts'
import { LIMIT, argsFor, bagFrom, diagnose, readTracker, refOf } from '../tracker/gh.ts'
import type { Ran, Runner } from '../tracker/run.ts'

/**
 * Everything about reading a tracker, with no tracker anywhere near it.
 *
 * ## Why not one integration test against the real `gh`
 *
 * Because the interesting half of this module is what happens when the read
 * does NOT work, and there is no way to be offline, logged out, rate-limited and
 * in a folder that is not a repository at the same time. A test suite that
 * needed a network would exercise exactly one of the seven paths — the one that
 * matters least, because it is the one somebody notices immediately.
 *
 * So the runner is a parameter, every failure is a canned `Ran`, and the words
 * in each of them are REAL: they were captured from `gh` on this machine, by
 * running it in an empty directory, in a repository with no remote, and with
 * `GH_CONFIG_DIR` pointed somewhere empty. A phrase that changes in a future
 * `gh` breaks a test here rather than silently costing a reader their sentence.
 */

/** A run that failed, said what, and exited with what. */
const failed = (said: string, code: number | null = 1): Ran => ({ ok: false, code, out: '', said })

/** A run that worked and printed this. */
const printed = (out: string): Ran => ({ ok: true, code: 0, out, said: '' })

describe('what is actually run', () => {
  test('the repository is never named on the command line', () => {
    /* The whole safety argument in one assertion. `gh` reads the repository out
       of the git remote of the directory it runs in, so nothing a caller sends
       can become an argument — there is no `--repo` for a hostile string to be. */
    for (const kind of ['issues', 'prs'] as const) {
      expect(argsFor(kind)).not.toContain('--repo')
      expect(argsFor(kind).join(' ')).not.toContain('/')
    }
  })

  test('both lists ask for every state, or a merged change disappears', () => {
    expect(argsFor('issues')).toContain('--state')
    expect(argsFor('issues')[argsFor('issues').indexOf('--state') + 1]).toBe('all')
    expect(argsFor('prs')[argsFor('prs').indexOf('--state') + 1]).toBe('all')
  })

  test('it asks for JSON rather than the table, and bounds what it asks for', () => {
    expect(argsFor('issues')).toContain('--json')
    expect(argsFor('prs')).toContain('--json')
    expect(argsFor('issues')).toContain(String(LIMIT))
  })

  test('a pull request read asks for the fields an issue read has no use for', () => {
    const prFields = argsFor('prs')[argsFor('prs').indexOf('--json') + 1] ?? ''
    expect(prFields).toContain('isDraft')
    expect(prFields).toContain('mergedAt')
    expect(prFields).toContain('author')
    const issueFields = argsFor('issues')[argsFor('issues').indexOf('--json') + 1] ?? ''
    expect(issueFields).not.toContain('isDraft')
  })
})

describe('the failures are seven different sentences', () => {
  /* Captured from `gh` on this machine, verbatim. */
  const REAL = {
    notARepo: 'failed to run git: fatal: not a git repository (or any of the parent directories): .git',
    noRemote: 'no git remotes found',
    unauth:
      'To get started with GitHub CLI, please run:  gh auth login\nAlternatively, populate the GH_TOKEN environment variable with a GitHub API authentication token.',
    wrongHost:
      'none of the git remotes configured for this repository correspond to the GH_HOST environment variable. Try adding a matching remote or unsetting the variable',
  }

  test('a folder that is not a repository is not a failure, and says so', () => {
    const got = diagnose(failed(REAL.notARepo))
    expect(got.trouble).toBe('not-a-repo')
    expect(got.why).toContain('not a git repository')
    expect(got.why).toContain('That is not a failure')
  })

  test('a repository with no remote is told apart from one that is not a repository', () => {
    expect(diagnose(failed(REAL.noRemote)).trouble).toBe('no-remote')
    expect(diagnose(failed(REAL.wrongHost)).trouble).toBe('no-remote')
    expect(diagnose(failed(REAL.noRemote)).why).not.toBe(diagnose(failed(REAL.notARepo)).why)
  })

  test('being logged out is recognised by the exit code and by the words', () => {
    expect(diagnose(failed(REAL.unauth, 4)).trouble).toBe('unauthenticated')
    /* And by the words alone, so a `gh` that stops using exit code 4 does not
       silently demote this to the catch-all. */
    expect(diagnose(failed(REAL.unauth, 1)).trouble).toBe('unauthenticated')
    expect(diagnose(failed(REAL.unauth, 4)).why).toContain('gh auth login')
  })

  test('a rate limit says it is a limit rather than a refusal', () => {
    const got = diagnose(failed('API rate limit exceeded for user ID 1.'))
    expect(got.trouble).toBe('rate-limited')
    expect(got.why).toContain('resets on its own')
  })

  test('a secondary limit is the same trouble, because it is the same wait', () => {
    expect(diagnose(failed('You have exceeded a secondary rate limit')).trouble).toBe('rate-limited')
  })

  test('no network is its own sentence and never reads as a refusal', () => {
    for (const said of [
      'Get "https://api.github.com/graphql": dial tcp: lookup api.github.com: no such host',
      'Get "https://api.github.com": net/http: TLS handshake timeout',
      'dial tcp 140.82.121.6:443: connect: connection refused',
    ]) {
      expect(diagnose(failed(said)).trouble).toBe('offline')
    }
    expect(diagnose(failed('dial tcp: no such host')).why).toContain('network rather than the project')
  })

  test('a timeout is offline rather than a refusal, because it is the same fix', () => {
    expect(diagnose(failed('`gh` did not answer within 12 seconds.', null)).trouble).toBe('offline')
  })

  test('a missing binary is told apart from every other failure', () => {
    const got = diagnose(failed('spawn gh ENOENT', null))
    expect(got.trouble).toBe('no-gh')
    expect(got.why).toContain('not on this machine')
  })

  test('anything else is the catch-all, and shows the CLI’s own words', () => {
    const got = diagnose(failed('something nobody has ever seen before'))
    expect(got.trouble).toBe('refused')
    expect(got.said).toBe('something nobody has ever seen before')
  })

  test('every trouble has a distinct sentence, which is the whole point of the file', () => {
    const said = [
      diagnose(failed(REAL.notARepo)),
      diagnose(failed(REAL.noRemote)),
      diagnose(failed(REAL.unauth, 4)),
      diagnose(failed('API rate limit exceeded')),
      diagnose(failed('dial tcp: no such host')),
      diagnose(failed('spawn gh ENOENT', null)),
      diagnose(failed('what')),
    ].map((one) => one.why)
    expect(new Set(said).size).toBe(said.length)
  })

  test('the CLI’s own words are bounded before they are carried anywhere', () => {
    expect(diagnose(failed('x'.repeat(5000))).said.length).toBeLessThanOrEqual(600)
  })
})

describe('gh’s JSON becomes the shape the rest of this app already reads', () => {
  const ISSUES = JSON.stringify([
    {
      number: 140,
      state: 'OPEN',
      title: 'The claim endpoints guard the posting ledger',
      updatedAt: '2026-08-27T08:07:27Z',
      url: 'https://github.com/jaakkorajalasol/roadmap/issues/140',
      labels: [{ name: 'protocol' }],
      assignees: [{ login: 'Jalez', name: 'Jaakko Rajala' }],
    },
    {
      number: 131,
      state: 'CLOSED',
      title: 'Until Journeys can leave',
      updatedAt: '2026-08-28T05:57:16Z',
      closedAt: '2026-08-28T05:57:00Z',
      url: 'https://github.com/jaakkorajalasol/roadmap/issues/131',
      labels: [],
      assignees: [],
    },
  ])

  const PRS = JSON.stringify([
    {
      number: 146,
      state: 'MERGED',
      title: 'node_modules is not a file this repository ships',
      updatedAt: '2026-08-28T06:38:49Z',
      mergedAt: '2026-08-28T06:38:00Z',
      url: 'https://github.com/jaakkorajalasol/roadmap/pull/146',
      labels: [],
      author: { login: 'Jalez', name: 'Jaakko Rajala' },
      assignees: [],
      reviewRequests: [{ login: 'someone' }],
      isDraft: false,
    },
  ])

  test('a ref is spelled the way it has always been spelled', () => {
    /* Protocol-visible. This string goes out on `selection.set`, the host relays
       it to every framed module, and Diff looks a patch up by it. If this test
       ever needs changing, the change is not a change to this module. */
    expect(refOf(105)).toBe('gh#105')
  })

  test('issues arrive keyed by ref, with the three words for a state', () => {
    const bag = bagFrom(ISSUES, 'issues')
    expect(Object.keys(bag ?? {})).toEqual(['gh#140', 'gh#131'])
    expect(bag?.['gh#140']).toMatchObject({ state: 'opened', title: 'The claim endpoints guard the posting ledger' })
    expect(bag?.['gh#131']).toMatchObject({ state: 'closed' })
  })

  test('a closed thing is dated by when it closed rather than when it was touched', () => {
    const bag = bagFrom(ISSUES, 'issues')
    expect((bag?.['gh#131'] as { at: string }).at).toBe('2026-08-28T05:57:00Z')
    expect((bag?.['gh#140'] as { at: string }).at).toBe('2026-08-27T08:07:27Z')
  })

  test('a merged change is dated by the merge, which is what "just moved" means', () => {
    const bag = bagFrom(PRS, 'prs')
    expect(bag?.['gh#146']).toMatchObject({ state: 'merged', at: '2026-08-28T06:38:00Z' })
  })

  test('people are named rather than logged in, and an author leads a change', () => {
    expect(bagFrom(ISSUES, 'issues')?.['gh#140']).toMatchObject({ assignees: ['Jaakko Rajala'] })
    expect(bagFrom(PRS, 'prs')?.['gh#146']).toMatchObject({ author: 'Jaakko Rajala', reviewers: ['someone'] })
  })

  test('a login with no name is still a person rather than a blank', () => {
    const bag = bagFrom(JSON.stringify([{ number: 1, state: 'OPEN', assignees: [{ login: 'ada' }] }]), 'issues')
    expect(bag?.['gh#1']).toMatchObject({ assignees: ['ada'] })
  })

  test('a state nobody could read is never drawn as open', () => {
    /* The one fact somebody came to the page to check, so a guess here is the
       most expensive guess in the program. */
    const bag = bagFrom(JSON.stringify([{ number: 1, state: 'SOMETHING_NEW' }]), 'issues')
    expect(bag?.['gh#1']).toMatchObject({ state: '' })
  })

  test('a row with no usable number is the only thing dropped', () => {
    const bag = bagFrom(
      JSON.stringify([{ number: 1 }, { number: 'seven' }, { number: -3 }, {}, null, 4, { number: 2 }]),
      'issues',
    )
    expect(Object.keys(bag ?? {})).toEqual(['gh#1', 'gh#2'])
  })

  test('output that is not a list of things reads as no bag rather than an empty one', () => {
    expect(bagFrom('not json at all', 'issues')).toBeNull()
    expect(bagFrom('{"issues":[]}', 'issues')).toBeNull()
    expect(bagFrom('[]', 'issues')).toEqual({})
  })

  test('a draft is only ever a draft because the tracker said so', () => {
    const bag = bagFrom(JSON.stringify([{ number: 9, state: 'OPEN', isDraft: true }]), 'prs')
    expect(bag?.['gh#9']).toMatchObject({ draft: true })
    const not = bagFrom(JSON.stringify([{ number: 9, state: 'OPEN' }]), 'prs')
    expect(not?.['gh#9']).toMatchObject({ draft: false })
  })

  test('the reading collects into rows that know an issue from a change', () => {
    /* The end-to-end assertion that matters: what the door produces is what
       `collect.ts` has always read, so nothing downstream of it changed. */
    const rows = collect({ issues: {}, mrs: {}, ghIssues: bagFrom(ISSUES, 'issues'), ghPrs: bagFrom(PRS, 'prs') })
    expect(rows).toHaveLength(3)
    expect(rows.find((r) => r.ref === 'gh#146')).toMatchObject({ kind: 'change', origin: 'github', state: 'merged' })
    expect(rows.find((r) => r.ref === 'gh#140')).toMatchObject({ kind: 'issue', state: 'opened' })
  })
})

describe('one read, of two lists', () => {
  const runner = (issues: Ran, prs: Ran): { run: Runner; seen: { args: string[]; cwd: string }[] } => {
    const seen: { args: string[]; cwd: string }[] = []
    const run: Runner = (program, args, cwd) => {
      expect(program).toBe('gh')
      seen.push({ args, cwd })
      return Promise.resolve(args[0] === 'issue' ? issues : prs)
    }
    return { run, seen }
  }

  test('both lists are asked for, in the folder it was given and nowhere else', async () => {
    const { run, seen } = runner(printed('[]'), printed('[]'))
    const got = await readTracker('/Users/somebody/Projects/roadmap', run)
    expect(got.ok).toBe(true)
    expect(seen).toHaveLength(2)
    expect(seen.every((one) => one.cwd === '/Users/somebody/Projects/roadmap')).toBe(true)
  })

  test('the reading is dated by this app, because this app is what looked', async () => {
    const { run } = runner(printed('[]'), printed('[]'))
    const got = await readTracker('/tmp/x', run)
    if (!got.ok) throw new Error('expected a reading')
    expect(Number.isNaN(Date.parse(got.reading.generated))).toBe(false)
  })

  test('GitLab’s two bags are present and empty, which is a decision rather than data', async () => {
    const { run } = runner(printed('[]'), printed('[]'))
    const got = await readTracker('/tmp/x', run)
    if (!got.ok) throw new Error('expected a reading')
    expect(got.reading.issues).toEqual({})
    expect(got.reading.mrs).toEqual({})
  })

  test('either half failing fails the whole read, rather than half a list', async () => {
    const { run } = runner(printed('[]'), failed('API rate limit exceeded'))
    const got = await readTracker('/tmp/x', run)
    expect(got.ok).toBe(false)
    if (got.ok) throw new Error('unreachable')
    expect(got.trouble).toBe('rate-limited')
  })

  test('a zero exit with unreadable output is its own sentence, not a crash', async () => {
    const { run } = runner(printed('<html>a proxy said no</html>'), printed('[]'))
    const got = await readTracker('/tmp/x', run)
    expect(got.ok).toBe(false)
    if (got.ok) throw new Error('unreachable')
    expect(got.trouble).toBe('refused')
    expect(got.why).toContain('could not read as a list')
  })
})
