import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { WELL_KNOWN } from 'roadmap-module-protocol'

import { MANIFEST, answer } from './doors.ts'

/**
 * The doors this app answers on, other than the page itself.
 *
 * A module is ONE ORIGIN or it is nothing: the protocol refuses a manifest
 * whose `entry` points anywhere but the origin that served the manifest. So the
 * manifest, the health check, this app's `/api/references` and the page cannot
 * be split across two processes on two ports, however tidy that would be — they
 * are middleware in front of the same server that serves the page. The deciding
 * lives in `doors.ts`, which holds no socket; this adapts a node request to it.
 */
function doors(): Plugin {
  return {
    name: 'references-doors',
    configureServer(server) {
      const index = resolve(import.meta.dirname, 'index.html')

      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1')
        const path = url.pathname
        const method = (request.method ?? 'GET').toUpperCase()

        const send = (status: number, body: unknown) => {
          response.statusCode = status
          response.setHeader('content-type', 'application/json; charset=utf-8')
          response.end(JSON.stringify(body, null, 2))
        }

        /* Spelled by the protocol package so that this app and every host
           cannot disagree about it by a character. */
        if (path === WELL_KNOWN) return send(200, MANIFEST)

        /*
         * The page, served here rather than left to Vite's own index handling,
         * for one header.
         *
         * This module declares storage, so a host frames it WITH
         * `allow-same-origin` and it keeps its real origin. Having an origin is
         * what makes `frame-ancestors` mean something: without this line any
         * page anywhere could frame this one, and an origin that answers a
         * credentialed door should not also be silently embeddable. It is
         * deliberately not a list of one — whoever runs this decides, through
         * `ROADMAP_ORIGIN`, and the default is the address the host in this
         * workspace actually serves on. `'self'` is in it so that opening this
         * page directly on its own port still works.
         *
         * `127.0.0.1:7821` is in the default too, and it is the stub host in
         * `dev/stub-host.ts`. That was not planned: the first time this page was
         * measured in a browser after the header was added, the frame did not
         * load at all and the probe reported "no module frame" at every width,
         * with nothing in any log — because a refused frame is refused by the
         * browser and this app never hears about it. A development harness that
         * silently stops working the moment somebody adds a security header is a
         * harness people stop trusting, so the one loopback port it runs on is
         * named. Anybody who does not want it sets `ROADMAP_ORIGIN`.
         *
         * The document still goes through `transformIndexHtml`, so Vite's
         * client and the module graph are injected exactly as they would be for
         * an ordinary index — this claims the response, not the build.
         */
        if (path === '/') {
          void server
            .transformIndexHtml(request.url ?? '/', readFileSync(index, 'utf8'), request.originalUrl)
            .then((html) => {
              response.statusCode = 200
              response.setHeader('content-type', 'text/html; charset=utf-8')
              response.setHeader(
                'content-security-policy',
                `frame-ancestors 'self' ${process.env.ROADMAP_ORIGIN ?? 'http://127.0.0.1:4181 http://localhost:4181 http://127.0.0.1:7821'}`,
              )
              response.end(html)
            })
            .catch(next)
          return
        }

        /* `/health` is kept beside `/healthz` because this app answered on it
           for its whole life and something on somebody's machine is watching
           it. Two spellings of a liveness check cost nothing; a monitor that
           starts reporting a dead module because a path was tidied costs an
           afternoon. */
        if (path !== '/healthz' && path !== '/health' && !path.startsWith('/api/')) return next()

        void answer(method, path === '/health' ? '/healthz' : path, url.searchParams)
          .then((reply) => {
            if (!reply) return next()
            send(reply.status, reply.body)
          })
          .catch(next)
      })
    },
  }
}

/**
 * The build, and the one line in it that decides who may read this port.
 *
 * ## `server.cors: false`, and why this file used to say the opposite
 *
 * It said `cors: true`, and it had to, and the reasoning was correct for the app
 * that existed then. A host frames a module WITHOUT `allow-same-origin` unless
 * its manifest declares storage, which puts the page on an opaque origin — and
 * `<script type="module">` is ALWAYS fetched in CORS mode, so with no permissive
 * header not one script in the page runs. The document loads, `load` fires, the
 * host greets it, and nothing answers. `curl` cannot see it, being unsubject to
 * CORS; only the browser console can. That has cost this codebase days, and the
 * paragraph is kept rather than deleted because the trap is still there for
 * anybody who removes `storage: true` from the manifest without reading this.
 *
 * What changed is that this app now has something behind a door.
 * `/api/references` runs `gh issue list` under this machine's login, in a folder
 * a caller names. With a permissive `Access-Control-Allow-Origin` any page in
 * any tab could call it and READ the answer — the issue and pull-request list of
 * every private repository checked out on this machine, exfiltrated through the
 * person's own browser with no prompt. Loopback is a fence around the machine
 * and not around the programs on it, and that is not theoretical: Journeys had
 * the same shape and it was demonstrated with a one-line `curl` carrying
 * `Origin: https://evil.example`.
 *
 * So the manifest declares `storage: true`, this page keeps a real origin, its
 * scripts and its `/api/references` calls are ordinary same-origin requests, no
 * CORS is involved at all, and a stranger's fetch gets nothing back. The full
 * argument is in `manifest.ts`.
 *
 * `false` rather than simply omitted, and the word is earned: Vite's default is
 * not "off". It answers CORS for any loopback origin, so the remote-website hole
 * is shut by Vite and the local one is not — and a door that runs `gh` under
 * somebody's login should not be readable by every other dev server they happen
 * to be running. Turning it off costs this page nothing, because everything it
 * fetches is its own origin.
 *
 * The check, which takes one line and should be run after touching this file:
 *
 *   curl -sI -H 'Origin: https://evil.example' http://127.0.0.1:7820/ | grep -i access-control
 *
 * It must print nothing.
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
  server: { cors: false },
  build: { outDir: 'dist', emptyOutDir: true },
})
