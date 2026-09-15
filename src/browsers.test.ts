import { beforeEach, describe, expect, it, vi } from 'vitest'

const { defaultBrowserId } = vi.hoisted(() => ({ defaultBrowserId: vi.fn() }))

vi.mock('./default-browser.js', () => ({ defaultBrowserId }))
vi.mock('./env.js', () => ({ isWsl: () => false }))

const { resolveBrowserApp } = await import('./browsers')

describe('resolveBrowserApp', () => {
  beforeEach(() => {
    defaultBrowserId.mockReset()
  })

  it('resolves a known macOS bundle id to its app name', async () => {
    defaultBrowserId.mockResolvedValue('com.google.chrome')
    const result = await resolveBrowserApp('browser')
    expect(result.name).toBeDefined()
    expect(result.arguments).toEqual([])
  })

  it('resolves a known Linux .desktop id', async () => {
    defaultBrowserId.mockResolvedValue('firefox.desktop')
    const result = await resolveBrowserApp('browser')
    expect(result.name).toBeDefined()
  })

  it('strips a Windows ProgId hash suffix before matching', async () => {
    defaultBrowserId.mockResolvedValue('FirefoxURL-6F193CCC56814779')
    const result = await resolveBrowserApp('browser')
    expect(result.name).toBeDefined()
  })

  it('adds the private-mode flag for browsers that support it', async () => {
    defaultBrowserId.mockResolvedValue('com.google.chrome')
    const result = await resolveBrowserApp('browserPrivate')
    expect(result.arguments).toContain('--incognito')
  })

  it('resolves a lesser-used release channel to its browser family', async () => {
    defaultBrowserId.mockResolvedValue('org.mozilla.firefoxdeveloperedition')
    const result = await resolveBrowserApp('browserPrivate')
    expect(result.arguments).toContain('--private-window')
  })

  it.each([
    ['com.operasoftware.opera', '--private'],
    ['com.vivaldi.vivaldi', '--incognito'],
    ['org.chromium.chromium', '--incognito'],
    ['com.brave.browser.dev', '--incognito'],
    ['BraveDHTML', '--incognito'],
    ['BraveSSHTM', '--incognito'],
  ])('resolves %s with its private-mode flag', async (id, flag) => {
    defaultBrowserId.mockResolvedValue(id)
    const result = await resolveBrowserApp('browserPrivate')
    expect(result.arguments).toContain(flag)
  })

  it('rejects private mode for a browser without a CLI flag (Safari)', async () => {
    defaultBrowserId.mockResolvedValue('com.apple.safari')
    await expect(resolveBrowserApp('browserPrivate')).rejects.toThrow(/private mode/)
  })

  it('rejects an unknown default browser id', async () => {
    defaultBrowserId.mockResolvedValue('some.unknown.browser')
    await expect(resolveBrowserApp('browser')).rejects.toThrow(/not supported/)
  })

  it('is not fooled by prototype-polluting-shaped ids', async () => {
    for (const id of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
      defaultBrowserId.mockResolvedValue(id)
      await expect(resolveBrowserApp('browser')).rejects.toThrow(/not supported/)
    }
  })
})
