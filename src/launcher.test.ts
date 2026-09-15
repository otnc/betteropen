import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const spawn = vi.fn()
const { resolveBrowserApp, isWsl, convertWslPathToWindows } = vi.hoisted(() => ({
  resolveBrowserApp: vi.fn(),
  isWsl: vi.fn().mockReturnValue(false),
  convertWslPathToWindows: vi.fn(async (target: string) => target),
}))

vi.mock('node:child_process', () => ({ default: { spawn, execFile: vi.fn() } }))
vi.mock('./browsers.js', () => ({ resolveBrowserApp }))
vi.mock('./env.js', () => ({
  isWsl,
  isInsideContainer: () => false,
  isInSsh: () => false,
}))
vi.mock('./xdg-open.js', () => ({ resolveXdgOpenCommand: vi.fn().mockResolvedValue('xdg-open') }))
vi.mock('./wsl-path.js', async () => {
  const actual = await vi.importActual<typeof import('./wsl-path')>('./wsl-path')
  return {
    ...actual,
    canAccessPowerShellFromWsl: vi.fn().mockResolvedValue(false),
    convertWslPathToWindows,
  }
})

const { open, openApp } = await import('./launcher')

class FakeChildProcess extends EventEmitter {
  unref = vi.fn()
  off = this.removeListener
}

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
}

// `launch()` may await a few internal checks (e.g. resolving the xdg-open command) before it actually calls `spawn()`, so wait for that call to happen rather than assuming it already has by the time this returns.
async function waitForSpawn(): Promise<void> {
  await vi.waitFor(() => {
    if (spawn.mock.calls.length === 0) {
      throw new Error('spawn has not been called yet')
    }
  })
}

describe('launch', () => {
  const originalPlatform = process.platform
  let child: FakeChildProcess

  beforeEach(() => {
    child = new FakeChildProcess()
    spawn.mockReset()
    spawn.mockReturnValue(child)
    resolveBrowserApp.mockReset()
    isWsl.mockReturnValue(false)
    convertWslPathToWindows.mockClear()
    convertWslPathToWindows.mockImplementation(async (target: string) => target)
  })

  afterEach(() => {
    setPlatform(originalPlatform)
  })

  it('builds the macOS `open` command with wait/background/newInstance flags', async () => {
    setPlatform('darwin')
    const promise = open('https://example.com', {
      wait: false,
      background: true,
      newInstance: true,
    })
    await waitForSpawn()
    child.emit('spawn')

    await promise

    expect(spawn).toHaveBeenCalledWith(
      'open',
      ['--background', '--new', 'https://example.com'],
      expect.anything(),
    )
  })

  it('spawns the given app directly on Linux', async () => {
    setPlatform('linux')
    const promise = openApp('firefox', { arguments: ['--private-window'] })
    await waitForSpawn()
    child.emit('spawn')

    await promise

    expect(spawn).toHaveBeenCalledWith(
      'firefox',
      ['--private-window'],
      expect.objectContaining({ detached: true }),
    )
  })

  it('converts the target to a Windows path when spawning a WSL-mounted .exe directly', async () => {
    setPlatform('linux')
    isWsl.mockReturnValue(true)
    convertWslPathToWindows.mockResolvedValue(String.raw`C:\Users\me\report.html`)

    const promise = open('/home/me/report.html', {
      app: { name: '/mnt/c/Program Files/Mozilla Firefox/firefox.exe' },
    })
    await waitForSpawn()
    child.emit('spawn')

    await promise

    expect(convertWslPathToWindows).toHaveBeenCalledWith('/home/me/report.html')
    expect(spawn).toHaveBeenCalledWith(
      '/mnt/c/Program Files/Mozilla Firefox/firefox.exe',
      [String.raw`C:\Users\me\report.html`],
      expect.anything(),
    )
  })

  it('falls back to xdg-open on Linux when no app is given', async () => {
    setPlatform('linux')
    const promise = open('https://example.com')
    await waitForSpawn()
    child.emit('spawn')

    await promise

    expect(spawn).toHaveBeenCalledWith('xdg-open', ['https://example.com'], expect.anything())
  })

  it('rejects on a nonzero exit code when waiting', async () => {
    setPlatform('linux')
    const promise = open('https://example.com', { wait: true })
    await waitForSpawn()
    child.emit('close', 1)

    await expect(promise).rejects.toThrow(/Exited with code 1/)
  })

  it('resolves on a nonzero exit code when waiting with allowNonzeroExitCode', async () => {
    setPlatform('linux')
    const promise = open('https://example.com', { wait: true, allowNonzeroExitCode: true })
    await waitForSpawn()
    child.emit('close', 1)

    await expect(promise).resolves.toBe(child)
  })

  it('does not hang waiting for a directly-spawned Linux app to exit when trying candidates', async () => {
    setPlatform('linux')
    // Simulates a real browser binary that, once launched, never closes on its own — as opposed to a launcher script that hands off and exits quickly.
    const promise = openApp(['google-chrome', 'chromium'])
    await waitForSpawn()
    child.emit('spawn')

    await expect(promise).resolves.toBe(child)
    expect(spawn).toHaveBeenCalledTimes(1)
  })

  it('fans out over multiple candidate paths returned for a resolved default browser', async () => {
    setPlatform('linux')
    resolveBrowserApp.mockResolvedValue({
      name: ['/mnt/c/no/such/chrome.exe', '/mnt/c/other/chrome.exe'],
      arguments: [],
    })

    let call = 0
    spawn.mockImplementation(() => {
      const c = new FakeChildProcess()
      const thisCall = call++
      queueMicrotask(() => {
        c.emit('spawn')
        queueMicrotask(() => c.emit('close', thisCall === 1 ? 0 : 1))
      })
      return c
    })

    await expect(open('https://example.com', { app: { name: 'browser' } })).resolves.toBeInstanceOf(
      FakeChildProcess,
    )
    expect(spawn).toHaveBeenNthCalledWith(
      1,
      '/mnt/c/no/such/chrome.exe',
      expect.anything(),
      expect.anything(),
    )
    expect(spawn).toHaveBeenNthCalledWith(
      2,
      '/mnt/c/other/chrome.exe',
      expect.anything(),
      expect.anything(),
    )
  })

  it('tries each app in order and throws AggregateError if all fail', async () => {
    setPlatform('linux')

    let call = 0
    spawn.mockImplementation(() => {
      const c = new FakeChildProcess()
      const thisCall = call++
      queueMicrotask(() => {
        c.emit('spawn')
        // Fallback attempts must observe a nonzero exit to be considered failed.
        queueMicrotask(() => c.emit('close', thisCall === 1 ? 0 : 1))
      })
      return c
    })

    const promise = openApp(['no-such-app-1', 'no-such-app-2'])
    await expect(promise).resolves.toBeInstanceOf(FakeChildProcess)
    expect(spawn).toHaveBeenCalledTimes(2)
  })

  it('throws AggregateError when every candidate app fails', async () => {
    setPlatform('linux')

    spawn.mockImplementation(() => {
      const c = new FakeChildProcess()
      queueMicrotask(() => {
        c.emit('spawn')
        queueMicrotask(() => c.emit('close', 1))
      })
      return c
    })

    const promise = openApp(['no-such-app-1', 'no-such-app-2'])
    await expect(promise).rejects.toBeInstanceOf(AggregateError)
  })
})
