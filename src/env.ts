import fs from 'node:fs'
import os from 'node:os'
import process from 'node:process'

function readSafe(path: string): string | undefined {
  try {
    return fs.readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}

function existsSafe(path: string): boolean {
  try {
    fs.statSync(path)
    return true
  } catch {
    return false
  }
}

/** True when running inside a Docker container. */
export function isDocker(): boolean {
  if (existsSafe('/.dockerenv')) {
    return true
  }

  const cgroup = readSafe('/proc/self/cgroup')
  return cgroup?.includes('docker') ?? false
}

let insideContainerCache: boolean | undefined

/** True when running inside any kind of container (Docker or Podman). */
export function isInsideContainer(): boolean {
  insideContainerCache ??= existsSafe('/run/.containerenv') || isDocker()
  return insideContainerCache
}

/** True when connected over SSH. */
export function isInSsh(): boolean {
  return Boolean(process.env.SSH_CONNECTION || process.env.SSH_CLIENT || process.env.SSH_TTY)
}

let wslCache: boolean | undefined

/**
 * True when running under WSL (Windows Subsystem for Linux), as opposed to a container running inside WSL, which reports the same kernel signature but shouldn't be treated as having access to the Windows host.
 */
export function isWsl(): boolean {
  if (wslCache !== undefined) {
    return wslCache
  }

  if (process.platform !== 'linux' || isInsideContainer()) {
    wslCache = false
    return wslCache
  }

  const release = os.release().toLowerCase()
  const version = readSafe('/proc/version')?.toLowerCase()

  wslCache =
    release.includes('microsoft') ||
    Boolean(version?.includes('microsoft')) ||
    existsSafe('/proc/sys/fs/binfmt_misc/WSLInterop') ||
    existsSafe('/run/WSL')

  return wslCache
}
