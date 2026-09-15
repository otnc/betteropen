import childProcess from 'node:child_process'
import { constants as fsConstants } from 'node:fs'
import fs from 'node:fs/promises'
import { promisify } from 'node:util'
import { windowsPowerShellPath } from './powershell.js'

const execFile = promisify(childProcess.execFile)

const isUrl = (value: string): boolean => /^[a-z]+:\/\//i.test(value)

// `node:url`'s `fileURLToPath` follows the host OS's own path conventions, which would misinterpret a WSL-side (POSIX) `file:` URL if this package were ever running on Windows itself — this decodes it the POSIX way unconditionally, since a `file:` URL reaching this function always names a path on the WSL (Linux) side.
function fileUrlToPosixPath(url: string): string {
  return decodeURIComponent(new URL(url).pathname)
}

async function wslpath(flag: string, values: readonly string[]): Promise<string[]> {
  const { stdout } = await execFile('wslpath', [flag, ...values], { encoding: 'utf8' })
  return stdout.split(/\r?\n/).filter(Boolean)
}

/**
 * Convert one or more WSL (Linux-side) paths to their Windows equivalent, via the `wslpath` utility that ships with WSL. Remote URLs (`http:`, `https:`, ...) are passed through unchanged, since any Windows app already understands those regardless of which OS they came from — but a `file:` URL names a local path just as much as a bare one does, so it gets converted too. Falls back to the original value if `wslpath` is unavailable.
 */
export async function convertWslPathToWindows(target: string): Promise<string> {
  let localPath = target

  if (target.startsWith('file://')) {
    try {
      localPath = fileUrlToPosixPath(target)
    } catch {
      return target
    }
  } else if (isUrl(target)) {
    return target
  }

  try {
    const [converted] = await wslpath('-aw', [localPath])
    return converted ?? target
  } catch {
    return target
  }
}

let powerShellPathPromise: Promise<string> | undefined

/**
 * Locate `powershell.exe` from inside WSL by asking `wslpath` to translate its well-known Windows path into the equivalent path under the current distro's drive mount point (respects a custom mount point configured in `/etc/wsl.conf`, since `wslpath` itself is aware of it). The mount point can't change during the process's lifetime, so the result is cached.
 */
export function powerShellPathFromWsl(): Promise<string> {
  powerShellPathPromise ??= (async () => {
    const [converted] = await wslpath('-u', [windowsPowerShellPath()])
    if (!converted) {
      throw new Error('Could not resolve the Windows PowerShell path from WSL')
    }

    return converted
  })()

  return powerShellPathPromise
}

let canAccessFromWslCache: Promise<boolean> | undefined

/**
 * Whether PowerShell is actually reachable from inside WSL, checked against the WSL-mounted path (not the Windows-style path, which `fs.access` can never resolve from a POSIX filesystem).
 */
export function canAccessPowerShellFromWsl(): Promise<boolean> {
  canAccessFromWslCache ??= (async () => {
    try {
      const psPath = await powerShellPathFromWsl()
      await fs.access(psPath, fsConstants.X_OK)
      return true
    } catch {
      return false
    }
  })()

  return canAccessFromWslCache
}
