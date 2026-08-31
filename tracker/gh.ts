import type { Ran, Runner } from './run.ts'

/**
 * The project's own tracker, read with the CLI that already holds the login.
 *
 * ## Why this file exists at all
 *
 * Every row on this list used to come from `live.get` — the roadmap app's cached
 * reading of the trackers, refreshed by somebody remembering to run
 * `refresh_epic`. So the list was exactly as current as the last time a person
 * thought about it, and "is this issue still open" was a question the page could
 * not answer, only quote. The owner's words were the whole brief:
 *
 * > Issues/MRs can be gotten from the project's own GitHub, no? Doesn't need
 * > separate maintenance.
 *
 * They can. `roadmap.context` carries `projectPath` since protocol 0.8, which is
 * an absolute folder on this machine that the host vouches for, and a folder
 * with a GitHub remote can simply be asked. There is no refresh to remember any
 * more because there is no copy to go stale.
 *
 * ## What that changed about the list, said plainly
 *
 * It is no longer the epic's references. It is the PROJECT's. The roadmap's
 * reading was a curated set — refs the narrative named, plus pull requests
 * discovered against them — and nothing in GitHub records which epic an issue
 * belongs to, so that set cannot be rebuilt from the tracker. The honest choice
 * was between a fresh list of everything and a stale list of the right things,
 * and freshness won because the failure of the second one is invisible: a closed
 * issue that still reads `opened` looks exactly like an open issue.
 *
 * The manifest says so, the header says so, and `absence.tsx` says so. What did
 * NOT change is the shape of a row or the spelling of a ref — see below.
 *
 * ## Why the CLI and not an API call
 *
 * This app holds no token and must not. The person running it is already logged
 * in to `gh`; that program owns the credential, refreshes it, and knows about
 * enterprise hosts, SSO and proxies. A module that read a token out of a config
 * file to make its own HTTPS call would be a second, worse copy of
 * authentication that breaks the first time somebody uses a device flow. The
 * roadmap this module was extracted from shells out for exactly this reason —
 * `src/trackers/exec.ts` there — and so does Diff.
 *
 * ## The reading is the SAME SHAPE `live.get` answered with
 *
 * Four bags — `issues`, `mrs`, `ghIssues`, `ghPrs` — keyed exactly as the
 * roadmap keyed them, so that `src/live/collect.ts` is untouched by this change
 * and a ref is still the string `gh#105`. That is not tidiness. A ref is
 * protocol-visible: it goes out on `selection.set`, the host relays it into the
 * context every framed module receives, and Diff reads it to decide which patch
 * to fetch. Changing what a ref LOOKS like would be changing a canvas-wide
 * vocabulary from inside one container, so the one thing this rewrite was not allowed
 * to touch is the thing it did not touch.
 */

/**
 * How many of each kind are asked for.
 *
 * Four hundred is the number the measurement in the README is written against —
 * it is where this page was shown to render in 41ms with every row still in the
 * document — and it is a bound rather than a budget: a repository with more
 * issues than this is one where a list is the wrong tool anyway, and the page
 * says how many it asked for rather than implying it saw everything.
 */
export const LIMIT = 400

/** Which of the two lists a run is for. */
export type Kind = 'issues' | 'prs'

/**
 * The fields asked for, and the reason each one is on the row.
 *
 * `--json` rather than the default table, because a table is a thing you scrape
 * and this is a contract: `gh` documents these names, refuses one it does not
 * know at the moment it is asked rather than by printing something odd, and adds
 * fields without moving the ones already there.
 */
export const ISSUE_FIELDS = 'number,state,title,updatedAt,closedAt,url,labels,assignees'
export const PR_FIELDS = 'number,state,title,updatedAt,closedAt,mergedAt,url,labels,author,assignees,reviewRequests,isDraft'

/**
 * The argument list for one read.
 *
 * A pure function returning an array, which is the whole of what makes the
 * safety here checkable: a test can assert that no element of it came from
 * anywhere but this file. `--state all` because a list that showed only open
 * work would be a list where a merged pull request has vanished, which is the
 * one thing about a change somebody most wants to see.
 */
export function argsFor(kind: Kind): string[] {
  return kind === 'issues'
    ? ['issue', 'list', '--state', 'all', '--limit', String(LIMIT), '--json', ISSUE_FIELDS]
    : ['pr', 'list', '--state', 'all', '--limit', String(LIMIT), '--json', PR_FIELDS]
}

/**
 * Why a read produced nothing, in the words of somebody who has to fix it.
 *
 * ## Every one of these is a different sentence, and that is the rule
 *
 * This module's oldest promise is that an empty list and a failure must never
 * look alike, and the corollary nobody writes down is that two failures must not
 * look alike either. "Could not read the tracker" over all of these sends
 * somebody to check their network when they are not logged in, or to log in
 * again when the folder simply is not a repository.
 *
 * `not-a-repo` is the one that is not a failure at all. A project can perfectly
 * well be a folder of LaTeX with no `.git` in it; there is no tracker to read,
 * nothing is broken, and the page says so in a paragraph with no remedy in it,
 * because there is nothing to remedy.
 */
export type Trouble =
  /** The folder named is not one this door will run in. Decided before `gh` is reached; see `project.ts`. */
  | 'bad-project'
  | 'no-gh'
  | 'not-a-repo'
  | 'no-remote'
  | 'unauthenticated'
  | 'offline'
  | 'rate-limited'
  | 'refused'

export interface Failed {
  trouble: Trouble
  /** What this app says about it. One sentence, written for the person, never the CLI's. */
  why: string
  /** What `gh` itself printed, so nothing is hidden behind the sentence above. */
  said: string
}

const SAID_MAX = 600

/**
 * Which of the troubles a failed run was, read off the exit code and the words.
 *
 * ## Why the words and not only the code
 *
 * `gh` has exactly one exit code worth branching on — `4` is authentication —
 * and everything else is `1`. So the rest is matched on what it printed, which
 * is a string contract nobody promised and which this file is therefore careful
 * about: every match is a lowercase substring test on a phrase `gh` has printed
 * for years, the order is most-specific first, and the fallback is `refused`,
 * which shows the CLI's own words rather than guessing. A phrase that changes
 * costs one sentence its specificity; it never costs the reader the truth,
 * because `said` is on the page either way.
 *
 * Pure, exported and tested against real captured output, so the five sentences
 * can be held to without anything being offline, logged out or rate-limited.
 */
export function diagnose(ran: Ran): Failed {
  const said = ran.said.slice(0, SAID_MAX)
  const low = said.toLowerCase()
  const as = (trouble: Trouble, why: string): Failed => ({ trouble, why, said })

  /* The process never started. On this path `gh` printed nothing, so the
     message is the operating system's. */
  if (ran.code === null && /enoent|not found|no such file/i.test(said)) {
    return as('no-gh', 'The `gh` command is not on this machine, so there is no way to ask GitHub anything. Installing the GitHub CLI and running `gh auth login` is what fills this list in.')
  }

  if (low.includes('not a git repository')) {
    return as('not-a-repo', 'This project is not a git repository, so it has no tracker to read. That is not a failure — a project can be a folder of writing with no repository under it, and this list has nothing to say about one.')
  }

  if (low.includes('no git remotes found') || low.includes('none of the git remotes')) {
    return as('no-remote', 'This project is a git repository with no remote this app can reach, so there is no tracker behind it. `git remote -v` in the project folder says what it has; a repository that lives only on this machine has no issues and no pull requests anywhere to read.')
  }

  if (ran.code === 4 || low.includes('gh auth login') || low.includes('authentication token')) {
    return as('unauthenticated', 'The GitHub CLI on this machine is not logged in, so it was refused before it could ask about this project. `gh auth login` in a terminal is the whole of the fix, and this list fills in on the next read.')
  }

  if (low.includes('rate limit') || low.includes('secondary rate') || low.includes('abuse detection')) {
    return as('rate-limited', 'GitHub is rate-limiting this machine’s login, so it answered without reading anything. Nothing is wrong with the project or with this app: the limit resets on its own, and `gh api rate_limit` says when.')
  }

  if (
    low.includes('dial tcp') ||
    low.includes('no such host') ||
    low.includes('network is unreachable') ||
    low.includes('connection refused') ||
    low.includes('i/o timeout') ||
    low.includes('did not answer within') ||
    low.includes('tls handshake')
  ) {
    return as('offline', 'GitHub could not be reached from this machine, so nothing was read. This is the network rather than the project or the login, and the same press works again once there is one.')
  }

  return as('refused', 'The GitHub CLI refused this read, and what it said is below. It is not one of the situations this app knows a specific sentence for, so its own words are the best account of it.')
}

/**
 * One reading, in the shape `live.get` used to answer with.
 *
 * `issues` and `mrs` — GitLab's two bags — are present and empty, and that is a
 * decision rather than an oversight. See the note on GitLab at the bottom of
 * this file.
 */
export interface Reading {
  generated: string
  issues: Record<string, unknown>
  mrs: Record<string, unknown>
  ghIssues: Record<string, unknown>
  ghPrs: Record<string, unknown>
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/**
 * A person's name as this app shows one.
 *
 * `name` before `login`, because a list is read by somebody scanning for a
 * colleague and "Jaakko Rajala" is who they are looking for. Empty for anything
 * that is not a person-shaped object, and empties are dropped by the caller —
 * a blank in a list of people is a row implying somebody nobody can name.
 */
const who = (v: unknown): string => {
  if (!isObject(v)) return ''
  return str(v.name) || str(v.login)
}

const people = (v: unknown): string[] => (Array.isArray(v) ? v.map(who).filter(Boolean) : [])

const labels = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((l) => (isObject(l) ? str(l.name) : '')).filter(Boolean) : []

/**
 * How this app spells a GitHub reference, and why it is spelled here and nowhere
 * else.
 *
 * `gh#105`. Exactly what the roadmap wrote into its own readings, exactly what
 * `collect.ts` already keys its rows by, exactly what goes out on
 * `selection.set` and exactly what Diff looks up. One function, one format, and
 * the test that holds it is the one that would catch this change becoming a
 * protocol-visible one by accident.
 */
export function refOf(number: number): string {
  return `gh#${number}`
}

/**
 * The tracker's word for a state, in the three words this app has.
 *
 * `gh` shouts them — `OPEN`, `CLOSED`, `MERGED` — and a state it does not
 * recognise becomes an empty string rather than a guess, which `collect.ts`
 * already reads as "no state we could read" and draws as such. The one thing
 * this must never do is default to `opened`: that is the single fact somebody
 * came to the page to check.
 */
function stateOf(raw: unknown): string {
  const word = str(raw).toUpperCase()
  if (word === 'OPEN') return 'opened'
  if (word === 'CLOSED') return 'closed'
  if (word === 'MERGED') return 'merged'
  return ''
}

/**
 * When it last moved, preferring the thing that ended it.
 *
 * Merged, then closed, then updated — the same precedence the roadmap's own
 * refresher used, so that a list read here and a list read there sort the same
 * way. `updatedAt` alone would put a pull request merged last year above one
 * whose description was edited this morning, which is the wrong answer to "what
 * just moved".
 */
function movedAt(row: Record<string, unknown>): string {
  return str(row.mergedAt) || str(row.closedAt) || str(row.updatedAt)
}

/**
 * `gh`'s JSON, turned into one bag of the reading.
 *
 * Defensive in the same way `collect.ts` is, and for the same reason: this is
 * output from a program on somebody's machine, not a promise. A row with no
 * usable number has no ref and therefore no key, so it is the one thing dropped
 * — everything else becomes an honest blank on the row.
 */
export function bagFrom(text: string, kind: Kind): Record<string, unknown> | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null

  const bag: Record<string, unknown> = {}
  for (const raw of parsed) {
    if (!isObject(raw)) continue
    const number = raw.number
    if (typeof number !== 'number' || !Number.isInteger(number) || number <= 0) continue
    const entry: Record<string, unknown> = {
      state: stateOf(raw.state),
      title: str(raw.title),
      at: movedAt(raw),
      url: str(raw.url),
      labels: labels(raw.labels),
      assignees: people(raw.assignees),
    }
    if (kind === 'prs') {
      entry.draft = raw.isDraft === true
      const author = who(raw.author)
      if (author) entry.author = author
      entry.reviewers = people(raw.reviewRequests)
    }
    bag[refOf(number)] = entry
  }
  return bag
}

export type Read = { ok: true; reading: Reading } | ({ ok: false } & Failed)

/**
 * Read one project's tracker: two runs, side by side.
 *
 * ## Why both, and why the first failure wins
 *
 * Issues and pull requests are two calls to `gh` and there is no one call that
 * answers both. They are started together rather than in sequence, because they
 * are two independent network round trips and doing them one after the other
 * spends the latency twice for no reason.
 *
 * If either fails the whole read fails, and that is deliberate. Every one of the
 * seven troubles is a fact about the repository, the login or the network, so a
 * failure on one call is a failure on both in all but a contrived case — and a
 * half-read that quietly showed issues with no pull requests would be exactly
 * the silent, partial list this module exists to refuse. One failure, one
 * sentence, nothing drawn as if it were complete.
 */
export async function readTracker(cwd: string, run: Runner): Promise<Read> {
  const [issues, prs] = await Promise.all([
    run('gh', argsFor('issues'), cwd),
    run('gh', argsFor('prs'), cwd),
  ])

  if (!issues.ok) return { ok: false, ...diagnose(issues) }
  if (!prs.ok) return { ok: false, ...diagnose(prs) }

  const ghIssues = bagFrom(issues.out, 'issues')
  const ghPrs = bagFrom(prs.out, 'prs')
  if (!ghIssues || !ghPrs) {
    return {
      ok: false,
      trouble: 'refused',
      why: 'The GitHub CLI exited successfully and printed something this app could not read as a list. That is a version of `gh` answering `--json` differently rather than anything wrong with the project.',
      said: (ghIssues ? prs.out : issues.out).slice(0, SAID_MAX),
    }
  }

  return {
    ok: true,
    reading: {
      /* Stated by this app, because this app is the thing that looked. The
         header shows it verbatim and the word beside it is "read", which is
         only honest because this timestamp is the moment of the read rather
         than the moment somebody last ran a refresher. */
      generated: new Date().toISOString(),
      /**
       * GitLab, and the decision not to pretend.
       *
       * These two bags are what the roadmap filled with merge requests, and this
       * app fills neither. `glab` is installed on this machine and would be a
       * dozen lines here, and it is still not done, for one reason: nothing
       * would exercise it. Every project in this workspace is on GitHub, so a
       * GitLab path would be code that has never once run against a real
       * repository, shipped under a summary claiming it works.
       *
       * So the position is stated rather than implied. The manifest's summary no
       * longer claims merge requests; the empty-tracker paragraph says GitHub
       * outright; and the bags stay because `collect.ts` reads four of them and
       * a GitLab reading is what would go here on the day somebody has a GitLab
       * project to test it against. The row, the filter and the `!41` spelling
       * are all still in place waiting for it — what is missing is one call to
       * `glab mr list --output json` and somebody who can see whether it worked.
       */
      issues: {},
      mrs: {},
      ghIssues,
      ghPrs,
    },
  }
}
