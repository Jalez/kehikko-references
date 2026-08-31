import { spawn } from 'node:child_process'

/**
 * How a CLI is actually run, and the seam that keeps every decision above it
 * testable without a network.
 *
 * The shape is the host's, deliberately: `server/register.ts` there defines a
 * `Runner` for exactly this reason, and `server/launch.ts` is the same idea for
 * starting a process. The decision about WHAT to run is a pure function; the
 * running is one small thing behind a parameter. Every test in `test/gh.test.ts`
 * passes its own runner and asserts on the argument array, so no test in this
 * repository shells out, needs a login, or notices whether the machine is
 * online.
 *
 * ## `shell: false`, an argument array, and nothing interpolated
 *
 * There is no string anywhere in this file that becomes a command line. `spawn`
 * is given a program and an array, so there is no parser between here and
 * `execve` and no character a caller could send that would start a second
 * command. That matters more here than almost anywhere in this workspace,
 * because this door exists to be called by a page.
 *
 * ## The working directory is the only thing a caller influences
 *
 * And it is never an argument. The repository is not named on the command line
 * at all — no `--repo`, ever — because `gh` reads it out of the git remote of
 * whatever directory it is run in, which means the identity of the repository
 * comes from the project folder the host vouched for rather than from a string
 * somebody sent. `doors.ts` is where that folder is checked before it reaches
 * this file; the honest residue is written down there rather than hidden.
 */

/** What one run of a CLI produced. Kept small: the words are shown almost verbatim. */
export interface Ran {
  /** Whether it exited zero. */
  ok: boolean
  /** The exit code, or null when the process could not be started at all. */
  code: number | null
  /** Whatever it printed on stdout, untrimmed — this is the JSON. */
  out: string
  /** Whatever it printed on stderr, trimmed. `gh` puts its refusals here. */
  said: string
}

export type Runner = (program: string, args: string[], cwd: string) => Promise<Ran>

/**
 * How long either CLI gets before this gives up on it.
 *
 * A number rather than forever, for the reason the wire has a timeout: a CLI
 * waiting on a network that is not there would otherwise hold a request open
 * until the page's own patience ran out, and the page would be showing "reading"
 * over a thing that had already stopped. Twelve seconds is long enough for a
 * cold API call and short enough that nobody sits through it twice.
 */
export const RUN_TIMEOUT_MS = 12_000

/**
 * How much output is read into memory.
 *
 * `gh issue list --limit 400` with long titles is a few hundred kilobytes. Two
 * megabytes is far past that and far short of anything this process would
 * notice. What it stops is the pathological case rather than the ordinary one.
 */
export const MAX_OUTPUT_BYTES = 2_000_000

/**
 * Spawn the CLI and read what it printed.
 *
 * Never rejects. Everything that can go wrong — a missing binary, a timeout, a
 * non-zero exit — comes back as a `Ran` with `ok: false`, because every one of
 * those has a sentence somebody has to read and `diagnose()` is the one place
 * that decides which sentence. A rejection here would route half of them into a
 * catch that could only say "something went wrong".
 */
export const runCli: Runner = (program, args, cwd) =>
  new Promise((settle) => {
    let out = ''
    let said = ''
    let over = false
    const done = (ran: Ran) => {
      if (over) return
      over = true
      settle(ran)
    }
    try {
      const child = spawn(program, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: false })
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        done({ ok: false, code: null, out: '', said: `\`${program}\` did not answer within ${RUN_TIMEOUT_MS / 1000} seconds.` })
      }, RUN_TIMEOUT_MS)
      child.stdout.on('data', (chunk: Buffer) => {
        if (out.length < MAX_OUTPUT_BYTES) out += chunk.toString()
      })
      child.stderr.on('data', (chunk: Buffer) => {
        if (said.length < MAX_OUTPUT_BYTES) said += chunk.toString()
      })
      child.on('error', (error) => {
        clearTimeout(timer)
        /* The commonest one by far is ENOENT: the program is not installed. It
           is passed through as the exit code `null` plus the system's own
           message, and `diagnose()` turns it into the sentence that names what
           to install. */
        done({ ok: false, code: null, out: '', said: error.message })
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        done({ ok: code === 0, code, out, said: said.trim() })
      })
    } catch (error) {
      done({ ok: false, code: null, out: '', said: (error as Error).message })
    }
  })
