import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const open = vi.fn().mockResolvedValue(undefined)
const writeFile = vi.fn().mockResolvedValue(undefined)
const filetypeextension = vi.fn().mockReturnValue([])

vi.mock('./launcher.js', () => ({ open }))
vi.mock('node:fs/promises', () => ({ writeFile }))
vi.mock('magic-bytes.js', () => ({ filetypeextension }))

const { readTargetFromStdin, runOpen, main } = await import('./cli')

describe('readTargetFromStdin', () => {
  beforeEach(() => {
    writeFile.mockClear()
    filetypeextension.mockReturnValue([])
    Object.defineProperty(process, 'stdin', {
      value: Readable.from(Buffer.from('hello')),
      configurable: true,
    })
  })

  it('uses the detected extension when available', async () => {
    filetypeextension.mockReturnValue(['png'])
    const filePath = await readTargetFromStdin(undefined)
    expect(filePath.endsWith('.png')).toBe(true)
  })

  it('prefers an explicit --extension override', async () => {
    filetypeextension.mockReturnValue(['png'])
    const filePath = await readTargetFromStdin('html')
    expect(filePath.endsWith('.html')).toBe(true)
  })

  it('falls back to .txt when nothing is detected', async () => {
    const filePath = await readTargetFromStdin(undefined)
    expect(filePath.endsWith('.txt')).toBe(true)
  })
})

describe('runOpen', () => {
  const originalStdin = process.stdin

  beforeEach(() => {
    open.mockClear()
  })

  afterEach(() => {
    Object.defineProperty(process, 'stdin', { value: originalStdin, configurable: true })
  })

  it('opens the given target with the given flags', async () => {
    await runOpen({
      target: 'https://example.com',
      wait: true,
      background: false,
      appArguments: [],
    })
    expect(open).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ wait: true, background: false }),
    )
  })

  it('passes the app and its arguments through to `open`', async () => {
    await runOpen({
      target: 'https://example.com',
      wait: false,
      background: false,
      app: 'firefox',
      appArguments: ['--private-window'],
    })
    expect(open).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ app: { name: 'firefox', arguments: ['--private-window'] } }),
    )
  })

  it('reads and opens stdin when there is no target and stdin is piped', async () => {
    Object.defineProperty(process, 'stdin', {
      value: Readable.from(Buffer.from('hello')),
      configurable: true,
    })
    filetypeextension.mockReturnValue(['png'])

    await runOpen({ wait: false, background: false, appArguments: [] })

    expect(open).toHaveBeenCalledWith(expect.stringMatching(/\.png$/), expect.anything())
  })

  it('errors out with no target and a TTY stdin', async () => {
    Object.defineProperty(process, 'stdin', { value: { isTTY: true }, configurable: true })

    await runOpen({ wait: false, background: false, appArguments: [] })

    expect(process.exitCode).toBe(1)
    process.exitCode = 0
    expect(open).not.toHaveBeenCalled()
  })
})

describe('main', () => {
  beforeEach(() => {
    open.mockClear()
  })

  it('parses flags and the target through citty', async () => {
    await main(['https://example.com', '--wait'])
    expect(open).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ wait: true, background: false }),
    )
  })

  it('splits the app and its arguments off after a literal `--`', async () => {
    await main(['https://example.com', '--', 'firefox', '--private-window'])
    expect(open).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ app: { name: 'firefox', arguments: ['--private-window'] } }),
    )
  })
})
