#!/usr/bin/env node
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import * as streamConsumers from 'node:stream/consumers'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { filetypeextension } from 'magic-bytes.js'
import { open } from './launcher.js'

// `dist/cli.js` and `src/cli.ts` are both one level below the package root, so this resolves correctly whether running the built CLI or this source file directly.
const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as {
  version: string
}

const usage = `Usage
  betteropen <file|url> [--wait] [--background] [-- <app> [args]]
  cat <file> | betteropen [--extension <ext>] [--wait] [--background] [-- <app> [args]]

Options
  --wait         Wait for the app to exit
  --background   Do not bring the app to the foreground (macOS only)
  --extension    File extension to use when stdin's type can't be detected
  --version      Print the version number
  --help         Print this help message

Examples
  betteropen https://example.com
  betteropen https://example.com -- firefox
  betteropen unicorn.png
  cat unicorn.png | betteropen
  echo '<h1>hi</h1>' | betteropen --extension=html`

export function splitAppArguments(argv: string[]): {
  mainArgs: string[]
  app?: string
  appArguments: string[]
} {
  const separatorIndex = argv.indexOf('--')
  if (separatorIndex === -1) {
    return { mainArgs: argv, appArguments: [] }
  }

  const [app, ...appArguments] = argv.slice(separatorIndex + 1)
  return { mainArgs: argv.slice(0, separatorIndex), app, appArguments }
}

export async function readTargetFromStdin(extensionOverride?: string): Promise<string> {
  const buffer = await streamConsumers.buffer(process.stdin)
  const [detected] = filetypeextension(buffer)
  const extension = extensionOverride ?? detected ?? 'txt'

  const filePath = join(tmpdir(), `betteropen-${randomUUID()}.${extension}`)
  await writeFile(filePath, buffer)
  return filePath
}

export async function main(): Promise<void> {
  const { mainArgs, app, appArguments } = splitAppArguments(process.argv.slice(2))

  const { values, positionals } = parseArgs({
    args: mainArgs,
    allowPositionals: true,
    options: {
      wait: { type: 'boolean', default: false },
      background: { type: 'boolean', default: false },
      extension: { type: 'string' },
      version: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  })

  if (values.version) {
    console.log(version)
    return
  }

  if (values.help) {
    console.log(usage)
    return
  }

  const [target] = positionals

  const options = {
    wait: values.wait,
    background: values.background,
    ...(app ? { app: { name: app, arguments: appArguments } } : {}),
  }

  if (target) {
    await open(target, options)
    return
  }

  if (process.stdin.isTTY) {
    console.error('Specify a file path or URL.\n')
    console.error(usage)
    process.exitCode = 1
    return
  }

  const filePath = await readTargetFromStdin(values.extension)
  await open(filePath, options)
}

const isMainModule =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMainModule) {
  await main()
}
