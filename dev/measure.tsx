#!/usr/bin/env bun
import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register()

const { render, cleanup } = await import('@testing-library/react')
const { collect } = await import('../src/live/collect.ts')
const { sift, EVERYTHING } = await import('../src/live/sift.ts')
const { ReferenceList } = await import('../src/view/reference-list.tsx')

/**
 * What the list costs, before anybody reaches for a windowing library.
 *
 *   bun run dev/measure.ts
 *
 * ## What this measures and what it does not
 *
 * It measures the part that is ours: turning a reading into rows, narrowing
 * them, and building the DOM for all of them. It does NOT measure paint, layout
 * or scroll smoothness, because it runs in happy-dom and happy-dom does not
 * paint. Anybody quoting these numbers as "it scrolls fine" is quoting them
 * wrong.
 *
 * That limit is worth being plain about, because the number this decides is a
 * design one: whether four hundred rows need windowing. The honest reading of
 * what is below is narrower and still decisive — the work under our control is
 * a handful of milliseconds and the DOM it produces is a few thousand nodes,
 * which is not the size at which a browser struggles. What is left is paint,
 * and paint is what `content-visibility: auto` on each row hands back to the
 * browser to skip, without taking a single row out of the document.
 */

function reading(count: number) {
  const ghIssues: Record<string, unknown> = {}
  for (let n = 1; n <= count; n += 1) {
    ghIssues[`gh#${n}`] = {
      state: n % 4 === 0 ? 'closed' : 'opened',
      title: `the thing that has to become true, number ${n}`,
      at: '2026-08-20T10:00:00Z',
      url: `https://github.com/example/repo/issues/${n}`,
      labels: ['area::db', 'importance::P1'],
      assignees: ['ada lovelace'],
    }
  }
  return { generated: '2026-08-27T09:12:00Z', ghIssues }
}

const at = () => performance.now()

for (const count of [50, 400, 1000, 4000]) {
  const raw = reading(count)

  const collectStart = at()
  const rows = collect(raw)
  const collected = at() - collectStart

  const siftStart = at()
  for (let i = 0; i < 10; i += 1) sift(rows, { ...EVERYTHING, query: 'number 3' })
  const sifted = (at() - siftStart) / 10

  const renderStart = at()
  const { container } = render(<ReferenceList rows={rows} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} />)
  const rendered = at() - renderStart
  const nodes = container.querySelectorAll('*').length
  cleanup()

  console.log(
    [
      String(count).padStart(5),
      `rows  collect ${collected.toFixed(1).padStart(6)}ms`,
      `sift ${sifted.toFixed(1).padStart(6)}ms`,
      `render ${rendered.toFixed(1).padStart(7)}ms`,
      `${String(nodes).padStart(6)} DOM nodes (${(nodes / count).toFixed(1)} per row)`,
    ].join('  '),
  )
}
