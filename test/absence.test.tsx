import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'

import { Asking, Listening, NoEpic, NothingFound, NothingMatches, Refused, Unhosted, Unread } from '@/view/absence.tsx'

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
})

describe('the four absences are four different sentences', () => {
  test('waiting to be greeted is not the same as ungreeted', () => {
    render(<Listening />)
    expect(screen.getByText('Waiting to be greeted.')).toBeTruthy()
    cleanup()
    render(<Unhosted />)
    expect(screen.queryByText('Waiting to be greeted.')).toBeNull()
  })

  test('an open roadmap with no epic says so, and offers what it was given', () => {
    render(<NoEpic epics={[{ epic: 'connected-apps', title: 'Connected apps' }]} look={() => {}} />)
    expect(screen.getByText('A roadmap is here, and no epic is open.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Connected apps' })).toBeTruthy()
  })

  test('asking is the one honest wait, and says why', () => {
    render(<Asking epic="modes-are-modules" />)
    expect(screen.getByText('Asking about modes-are-modules.')).toBeTruthy()
    expect(document.body.textContent).toContain('the one wait on this page that means an answer is coming')
  })

  test('never refreshed is not the same as nothing found', () => {
    render(<Unread epic="modes-are-modules" />)
    expect(screen.getByText('This epic has never been refreshed.')).toBeTruthy()
    expect(document.body.textContent).toContain('not an empty set of references, but no reading')
    cleanup()
    render(<NothingFound epic="modes-are-modules" generated="2026-08-27T10:00:00Z" />)
    expect(screen.getByText('The last refresh found no references here.')).toBeTruthy()
    expect(document.body.textContent).toContain('This one is an answer rather than a gap.')
    expect(document.body.textContent).toContain('2026-08-27T10:00:00Z')
  })

  test('a reading with no date says nothing about a date', () => {
    render(<NothingFound epic="x" generated={null} />)
    expect(document.body.textContent).toContain('The roadmap looked')
    expect(document.body.textContent).not.toContain('the reading is dated')
  })
})

describe('a refusal carries both halves and a third sentence', () => {
  test('the word, the host’s own sentence, and what it means for the reader', () => {
    render(
      <Refused
        epic="modes-are-modules"
        refusal={{ reason: 'unknown-method', error: 'this roadmap does not answer live.get' }}
        again={() => {}}
      />,
    )
    const said = document.body.textContent ?? ''
    expect(said).toContain('unknown-method')
    expect(said).toContain('this roadmap does not answer live.get')
    expect(said).toContain('That is not a wait: it will not begin answering')
  })

  test('only the refusals worth retrying offer a retry', () => {
    render(<Refused epic="x" refusal={{ reason: 'unknown-method', error: '' }} again={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Ask again' })).toBeNull()
    cleanup()
    render(<Refused epic="x" refusal={{ reason: 'failed', error: 'the disk went away' }} again={() => {}} />)
    expect(screen.getByRole('button', { name: 'Ask again' })).toBeTruthy()
    cleanup()
    render(<Refused epic="x" refusal={{ reason: 'silent', error: 'no answer in 12 seconds' }} again={() => {}} />)
    expect(screen.getByRole('button', { name: 'Ask again' })).toBeTruthy()
  })

  test('a host that sent no sentence gets no empty quote drawn for it', () => {
    render(<Refused epic="x" refusal={{ reason: 'failed', error: '' }} again={() => {}} />)
    expect(document.body.querySelector('.italic')).toBeNull()
  })
})

describe('the filter hiding everything is the reader’s own doing', () => {
  test('says how many exist, and offers them all back', () => {
    render(<NothingMatches total={412} clear={() => {}} />)
    expect(screen.getByText('Nothing here matches what you asked for.')).toBeTruthy()
    expect(document.body.textContent).toContain('412 references and the filter is hiding every one')
    expect(screen.getByRole('button', { name: 'Show all 412' })).toBeTruthy()
  })

  test('never blames the roadmap for it', () => {
    render(<NothingMatches total={1} clear={() => {}} />)
    const said = document.body.textContent ?? ''
    expect(said).toContain('Nothing has gone missing')
    expect(said).not.toContain('refresh')
  })
})
