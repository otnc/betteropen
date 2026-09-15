#!/usr/bin/env node
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import * as streamConsumers from 'node:stream/consumers'
import { pathToFileURL } from 'node:url'
import { type ArgsDef, defineCommand, runMain } from 'citty'
import { filetypeextension } from 'magic-bytes.js'
import { open } from './launcher.js'

// `dist/cli.js` and `src/cli.ts` are both one level below the package root, so this resolves correctly whether running the built CLI or this source file directly.
const { version, description } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as {
  version: string
  description: string
}

export async function readTargetFromStdin(extensionOverride?: string): Promise<string> {
  const buffer = await streamConsumers.buffer(process.stdin)
  const [detected] = filetypeextension(buffer)
  const extension = extensionOverride ?? detected ?? 'txt'

  const filePath = join(tmpdir(), `betteropen-${randomUUID()}.${extension}`)
  await writeFile(filePath, buffer)
  return filePath
}

export type RunOpenArgs = {
  target?: string
  wait: boolean
  background: boolean
  extension?: string
  app?: string
  appArguments: readonly string[]
}

export async function runOpen(args: RunOpenArgs): Promise<void> {
  const options = {
    wait: args.wait,
    background: args.background,
    ...(args.app ? { app: { name: args.app, arguments: [...args.appArguments] } } : {}),
  }

  if (args.target) {
    await open(args.target, options)
    return
  }

  if (process.stdin.isTTY) {
    console.error('Specify a file path or URL.')
    process.exitCode = 1
    return
  }

  const filePath = await readTargetFromStdin(args.extension)
  await open(filePath, options)
}

const argsDef = {
  target: {
    type: 'positional',
    description: 'File path or URL to open',
    required: false,
  },
  wait: {
    type: 'boolean',
    description: 'Wait for the app to exit',
    default: false,
  },
  background: {
    type: 'boolean',
    description: 'Do not bring the app to the foreground (macOS only)',
    default: false,
  },
  extension: {
    type: 'string',
    description: "File extension to use when stdin's type can't be detected",
  },
} as const satisfies ArgsDef

/**
 * Everything after a literal `--` is the app to open with and its own arguments (e.g. `betteropen file.png -- firefox --private-window`) — split it off before handing the rest to citty, since citty's own positional-arg slots don't distinguish "before `--`" from "after `--`".
 */
function splitAtDoubleDash(argv: readonly string[]): {
  mainArgs: string[]
  app?: string
  appArguments: string[]
} {
  const separatorIndex = argv.indexOf('--')
  if (separatorIndex === -1) {
    return { mainArgs: [...argv], appArguments: [] }
  }

  const [app, ...appArguments] = argv.slice(separatorIndex + 1)
  return { mainArgs: argv.slice(0, separatorIndex), app, appArguments }
}

function buildCommand(app: string | undefined, appArguments: readonly string[]) {
  return defineCommand({
    meta: { name: 'betteropen', version, description },
    args: argsDef,
    async run({ args }) {
      await runOpen({
        target: args.target,
        wait: args.wait,
        background: args.background,
        extension: args.extension,
        app,
        appArguments,
      })
    },
  })
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const { mainArgs, app, appArguments } = splitAtDoubleDash(argv)
  await runMain(buildCommand(app, appArguments), { rawArgs: mainArgs })
}

const isMainModule =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMainModule) {
  await main()
}
