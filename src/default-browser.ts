import childProcess from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { isWsl } from './env.js'
import { executePowerShell } from './powershell.js'
import { powerShellPathFromWsl } from './wsl-path.js'

const execFile = promisify(childProcess.execFile)

async function macDefaultBrowserId(): Promise<string> {
  const { stdout } = await execFile('defaults', [
    'read',
    'com.apple.LaunchServices/com.apple.launchservices.secure',
    'LSHandlers',
  ])

  // Each handler block pairs a role (the app) with the URL scheme it's registered for; find the one for http(s). `(?!-)` skips placeholder entries whose role is literally `"-"` (no app registered).
  const match =
    /LSHandlerRoleAll = "(?!-)(?<id>[^"]+?)";\s+?LSHandlerURLScheme = (?:http|https);/.exec(stdout)

  return match?.groups?.id ?? 'com.apple.safari'
}

function parseWindowsProgId(regQueryOutput: string): string {
  const match = /ProgId\s+REG_SZ\s+(?<id>\S+)/.exec(regQueryOutput)
  if (!match?.groups) {
    throw new Error('Could not read the default browser from the Windows registry')
  }

  return match.groups.id
}

async function windowsDefaultBrowserId(): Promise<string> {
  const regPath = `${process.env.SYSTEMROOT ?? process.env.windir ?? String.raw`C:\Windows`}\\System32\\reg.exe`
  const { stdout } = await execFile(regPath, [
    'QUERY',
    String.raw`HKEY_CURRENT_USER\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice`,
    '/v',
    'ProgId',
  ])

  return parseWindowsProgId(stdout)
}

async function wslDefaultBrowserId(): Promise<string> {
  const powerShellPath = await powerShellPathFromWsl()
  const command = String.raw`(Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice").ProgId`

  // PowerShell inherits the WSL working directory, which is exposed to Windows as a `\\wsl.localhost\...` UNC path that the launching user may not be able to traverse. Running from PowerShell's own directory avoids that entirely.
  const { stdout } = await executePowerShell(command, {
    powerShellPath,
    cwd: path.dirname(powerShellPath),
  })

  return stdout.trim()
}

async function linuxDefaultBrowserId(): Promise<string> {
  const { stdout } = await execFile('xdg-mime', ['query', 'default', 'x-scheme-handler/http'])
  return stdout.trim()
}

/**
 * Get a raw identifier for the user's default browser: a macOS bundle id, a Linux `.desktop` file name, or a Windows ProgId (which may carry a hash suffix, e.g. `FirefoxURL-6F193CCC56814779`). The exact format is platform-dependent — see `browsers.ts` for how it gets resolved to a browser name.
 */
export async function defaultBrowserId(): Promise<string> {
  if (process.platform === 'darwin') {
    return macDefaultBrowserId()
  }

  if (process.platform === 'win32') {
    return windowsDefaultBrowserId()
  }

  if (isWsl()) {
    return wslDefaultBrowserId()
  }

  if (process.platform === 'linux') {
    return linuxDefaultBrowserId()
  }

  throw new Error(`${process.platform} is not supported`)
}
