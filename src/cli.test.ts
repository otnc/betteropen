import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const open = vi.fn().mockResolvedValue(undefined)
const writeFile = vi.fn().mockResolvedValue(undefined)
const filetypeextension = vi.fn().mockReturnValue([])

vi.mock('./launcher.js', () => ({ open }))
vi.mock('node:fs/promises', () => ({ writeFile }))
vi.mock('magic-bytes.js', () => ({ filetypeextension }))

const { splitAppArguments, readTargetFromStdin, main } = await import('./cli')

describe('splitAppArguments', () => {
  it('returns everything as mainArgs when there is no `--`', () => {
    expect(splitAppArguments(['file.txt', '--wait'])).toEqual({
      mainArgs: ['file.txt', '--wait'],
      appArguments: [],
    })
  })

  it('splits the app name and its arguments after `--`', () => {
    expect(splitAppArguments(['file.txt', '--', 'firefox', '--private-window'])).toEqual({
      mainArgs: ['file.txt'],
      app: 'firefox',
      appArguments: ['--private-window'],
    })
  })
})

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

describe('main', () => {
  const originalArgv = process.argv
  const originalStdin = process.stdin

  beforeEach(() => {
    open.mockClear()
  })

  afterEach(() => {
    process.argv = originalArgv
    Object.defineProperty(process, 'stdin', { value: originalStdin, configurable: true })
  })

  it('opens the given target with the parsed flags', async () => {
    process.argv = ['node', 'cli.js', 'https://example.com', '--wait']
    await main()
    expect(open).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ wait: true, background: false }),
    )
  })

  it('passes the app and its arguments after `--`', async () => {
    process.argv = ['node', 'cli.js', 'https://example.com', '--', 'firefox', '--private-window']
    await main()
    expect(open).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ app: { name: 'firefox', arguments: ['--private-window'] } }),
    )
  })

  it('errors out with no target and a TTY stdin', async () => {
    process.argv = ['node', 'cli.js']
    Object.defineProperty(process, 'stdin', { value: { isTTY: true }, configurable: true })

    await main()
    expect(process.exitCode).toBe(1)
    process.exitCode = 0
    expect(open).not.toHaveBeenCalled()
  })
})
