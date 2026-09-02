import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'

import type { Trouble, TroubleKind } from '@/live/sight.ts'
import {
  Asking,
  Listening,
  NoProject,
  NothingFound,
  NothingMatches,
  NothingPicked,
  Troubled,
  Unhosted,
  projectName,
} from '@/view/absence.tsx'

/**
 * The words, word for word.
 *
 * ## Why sentences are worth a test
 *
 * Because they are the feature. Every other test in this directory guards a
 * behaviour that would be visibly wrong if it broke; these guard the difference
 * between two pages that both look fine — one that says nothing has told it
 * anything, and one that says there is nothing to tell. A refactor that
 * replaced the second paragraph of `Unhosted` with "No references found" would
 * pass a test asserting the component renders, and would have removed the
 * entire point of the app.
 *
 * So the assertions are on the distinctions rather than on the prose as a
 * whole: each panel must say what happened, and must not say the thing a
 * neighbouring panel says. Rewording is allowed; collapsing two states into one
 * sentence is not.
 */

afterEach(cleanup)

const trouble = (kind: TroubleKind, why = 'something happened', said: string | null = null): Trouble => ({
  kind,
  why,
  said,
})

describe('nothing has told me anything', () => {
  test('says it is not an empty list, in as many words', () => {
    render(<Unhosted />)
    expect(screen.getByText('Nothing has told me anything.')).toBeTruthy()
    expect(document.body.textContent).toContain('An empty list would mean somebody went and looked and found no work. Nobody has looked.')
  })

  test('never says "no references" or "none"', () => {
    render(<Unhosted />)
    const said = document.body.textContent ?? ''
    expect(said.toLowerCase()).not.toContain('no references found')
    expect(said.toLowerCase()).not.toContain('no results')
  })

  test('names where the rows would have come from, which is no longer a roadmap’s cache', () => {
    render(<Unhosted />)
    expect(document.body.textContent).toContain('read out of one project’s GitHub')
  })
})

describe('the absences are different sentences', () => {
  test('waiting to be greeted is not the same as ungreeted', () => {
    render(<Listening />)
    expect(screen.getByText('Waiting to be greeted.')).toBeTruthy()
    cleanup()
    render(<Unhosted />)
    expect(screen.queryByText('Waiting to be greeted.')).toBeNull()
  })

  test('a roadmap with no project folder says so, and does not offer to pick one', () => {
    /* The old page offered an epic picker in the equivalent state. Which project
       a canvas stands in is the host's, and a container offering to change it would
       be one corner steering the whole canvas. */
    render(<NoProject />)
    expect(screen.getByText('A roadmap is here, and it named no project folder.')).toBeTruthy()
    expect(document.body.textContent).toContain('That is not a fault.')
    expect(document.querySelectorAll('button')).toHaveLength(0)
  })

  test('asking is the one honest wait, and says why', () => {
    render(<Asking project="/Users/somebody/Projects/roadmap" />)
    expect(screen.getByText('Reading the tracker in roadmap.')).toBeTruthy()
    expect(document.body.textContent).toContain('the one wait on this page that means an answer is coming')
  })

  test('an empty tracker is an answer rather than a gap, and dates itself', () => {
    render(<NothingFound project="/Users/x/roadmap" generated="2026-08-27T10:00:00Z" />)
    expect(screen.getByText('This project’s tracker has nothing in it.')).toBeTruthy()
    expect(document.body.textContent).toContain('This one is an answer rather than a gap.')
    expect(document.body.textContent).toContain('2026-08-27T10:00:00Z')
  })

  test('a reading with no date says nothing about a date', () => {
    render(<NothingFound project="/x" generated={null} />)
    expect(document.body.textContent).toContain('GitHub was asked')
    expect(document.body.textContent).not.toContain('the reading is dated')
  })

  test('an empty tracker is never confused with a tracker that could not be read', () => {
    render(<NothingFound project="/x" generated={null} />)
    const found = document.body.textContent ?? ''
    cleanup()
    render(<Troubled project="/x" trouble={trouble('offline')} again={() => {}} />)
    const missed = document.body.textContent ?? ''
    expect(found).toContain('genuinely no work filed')
    expect(missed).not.toContain('genuinely no work filed')
  })
})

describe('the failures are told apart, one sentence each', () => {
  const KINDS: TroubleKind[] = [
    'bad-project',
    'no-gh',
    'not-a-repo',
    'no-remote',
    'unauthenticated',
    'offline',
    'rate-limited',
    'refused',
    'door',
  ]

  test('every kind has a heading of its own', () => {
    const titles = new Set<string>()
    for (const kind of KINDS) {
      render(<Troubled project="/x" trouble={trouble(kind)} again={() => {}} />)
      titles.add((document.querySelector('h2')?.textContent ?? '').trim())
      cleanup()
    }
    expect(titles.size).toBe(KINDS.length)
  })

  test('every kind says what it is NOT, and no two say the same thing', () => {
    const means = new Set<string>()
    for (const kind of KINDS) {
      render(<Troubled project="/x" trouble={trouble(kind)} again={() => {}} />)
      const paragraphs = [...document.querySelectorAll('p')].map((p) => p.textContent ?? '')
      means.add(paragraphs[1] ?? '')
      cleanup()
    }
    expect(means.size).toBe(KINDS.length)
  })

  test('the door’s own sentence is drawn, because it is the specific one', () => {
    render(
      <Troubled
        project="/x"
        trouble={trouble('unauthenticated', 'The GitHub CLI on this machine is not logged in.')}
        again={() => {}}
      />,
    )
    expect(document.body.textContent).toContain('The GitHub CLI on this machine is not logged in.')
  })

  test('what the CLI printed is shown rather than summarised, and never on its own', () => {
    render(<Troubled project="/x" trouble={trouble('refused', 'it refused', 'exit status 1: nope')} again={() => {}} />)
    expect(document.body.textContent).toContain('exit status 1: nope')
    expect(document.body.textContent).toContain('it refused')
  })

  test('a failure that printed nothing gets no empty quote drawn for it', () => {
    render(<Troubled project="/x" trouble={trouble('offline')} again={() => {}} />)
    expect(document.body.querySelector('.italic')).toBeNull()
  })

  test('the whole project path is on screen, because a fix happens in a terminal', () => {
    render(<Troubled project="/Users/x/Projects/roadmap" trouble={trouble('no-remote')} again={() => {}} />)
    expect(document.body.textContent).toContain('/Users/x/Projects/roadmap')
  })

  test('only the failures that can pass on their own offer to try again', () => {
    for (const kind of ['offline', 'rate-limited', 'unauthenticated', 'door', 'refused'] as TroubleKind[]) {
      render(<Troubled project="/x" trouble={trouble(kind)} again={() => {}} />)
      expect(screen.getByRole('button', { name: 'Read it again' })).toBeTruthy()
      cleanup()
    }
    for (const kind of ['not-a-repo', 'no-remote', 'no-gh', 'bad-project'] as TroubleKind[]) {
      render(<Troubled project="/x" trouble={trouble(kind)} again={() => {}} />)
      expect(screen.queryByRole('button', { name: 'Read it again' })).toBeNull()
      cleanup()
    }
  })

  test('a project that is not a repository never reads as a fault', () => {
    render(<Troubled project="/x" trouble={trouble('not-a-repo')} again={() => {}} />)
    const said = document.body.textContent ?? ''
    expect(said).toContain('Nothing is wrong and nothing is being waited for')
    expect(said.toLowerCase()).not.toContain('error')
  })
})

describe('the filter hiding everything is the reader’s own doing', () => {
  test('says how many exist, and offers them all back', () => {
    render(<NothingMatches total={412} clear={() => {}} />)
    expect(screen.getByText('Nothing here matches what you asked for.')).toBeTruthy()
    expect(document.body.textContent).toContain('412 references and the filter is hiding every one')
    expect(screen.getByRole('button', { name: 'Show all 412' })).toBeTruthy()
  })

  test('never blames anywhere else for it', () => {
    render(<NothingMatches total={1} clear={() => {}} />)
    const said = document.body.textContent ?? ''
    expect(said).toContain('Nothing has gone missing')
    expect(said).not.toContain('refresh')
  })
})

describe('the list is narrowed to what the kehikko picked, and that reaches nothing', () => {
  test('nothing picked at all: says so, says what would put rows back, and never says "no match"', () => {
    render(<NothingPicked picked={0} total={412} everything={() => {}} />)
    expect(screen.getByText('Nothing is picked on this kehikko.')).toBeTruthy()
    const said = document.body.textContent ?? ''
    expect(said).toContain('Pick a row here, tick a step in a journey')
    expect(said).toContain('Nothing has gone missing')
    expect(said).toContain('412 references')
    expect(said).not.toContain('matches')
  })

  test('something picked that is not here: says the pick is real and about work not filed here', () => {
    render(<NothingPicked picked={3} total={412} everything={() => {}} />)
    expect(screen.getByText('What is picked on this kehikko is not in this list.')).toBeTruthy()
    const said = document.body.textContent ?? ''
    expect(said).toContain('3 references are picked out')
    expect(said).toContain('none of them is among the 412')
    expect(said).not.toContain('Nothing is picked')
  })

  test('one reference picked reads as one', () => {
    render(<NothingPicked picked={1} total={1} everything={() => {}} />)
    const said = document.body.textContent ?? ''
    expect(said).toContain('One reference is picked out')
    expect(said).toContain('it is not among the 1')
    expect(said).toContain('the project has 1 reference.')
  })

  test('the one press is about this group and not about every filter', () => {
    render(<NothingPicked picked={0} total={4} everything={() => {}} />)
    expect(screen.getByRole('button', { name: 'Show everything' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Show all 4' })).toBeNull()
  })
})

describe('what this page calls a project', () => {
  test('the last segment, which is what a person calls it', () => {
    expect(projectName('/Users/somebody/Projects/roadmap')).toBe('roadmap')
    expect(projectName('/Users/somebody/Projects/roadmap/')).toBe('roadmap')
  })

  test('a path with nothing to shorten is left alone rather than emptied', () => {
    expect(projectName('roadmap')).toBe('roadmap')
    expect(projectName('/')).toBe('/')
  })
})
