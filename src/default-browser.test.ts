import { promisify } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'

function mockExecFile(stdout: string) {
  const fn = vi.fn(async () => ({ stdout, stderr: '' }))
  // See the matching comment in wsl-path.test.ts: mirrors execFile's custom `promisify` implementation so `promisify(childProcess.execFile)` resolves with `{ stdout, stderr }` against this mock, same as the real function.
  Object.defineProperty(fn, promisify.custom, { value: fn, configurable: true })
  return fn
}

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
}

const originalPlatform = process.platform

describe('defaultBrowserId', () => {
  afterEach(() => setPlatform(originalPlatform))

  it('parses the macOS LSHandlers output for the http role', async () => {
    vi.resetModules()
    setPlatform('darwin')
    const macOutput = `(
    {
        LSHandlerRoleAll = "com.google.chrome";
        LSHandlerURLScheme = http;
    }
)`
    vi.doMock('node:child_process', () => ({ default: { execFile: mockExecFile(macOutput) } }))
    vi.doMock('./env.js', () => ({ isWsl: () => false }))

    const { defaultBrowserId } = await import('./default-browser')
    await expect(defaultBrowserId()).resolves.toBe('com.google.chrome')
  })

  it('parses the Windows reg.exe QUERY output for ProgId', async () => {
    vi.resetModules()
    setPlatform('win32')
    const regOutput = String.raw`
HKEY_CURRENT_USER\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice
    ProgId    REG_SZ    FirefoxURL-6F193CCC56814779
`
    vi.doMock('node:child_process', () => ({ default: { execFile: mockExecFile(regOutput) } }))
    vi.doMock('./env.js', () => ({ isWsl: () => false }))

    const { defaultBrowserId } = await import('./default-browser')
    await expect(defaultBrowserId()).resolves.toBe('FirefoxURL-6F193CCC56814779')
  })

  it('trims the Linux xdg-mime output', async () => {
    vi.resetModules()
    setPlatform('linux')
    vi.doMock('node:child_process', () => ({
      default: { execFile: mockExecFile('firefox.desktop\n') },
    }))
    vi.doMock('./env.js', () => ({ isWsl: () => false }))

    const { defaultBrowserId } = await import('./default-browser')
    await expect(defaultBrowserId()).resolves.toBe('firefox.desktop')
  })

  it('caches the result instead of re-detecting on every call', async () => {
    vi.resetModules()
    setPlatform('linux')
    const execFile = mockExecFile('firefox.desktop\n')
    vi.doMock('node:child_process', () => ({ default: { execFile } }))
    vi.doMock('./env.js', () => ({ isWsl: () => false }))

    const { defaultBrowserId } = await import('./default-browser')
    await defaultBrowserId()
    await defaultBrowserId()

    expect(execFile).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failed detection', async () => {
    vi.resetModules()
    setPlatform('linux')
    const execFile = vi.fn().mockRejectedValue(new Error('xdg-mime not found'))
    Object.defineProperty(execFile, promisify.custom, { value: execFile, configurable: true })
    vi.doMock('node:child_process', () => ({ default: { execFile } }))
    vi.doMock('./env.js', () => ({ isWsl: () => false }))

    const { defaultBrowserId } = await import('./default-browser')
    await expect(defaultBrowserId()).rejects.toThrow()
    await expect(defaultBrowserId()).rejects.toThrow()

    expect(execFile).toHaveBeenCalledTimes(2)
  })
})
