import { describe, expect, test } from 'bun:test'
import { PROTOCOL, manifestSchema, speaks } from 'roadmap-module-protocol'

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
    expect(MANIFEST.reacts).toEqual(['selection'])
  })

  test('asks the host for nothing it reads itself', () => {
    expect(MANIFEST.declares.uses).not.toContain('live:read')
    expect(MANIFEST.mcp).toBeUndefined()
  })
})
