import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { forgetTold, forgetToldEverywhere } from '../forget-told.ts'
import { MANIFEST } from '../manifest.ts'

/**
 * 3.29.0: Kehikot tells agents about new activity itself, so this module no
 * longer does, and the record 3.28.0 kept of what it told goes. Scratch
 * folders; the host's answer is made up.
 */

let root: string
let project: string
let told: string
let other: string

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'kehikko-references-told-')))
  project = join(root, 'work')
  const dir = join(project, '.kehikot', 'references')
  mkdirSync(dir, { recursive: true })
  told = join(dir, 'told.json')
  other = join(dir, 'other.json')
  writeFileSync(told, '{}')
  writeFileSync(other, '{}')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('the old record of what was told', () => {
  test('removed from a project, and nothing else of the module’s', () => {
    expect(forgetTold(project)).toBe(true)
    expect(existsSync(told)).toBe(false)
    expect(existsSync(other)).toBe(true)
    expect(forgetTold(project)).toBe(false)
  })

  test('removed in every project the host says this module keeps its folder in, asking until it answers', async () => {
    const answers = [
      { ok: false as const, why: 'no host yet' },
      { ok: true as const, data: { projects: [{ path: project, name: 'work' }] } },
    ]
    let asked = 0
    await forgetToldEverywhere({ ask: async () => answers[asked++]!, retryMs: 1 })
    expect(asked).toBe(2)
    expect(existsSync(told)).toBe(false)
  })

  test('a host that never answers it: given up on, the file left', async () => {
    let asked = 0
    await forgetToldEverywhere({
      ask: async () => {
        asked += 1
        return { ok: false as const, why: 'too old', declined: 'host-too-old' as const }
      },
      retryMs: 1,
    })
    expect(asked).toBe(1)
    expect(existsSync(told)).toBe(true)
  })

  test('this module tells agents nothing any more: no door for it, no toggle', async () => {
    const { answer } = await import('../doors.ts')
    expect(await answer('POST', '/api/tell', new URLSearchParams())).toBeNull()
    expect(JSON.stringify(MANIFEST)).not.toContain('Tell agents')
  })
})
