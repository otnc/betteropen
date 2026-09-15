import { Buffer } from 'node:buffer'
import childProcess, { type ExecFileOptions } from 'node:child_process'
import fs, { constants as fsConstants } from 'node:fs/promises'
import process from 'node:process'
import { promisify } from 'node:util'

const execFile = promisify(childProcess.execFile)

/** Windows PowerShell is always installed at this fixed, well-known path. */
export function windowsPowerShellPath(): string {
  const systemRoot = process.env.SYSTEMROOT || process.env.windir || String.raw`C:\Windows`
  return `${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
}

let canAccessCache: Promise<boolean> | undefined

/** Whether the PowerShell executable at {@link windowsPowerShellPath} can be run. */
export function canAccessPowerShell(): Promise<boolean> {
  canAccessCache ??= fs
    .access(windowsPowerShellPath(), fsConstants.X_OK)
    .then(() => true)
    .catch(() => false)

  return canAccessCache
}

const argumentsPrefix = [
  '-NoProfile',
  '-NonInteractive',
  '-ExecutionPolicy',
  'Bypass',
  '-EncodedCommand',
]

/** Base64-encode a command in the UTF-16LE form PowerShell's `-EncodedCommand` expects. */
export function encodeCommand(command: string): string {
  return Buffer.from(command, 'utf16le').toString('base64')
}

/**
 * Wrap a value as a single-quoted PowerShell string literal.
 *
 * PowerShell's tokenizer treats the typographic quotes U+2018, U+2019, U+201A and U+201B as string delimiters exactly like the ASCII apostrophe, and doesn't require the closing quote to match the opening one. Escaping only the ASCII quote would let any of the others terminate the string early and inject a statement, so all of them get doubled.
 */
export function escapePowerShellArgument(value: string): string {
  return `'${value.replaceAll(/['\u2018\u2019\u201a\u201b]/g, (match) => match + match)}'`
}

/** Build the full `powershell.exe` argv for running `command` via `-EncodedCommand`. */
export function buildEncodedCommandArguments(command: string): string[] {
  return [...argumentsPrefix, encodeCommand(command)]
}

export type ExecutePowerShellOptions = ExecFileOptions & {
  readonly powerShellPath?: string
}

/** Run a PowerShell command via a Base64-encoded `-EncodedCommand`. */
export async function executePowerShell(
  command: string,
  options: ExecutePowerShellOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  const { powerShellPath, ...execFileOptions } = options

  const result = await execFile(
    powerShellPath ?? windowsPowerShellPath(),
    buildEncodedCommandArguments(command),
    {
      encoding: 'utf8',
      ...execFileOptions,
      shell: false,
    },
  )

  return { stdout: String(result.stdout), stderr: String(result.stderr) }
}
