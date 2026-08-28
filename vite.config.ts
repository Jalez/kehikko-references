import { resolve } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { WELL_KNOWN } from 'roadmap-module-protocol'

import { ID, MANIFEST, VERSION } from './manifest.ts'

/**
 * The doors this app answers on, other than the page itself.
 *
 * A module is ONE ORIGIN or it is nothing: the protocol refuses a manifest
 * whose `entry` points anywhere but the origin that served the manifest. So the
 * manifest, the health check and the page cannot be split across two processes
 * on two ports, however tidy that would be — they are middleware in front of
 * the same server that serves the page.
 */
function doors(): Plugin {
  return {
    name: 'references-doors',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = (request.url ?? '').split('?')[0]
        const json = (body: unknown) => {
          response.setHeader('content-type', 'application/json; charset=utf-8')
          response.end(JSON.stringify(body, null, 2))
        }
        /* Spelled by the protocol package so that this app and every host
           cannot disagree about it by a character. */
        if (path === WELL_KNOWN) return json(MANIFEST)
        /* Cheap liveness, and named in nobody's manifest — see the essay on
           `health` in the protocol package. It is here because a person
           starting four apps wants one address that says "this one is up"
           without waiting for a page to render. */
        if (path === '/health') return json({ ok: true, id: ID, version: VERSION })
        next()
      })
    },
  }
}

/**
 * The build, and the two lines in it that decide whether this app can be framed
 * at all.
 *
 * ## `server.cors`, which is not optional for a module
 *
 * A host frames a module WITHOUT `allow-same-origin` unless its manifest
 * declares storage, and this one does not. That puts the page on an opaque
 * origin: it has no origin of its own, and every request it makes carries
 * `Origin: null`. Fine for the document, which the browser navigates to — and
 * fatal for the scripts inside it, because `<script type="module">` is ALWAYS
 * fetched in CORS mode. There is no same-origin shortcut for a module script,
 * and an opaque origin matches nothing, so without a permissive header the
 * browser refuses every one of them.
 *
 * What that looks like from outside is worth knowing, because Atlas lost most
 * of a day to it: the document loads, its `load` event fires, the host greets
 * it, and nothing answers — because no script in it ever ran. The host reports
 * a page that "is not speaking", which is true and explains nothing. `curl`
 * cannot see it either, since curl is not subject to CORS, so every door
 * answers 200 with exactly the right bytes while the app is dead in the frame.
 *
 * It costs nothing to give. This origin serves a public page, a manifest and a
 * health check; it holds no credential and has no write path for a header to
 * protect.
 *
 * ## `base: './'`
 *
 * This page is served at `/` here and framed by a roadmap at whatever address
 * that roadmap wrote down — behind a proxy, on another port, under a path
 * nobody here chose. Absolute asset paths are correct in the first case and a
 * guess in the second; relative ones are a fact in both, because the browser
 * resolves them against the document it just fetched.
 */
export default defineConfig({
  base: './',
  plugins: [doors(), react(), tailwindcss()],
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
  server: { cors: true },
  build: { outDir: 'dist', emptyOutDir: true },
})
