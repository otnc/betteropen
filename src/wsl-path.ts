import childProcess from 'node:child_process'
import { promisify } from 'node:util'
import { windowsPowerShellPath } from './powershell.js'

const execFile = promisify(childProcess.execFile)

const isUrl = (value: string): boolean => /^[a-z]+:\/\//i.test(value)

async function wslpath(flag: string, values: readonly string[]): Promise<string[]> {
  const { stdout } = await execFile('wslpath', [flag, ...values], { encoding: 'utf8' })
  return stdout.split(/\r?\n/).filter(Boolean)
}

/**
 * Convert one or more WSL (Linux-side) paths to their Windows equivalent, via the `wslpath` utility that ships with WSL. URLs are passed through unchanged. Falls back to the original paths if `wslpath` is unavailable.
 */
export async function convertWslPathToWindows(target: string): Promise<string> {
  if (isUrl(target)) {
    return target
  }

  try {
    const [converted] = await wslpath('-aw', [target])
    return converted ?? target
  } catch {
    return target
  }
}

/**
 * Locate `powershell.exe` from inside WSL by asking `wslpath` to translate its well-known Windows path into the equivalent path under the current distro's drive mount point (respects a custom mount point configured in `/etc/wsl.conf`, since `wslpath` itself is aware of it).
 */
export async function powerShellPathFromWsl(): Promise<string> {
  const [converted] = await wslpath('-u', [windowsPowerShellPath()])
  if (!converted) {
    throw new Error('Could not resolve the Windows PowerShell path from WSL')
  }

  return converted
}
