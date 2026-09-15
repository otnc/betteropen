import childProcess, { type ChildProcess, type SpawnOptions } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { resolveBrowserApp } from './browsers.js'
import { isInSsh, isInsideContainer, isWsl } from './env.js'
import {
  buildEncodedCommandArguments,
  canAccessPowerShell,
  escapePowerShellArgument,
  windowsPowerShellPath,
} from './powershell.js'
import type { AppTarget, OpenAppOptions, Options } from './types.js'
import { convertWslPathToWindows, powerShellPathFromWsl } from './wsl-path.js'
import { resolveXdgOpenCommand } from './xdg-open.js'

const fallbackAttemptSymbol = Symbol('fallbackAttempt')

type InternalOptions = Options & {
  target?: string
  [fallbackAttemptSymbol]?: boolean
}

async function tryEachApp(
  apps: readonly AppTarget[],
  attempt: (app: AppTarget) => Promise<ChildProcess>,
): Promise<ChildProcess> {
  if (apps.length === 0) {
    throw new Error('No app was provided')
  }

  const errors: unknown[] = []

  for (const app of apps) {
    try {
      return await attempt(app)
    } catch (error) {
      errors.push(error)
    }
  }

  throw new AggregateError(errors, 'Failed to open in all supported apps')
}

async function resolveAppTarget(app: AppTarget): Promise<AppTarget> {
  if (app.name === 'browser' || app.name === 'browserPrivate') {
    const resolved = await resolveBrowserApp(app.name)
    return { name: resolved.name, arguments: [...resolved.arguments, ...(app.arguments ?? [])] }
  }

  return app
}

async function launch(options: InternalOptions): Promise<ChildProcess> {
  const isFallbackAttempt = options[fallbackAttemptSymbol] === true

  if (Array.isArray(options.app)) {
    return tryEachApp(options.app, (app) =>
      launch({ ...options, app, [fallbackAttemptSymbol]: true }),
    )
  }

  // `options.app` can no longer be an array here — the branch above returned for that case.
  let app = options.app as AppTarget | undefined

  if (app?.name === 'browser' || app?.name === 'browserPrivate') {
    app = await resolveAppTarget(app)
  }

  // The resolved default-browser binary can itself be a list of candidate paths
  // (e.g. Chrome under WSL), so this check must run after resolving `browser`/`browserPrivate`, not just on the name the caller originally passed in.
  if (app && Array.isArray(app.name)) {
    return tryEachApp(
      app.name.map((name) => ({ name, arguments: app?.arguments })),
      (candidate) => launch({ ...options, app: candidate, [fallbackAttemptSymbol]: true }),
    )
  }

  const appName = app?.name as string | undefined
  const appArguments = [...(app?.arguments ?? [])]

  let command: string
  const cliArguments: string[] = []
  const spawnOptions: SpawnOptions = {}
  let target = options.target

  // Only use Windows integration from WSL when PowerShell is actually reachable — this keeps things working inside sandboxed WSL environments (and containers running under WSL) that can't see the Windows host at all.
  const useWindowsFromWsl =
    isWsl() && !isInsideContainer() && !isInSsh() && !appName && (await canAccessPowerShell())

  if (process.platform === 'darwin') {
    command = 'open'

    if (options.wait) cliArguments.push('--wait-apps')
    if (options.background) cliArguments.push('--background')
    if (options.newInstance) cliArguments.push('--new')
    if (appName) cliArguments.push('-a', appName)

    if (appArguments.length > 0) cliArguments.push('--args', ...appArguments)
    if (target) cliArguments.push(target)
  } else if (process.platform === 'win32' || useWindowsFromWsl) {
    command = useWindowsFromWsl ? await powerShellPathFromWsl() : windowsPowerShellPath()

    if (isWsl() && target) {
      target = await convertWslPathToWindows(target)
    }

    const encodedParts = ["$ProgressPreference = 'SilentlyContinue';", 'Start']
    if (options.wait) encodedParts.push('-Wait')

    if (appName) {
      encodedParts.push(escapePowerShellArgument(appName))
      if (target) appArguments.push(target)
    } else if (target) {
      encodedParts.push(escapePowerShellArgument(target))
    }

    if (appArguments.length > 0) {
      encodedParts.push(
        '-ArgumentList',
        appArguments.map((argument) => escapePowerShellArgument(argument)).join(','),
      )
    }

    cliArguments.push(...buildEncodedCommandArguments(encodedParts.join(' ')))

    if (!isWsl()) {
      spawnOptions.windowsVerbatimArguments = true
    }

    if (!options.wait) {
      // PowerShell would otherwise keep the parent process alive via inherited stdio.
      spawnOptions.stdio = 'ignore'
    }

    if (isWsl()) {
      // The child inherits WSL's working directory, exposed to Windows as a `\\wsl.localhost\...` UNC path the launching user may not be able to traverse. PowerShell's own directory always resolves to a plain `C:\...` path, and nothing here depends on the working directory otherwise.
      spawnOptions.cwd = path.dirname(command)
    }
  } else {
    command = appName ?? (await resolveXdgOpenCommand())
    cliArguments.push(...appArguments)
    if (target) cliArguments.push(target)

    if (!options.wait) {
      // `xdg-open` blocks the caller unless detached with stdio ignored.
      spawnOptions.stdio = 'ignore'
      spawnOptions.detached = true
    }
  }

  const subprocess = childProcess.spawn(command, cliArguments, spawnOptions)

  if (options.wait) {
    return new Promise((resolve, reject) => {
      subprocess.once('error', reject)
      subprocess.once('close', (exitCode) => {
        if (!options.allowNonzeroExitCode && exitCode !== 0) {
          reject(new Error(`Exited with code ${exitCode}`))
          return
        }

        resolve(subprocess)
      })
    })
  }

  // The PowerShell launcher must always be awaited until it closes, even when not waiting for the app: it needs time to run `Start-Process` before it's safe to let the caller's process exit, since libuv kills non-detached children when the parent exits. A fallback attempt also needs the exit code to know whether the app actually launched, before trying the next candidate.
  if (isFallbackAttempt || process.platform === 'win32' || useWindowsFromWsl) {
    return new Promise((resolve, reject) => {
      subprocess.once('error', reject)
      subprocess.once('spawn', () => {
        subprocess.once('close', (exitCode) => {
          subprocess.off('error', reject)

          if (isFallbackAttempt && exitCode !== 0) {
            reject(new Error(`Exited with code ${exitCode}`))
            return
          }

          subprocess.unref()
          resolve(subprocess)
        })
      })
    })
  }

  subprocess.unref()

  return new Promise((resolve, reject) => {
    subprocess.once('error', reject)
    subprocess.once('spawn', () => {
      subprocess.off('error', reject)
      resolve(subprocess)
    })
  })
}

export function open(target: string, options?: Options): Promise<ChildProcess> {
  if (typeof target !== 'string') {
    throw new TypeError('Expected a `target`')
  }

  return launch({ ...options, target })
}

export function openApp(name: AppTarget['name'], options?: OpenAppOptions): Promise<ChildProcess> {
  if (typeof name !== 'string' && !Array.isArray(name)) {
    throw new TypeError('Expected a valid `name`')
  }

  const { arguments: appArguments = [], ...rest } = options ?? {}

  return launch({ ...rest, app: { name, arguments: appArguments } })
}
