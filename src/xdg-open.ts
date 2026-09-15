import { constants as fsConstants } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

function resolveLocalPath(): string | undefined {
  try {
    return path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'xdg-open')
  } catch {
    return undefined
  }
}

const localPath = resolveLocalPath()

/**
 * Resolve which `xdg-open` to spawn on Linux: the copy bundled with this package (a known, tested version, for when the system's own copy is missing or too old) when it's present and executable, or the system's `xdg-open` on PATH otherwise — under Electron, on Android, or when this package has been re-bundled by a tool that drops `import.meta.url` resolution (e.g. some webpack configurations), the bundled copy can't be relied on either way.
 */
export async function resolveXdgOpenCommand(): Promise<string> {
  if (process.versions.electron || process.platform === 'android' || !localPath) {
    return 'xdg-open'
  }

  try {
    await fs.access(localPath, fsConstants.X_OK)
    return localPath
  } catch {
    return 'xdg-open'
  }
}
