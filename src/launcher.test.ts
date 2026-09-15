import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const spawn = vi.fn()
const { resolveBrowserApp } = vi.hoisted(() => ({ resolveBrowserApp: vi.fn() }))

vi.mock('node:child_process', () => ({ default: { spawn, execFile: vi.fn() } }))
vi.mock('./browsers.js', () => ({ resolveBrowserApp }))
vi.mock('./env.js', () => ({
  isWsl: () => false,
  isInsideContainer: () => false,
  isInSsh: () => false,
}))
vi.mock('./powershell.js', async () => {
  const actual = await vi.importActual<typeof import('./powershell')>('./powershell')
  return { ...actual, canAccessPowerShell: vi.fn().mockResolvedValue(false) }
})
vi.mock('./xdg-open.js', () => ({ resolveXdgOpenCommand: vi.fn().mockResolvedValue('xdg-open') }))

const { open, openApp } = await import('./launcher')

class FakeChildProcess extends EventEmitter {
  unref = vi.fn()
  off = this.removeListener
}

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
}

// `launch()` may await a few internal checks (e.g. resolving the xdg-open
// command) before it actually calls `spawn()`, so wait for that call to
// happen rather than assuming it already has by the time this returns.
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
