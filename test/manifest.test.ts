import { describe, expect, test } from 'bun:test'
import { PROTOCOL, manifestSchema, speaks } from 'kehikot-module-protocol'

import { ID, MANIFEST } from '../manifest.ts'

/**
 * The manifest is the only half of this program a host reads before deciding
 * whether to frame it, and what it says about the selection is the only way a
 * registry can name this module as one end of a relationship. Each word here
 * is a claim about what the program does, and these tests hold the words to
 * the program.
 */
describe('the manifest a host reads', () => {
  test('parses under the protocol package that is installed, and admits it', () => {
    expect(() => manifestSchema.parse(MANIFEST)).not.toThrow()
    expect(MANIFEST.protocol).toBe(PROTOCOL)
    expect(speaks(MANIFEST.declares.protocol, PROTOCOL)).toBe(true)
    expect(MANIFEST.id).toBe(ID)
  })

  /**
   * Both ends of the selection. `selection:set` is sent when a row is picked;
   * `reacts: ['selection']` is the fourth filter group narrowing the list to
   * the canvas selection while it is on. The second is only honest because the
   * list actually narrows — a tick drawn from the selection is display, not a
   * reaction, and would not have earned the word.
   */
  test('says it both sets the selection and narrows when it changes', () => {
    expect(MANIFEST.declares.uses).toContain('selection:set')
    expect(MANIFEST.declares.uses).toContain('filters:set')
    expect(MANIFEST.reacts).toEqual(['selection', 'containers', 'dispositions', 'tracker', 'content', 'parts'])
  })

  /**
   * `reacts: ['parts']` is the list narrowing to the refs of the parts of the
   * epic picked out in the host's bar, and saying how many rows that left out.
   * There is no capability beside it: picking a part is the host's own
   * control, and nothing here asks for it.
   */
  test('says it narrows when the picked parts of the epic change, and asks for nothing to do it', () => {
    expect(MANIFEST.reacts).toContain('parts')
    expect(MANIFEST.declares.uses.some((use) => use.includes('part'))).toBe(false)
  })

  /**
   * The rows are the host's shared tracker reading (issue #4): read under
   * `trackers:read`, read again under `trackers:refresh`, and re-asked when
   * `context.tracker.at` moves — which is what `reacts: ['tracker']` says.
   */
  test('says it reads the shared tracker reading, asks for it to be read again, and reacts when it moves', () => {
    expect(MANIFEST.declares.uses).toContain('trackers:read')
    expect(MANIFEST.declares.uses).toContain('trackers:refresh')
    expect(MANIFEST.reacts).toContain('tracker')
  })

  /**
   * The scope (issue #1) narrows to what the open epic names, asked of the
   * host: the steps' refs under `steps:read`, the umbrella under `epics:read`.
   */
  test('says it reads the open epic’s steps and umbrella', () => {
    expect(MANIFEST.declares.uses).toContain('steps:read')
    expect(MANIFEST.declares.uses).toContain('epics:read')
  })

  /**
   * And asks both again when the epic's material changes while it is open
   * (issue #7), which is what `reacts: ['content']` says. This app only reads,
   * so it reports nothing: `content:report` is for a module saying its OWN
   * material changed.
   */
  test('says it reacts when the open epic’s content changes, and reports none of its own', () => {
    expect(MANIFEST.reacts).toContain('content')
    expect(MANIFEST.declares.uses).not.toContain('content:report')
  })

  test('asks for no old door to the same reading, and opens no door of its own', () => {
    expect(MANIFEST.declares.uses).not.toContain('live:read')
    expect(MANIFEST.mcp).toBeUndefined()
  })
})
