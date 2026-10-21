import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { trackerRowSchema } from 'kehikot-module-protocol'

import { collect } from '@/live/collect.ts'
import {
  GITHUB_AVATARS,
  GRAVATAR,
  assignedFaces,
  avatarAllowed,
  facesColumns,
  facesWidth,
  avatarHostsOfReading,
  imageLoadable,
  imgSrcPolicy,
  initialsOf,
  pinImagePolicy,
  pinnedImageHosts,
  unpinImagePolicyForTests,
} from '@/live/faces.ts'
import { ReferenceList } from '@/view/reference-list.tsx'
import { row } from './fixtures.ts'

/**
 * Faces on the assignee and reviewer markers (protocol 2.10.0 `people`): a
 * picture only from the forge's own avatar hosts and only under the page's
 * pinned image policy, initials otherwise, overlapping with `+N` past three,
 * and each reviewer's state as a badge shape on their face.
 */

const face = (id: number) => `https://${GITHUB_AVATARS}/u/${id}?s=48&v=4`
const GL = 'gitlab.example.org'

function forget() {
  unpinImagePolicyForTests()
  for (const meta of document.head.querySelectorAll('meta[data-avatars]')) meta.remove()
}
beforeEach(forget)
afterEach(() => {
  cleanup()
  forget()
})

const list = (rows: Record<string, unknown>[]) =>
  render(<ReferenceList rows={collect(rows)} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} />)

const pinGitHub = () => pinImagePolicy([GITHUB_AVATARS])

describe('which pictures may be loaded', () => {
  test('GitHub: avatars.githubusercontent.com only', () => {
    expect(avatarAllowed(face(1), 'github', 'github.com')).toBe(true)
    expect(avatarAllowed('https://evil.example/u/1.png', 'github', 'github.com')).toBe(false)
    expect(avatarAllowed(`https://${GRAVATAR}/avatar/abc`, 'github', 'github.com')).toBe(false)
    expect(avatarAllowed(`http://${GITHUB_AVATARS}/u/1`, 'github', 'github.com')).toBe(false)
    expect(avatarAllowed(`https://user:pw@${GITHUB_AVATARS}/u/1`, 'github', 'github.com')).toBe(false)
  })
  test('GitLab: the row’s own host and Gravatar, nothing else', () => {
    expect(avatarAllowed(`https://${GL}/uploads/-/system/user/avatar/7/a.png`, 'gitlab', GL)).toBe(true)
    expect(avatarAllowed(`https://${GRAVATAR}/avatar/abc?s=80&d=identicon`, 'gitlab', GL)).toBe(true)
    expect(avatarAllowed('https://gitlab.other.org/uploads/a.png', 'gitlab', GL)).toBe(false)
    expect(avatarAllowed(face(1), 'gitlab', GL)).toBe(false)
    expect(avatarAllowed('data:image/png;base64,AAAA', 'gitlab', GL)).toBe(false)
  })
})

describe('the image policy', () => {
  test('img-src names this page and exactly the avatar hosts, https: only', () => {
    expect(imgSrcPolicy([GITHUB_AVATARS, GL, GRAVATAR])).toBe(`img-src 'self' https://${GITHUB_AVATARS} https://${GL} https://${GRAVATAR}`)
    /* A host that is not a host name cannot widen it. */
    expect(imgSrcPolicy(['*', 'evil.example; script-src *', GL])).toBe(`img-src 'self' https://${GL}`)
  })
  test('the hosts come from the reading: GitHub’s avatar host, each GitLab host and Gravatar with it', () => {
    expect(avatarHostsOfReading({ sources: [{ tracker: 'github', host: 'github.com' }], rows: [] })).toEqual([GITHUB_AVATARS])
    expect(
      avatarHostsOfReading({
        sources: [{ tracker: 'gitlab', host: GL }],
        rows: [{ tracker: 'gitlab', host: 'gitlab.com' }, { tracker: 'github', host: 'github.com' }, 'nonsense'],
      }),
    ).toEqual([GITHUB_AVATARS, 'gitlab.com', GL, GRAVATAR].sort())
  })
  test('pinned once, as a meta in the head; a second pin changes nothing', () => {
    pinImagePolicy([GITHUB_AVATARS])
    pinImagePolicy([GL])
    const metas = [...document.head.querySelectorAll('meta[data-avatars]')] as HTMLMetaElement[]
    expect(metas).toHaveLength(1)
    expect(metas[0]!.httpEquiv).toBe('Content-Security-Policy')
    expect(metas[0]!.content).toBe(`img-src 'self' https://${GITHUB_AVATARS}`)
    expect([...pinnedImageHosts()!]).toEqual([GITHUB_AVATARS])
    expect(imageLoadable(face(1))).toBe(true)
    expect(imageLoadable(`https://${GL}/a.png`)).toBe(false)
  })
  test('nothing is loadable before a policy is pinned', () => {
    expect(imageLoadable(face(1))).toBe(false)
  })
})

describe('the avatar', () => {
  const assigned = row('gh#7', {
    assignees: ['Mona Lisa'],
    assigneeLogins: ['mona'],
    people: { mona: { name: 'Mona Lisa', avatarUrl: face(2) } },
  })

  test('is shown, 16px, lazy, with no referrer, and its alt is the person’s name', () => {
    pinGitHub()
    const { container } = list([assigned])
    const img = container.querySelector('[data-marker="assigned"] img') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.getAttribute('src')).toBe(face(2))
    expect(img.getAttribute('alt')).toBe('Mona Lisa')
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(img.getAttribute('width')).toBe('16')
    expect(img.className).toContain('size-4')
  })

  test('falls back to initials when there is no picture', () => {
    pinGitHub()
    const { container } = list([row('gh#8', { assignees: ['Ada Lovelace'], assigneeLogins: ['ada'], people: { ada: { name: 'Ada Lovelace' } } })])
    const initials = container.querySelector('[data-marker="assigned"] [data-initials]') as HTMLElement
    expect(initials.textContent).toBe('AL')
    expect(initials.getAttribute('aria-label')).toBe('Ada Lovelace')
    expect(container.querySelector('[data-marker="assigned"] img')).toBeNull()
  })

  test('falls back to initials when the picture fails to load', () => {
    pinGitHub()
    const { container } = list([assigned])
    fireEvent.error(container.querySelector('[data-marker="assigned"] img')!)
    expect(container.querySelector('[data-marker="assigned"] img')).toBeNull()
    expect(container.querySelector('[data-marker="assigned"] [data-initials]')!.textContent).toBe('ML')
  })

  test('an older host’s display names still draw initials', () => {
    pinGitHub()
    const { container } = list([row('gh#9', { assignees: ['ada lovelace'] })])
    expect(container.querySelector('[data-marker="assigned"] [data-initials]')!.textContent).toBe('AL')
  })

  test('a picture on a host the forge does not serve avatars from is refused: initials, no request', () => {
    pinImagePolicy([GITHUB_AVATARS, 'evil.example'])
    const evil = row('gh#10', { assignees: ['Mona'], assigneeLogins: ['mona'], people: { mona: { avatarUrl: 'https://evil.example/mona.png' } } })
    expect(collect([evil])[0]!.assignedFaces[0]!.avatarUrl).toBeNull()
    const { container } = list([evil])
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[data-marker="assigned"] [data-initials]')!.textContent).toBe('M')
  })

  test('an allowed picture whose host the pinned policy does not name is not asked for', () => {
    pinImagePolicy([GL])
    const { container } = list([assigned])
    expect(container.querySelector('img')).toBeNull()
  })

  test('a login that is a prototype key is nobody’s picture', () => {
    const r = trackerRowSchema.parse(row('gh#11', { assignees: ['x'], assigneeLogins: ['constructor'] }))
    expect(assignedFaces(r)).toEqual([{ login: 'constructor', name: 'constructor', avatarUrl: null }])
  })

  test('initials', () => {
    expect(initialsOf('Mona Lisa')).toBe('ML')
    expect(initialsOf('jaakko.rajala')).toBe('JR')
    expect(initialsOf('hubot')).toBe('H')
    expect(initialsOf('Ärrä Öljy Ütz')).toBe('ÄÜ')
    expect(initialsOf('')).toBe('?')
  })
})

describe('several people', () => {
  const five = ['ann', 'bob', 'cat', 'dan', 'eve']
  const crowded = row('gh#20', {
    kind: 'change',
    assignees: five,
    assigneeLogins: five,
    reviewers: five.map((login) => ({ login, state: 'requested' })),
    people: Object.fromEntries(five.map((login, i) => [login, { avatarUrl: face(i + 1) }])),
  })

  test('overlap: three faces, each after the first drawn over by the one before, and +N for the rest', () => {
    pinGitHub()
    const { container } = list([crowded])
    for (const marker of ['assigned', 'review-asked']) {
      const faces = [...container.querySelectorAll(`[data-marker="${marker}"] [data-face]`)] as HTMLElement[]
      expect(faces.map((f) => f.dataset.face)).toEqual(['ann', 'bob', 'cat'])
      for (const f of faces) expect(f.className).toContain('-ml-1')
      expect(faces[0]!.className).toContain('first:ml-0')
      const z = faces.map((f) => Number(f.style.zIndex))
      expect(z[0]! > z[1]! && z[1]! > z[2]!).toBe(true)
      expect((container.querySelector(`[data-marker="${marker}"] [data-more]`) as HTMLElement).textContent).toBe('+2')
    }
  })

  test('the tooltip and label name everybody, not only the three drawn', () => {
    pinGitHub()
    const { container } = list([crowded])
    expect(container.querySelector('[data-marker="assigned"]')!.getAttribute('aria-label')).toBe('Assigned to ann, bob, cat, dan, eve')
    expect(container.querySelector('[data-marker="review-asked"]')!.getAttribute('aria-label')).toBe(
      'Review asked, not started: ann (asked), bob (asked), cat (asked), dan (asked), eve (asked)',
    )
  })

  test('three or fewer: no +N', () => {
    pinGitHub()
    const { container } = list([row('gh#21', { assignees: ['a', 'b', 'c'], assigneeLogins: ['a', 'b', 'c'] })])
    expect(container.querySelectorAll('[data-marker="assigned"] [data-face]')).toHaveLength(3)
    expect(container.querySelector('[data-more]')).toBeNull()
  })
})

describe('a reviewer’s state on their face', () => {
  const reviewed = row('gh#30', {
    kind: 'change',
    reviewers: [
      { login: 'ann', state: 'requested' },
      { login: 'bob', state: 'commented' },
      { login: 'cat', state: 'changes' },
    ],
    people: { ann: { name: 'Ann Arbor', avatarUrl: face(1) }, bob: { avatarUrl: face(2) }, cat: { name: 'Cat Stevens' } },
  })

  test('each face carries a badge of its own shape, picture or initials alike', () => {
    pinGitHub()
    const { container } = list([reviewed, row('gh#31', { kind: 'change', reviewers: [{ login: 'dan', state: 'approved' }] })])
    const badges = [...container.querySelectorAll('[data-badge]')] as HTMLElement[]
    expect(badges.map((b) => b.dataset.badge)).toEqual(['requested', 'commented', 'changes', 'approved'])
    /* Not colour alone: four states, four different shapes. */
    expect(new Set(badges.map((b) => b.innerHTML)).size).toBe(4)
    expect(container.querySelector('[data-face="cat"] [data-initials]')!.textContent).toBe('CS')
    expect(container.querySelector('[data-face="cat"] [data-badge="changes"]')).not.toBeNull()
  })

  test('the tooltip names each reviewer by the name the host gave and says their state', () => {
    pinGitHub()
    const { container } = list([reviewed])
    expect(container.querySelector('[data-marker^="review-"]')!.getAttribute('aria-label')).toBe(
      'Changes requested: Ann Arbor (asked), bob (reviewing), Cat Stevens (changes requested)',
    )
  })

  test('assignees carry no badge', () => {
    pinGitHub()
    const { container } = list([row('gh#32', { assignees: ['Ann'], assigneeLogins: ['ann'] })])
    expect(container.querySelector('[data-marker="assigned"] [data-badge]')).toBeNull()
  })
})

describe('the layout', () => {
  test('the faces columns are as wide as the list needs: one face, three, three and +N, nobody', () => {
    expect(facesWidth(0)).toBe(0)
    expect(facesWidth(1)).toBe(20)
    expect(facesWidth(3)).toBe(44)
    expect(facesWidth(5)).toBe(56)
    expect(facesWidth(50)).toBe(56)
    const rows = collect([
      row('gh#40', { kind: 'change', assignees: ['Ann'], reviewers: [{ login: 'bob', state: 'approved' }, { login: 'cat', state: 'requested' }] }),
      row('gh#41', { kind: 'change', reviewers: [{ login: 'bob', state: 'approved' }] }),
    ])
    expect(facesColumns(rows)).toEqual({ assigned: 20, review: 32 })
  })

  test('a faces marker is as wide as it says narrow, and its column’s width from 24rem of the frame, as its empty slot is', () => {
    const { container } = list([
      row('gh#40', { kind: 'change', assignees: ['Ann'], reviewers: [{ login: 'bob', state: 'approved' }] }),
      row('gh#41', { kind: 'change', reviewers: [{ login: 'bob', state: 'approved' }] }),
    ])
    const ul = container.querySelector('ul') as HTMLElement
    expect(ul.style.getPropertyValue('--faces-assigned')).toBe('20px')
    expect(ul.style.getPropertyValue('--faces-review')).toBe('20px')
    const marks = [...container.querySelectorAll('li[data-ref="gh#40"] [data-marker]')] as HTMLElement[]
    expect(marks[0]!.className).toContain('@sm/frame:w-[var(--faces-assigned,56px)]')
    expect(marks[1]!.className).toContain('@sm/frame:w-[var(--faces-review,56px)]')
    for (const m of marks) {
      expect(m.className).toContain('w-auto')
      expect(m.className).not.toMatch(/(^|\s|:)hidden(\s|$)/)
    }
    /* gh#41 has nobody assigned: the slot keeps the column, and is not drawn narrow. */
    const slot = container.querySelector('li[data-ref="gh#41"] [data-slot="assigned"]') as HTMLElement
    expect(slot.className).toContain('w-[var(--faces-assigned,56px)]')
    expect(slot.className).toContain('hidden')
    expect(slot.className).toContain('@sm/frame:block')
  })
})
