import { promisify } from 'node:util'
import { describe, expect, it, vi } from 'vitest'

function mockExecFile(stdout: string | Error) {
  const fn = vi.fn(async () => {
    if (stdout instanceof Error) {
      throw stdout
    }

    return { stdout, stderr: '' }
  })

  // `child_process.execFile` has a custom `promisify` implementation that resolves with `{ stdout, stderr }`; mirror that so `promisify(childProcess.execFile)` behaves the same way against this mock as it does for the real function.
  Object.defineProperty(fn, promisify.custom, { value: fn, configurable: true })
  return fn
}

describe('convertWslPathToWindows', () => {
  it('passes URLs through unchanged, without shelling out', async () => {
    vi.resetModules()
    const execFile = mockExecFile('should not be used')
    vi.doMock('node:child_process', () => ({ default: { execFile } }))

    const { convertWslPathToWindows } = await import('./wsl-path')
    await expect(convertWslPathToWindows('https://example.com')).resolves.toBe(
      'https://example.com',
    )
    expect(execFile).not.toHaveBeenCalled()
  })

  it('converts a Linux path via `wslpath -aw`', async () => {
    vi.resetModules()
    const execFile = mockExecFile('C:\\Users\\me\\file.txt\n')
    vi.doMock('node:child_process', () => ({ default: { execFile } }))

    const { convertWslPathToWindows } = await import('./wsl-path')
    await expect(convertWslPathToWindows('/home/me/file.txt')).resolves.toBe(
      String.raw`C:\Users\me\file.txt`,
    )
  })

  it('falls back to the original path if `wslpath` fails', async () => {
    vi.resetModules()
    const execFile = mockExecFile(new Error('wslpath not found'))
    vi.doMock('node:child_process', () => ({ default: { execFile } }))

    const { convertWslPathToWindows } = await import('./wsl-path')
    await expect(convertWslPathToWindows('/home/me/file.txt')).resolves.toBe('/home/me/file.txt')
  })
})

describe('powerShellPathFromWsl', () => {
  it('resolves the WSL-mounted path to powershell.exe', async () => {
    vi.resetModules()
    const execFile = mockExecFile('/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe\n')
    vi.doMock('node:child_process', () => ({ default: { execFile } }))

    const { powerShellPathFromWsl } = await import('./wsl-path')
    await expect(powerShellPathFromWsl()).resolves.toBe(
      '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
    )
  })
})
