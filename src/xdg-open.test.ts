import { afterEach, describe, expect, it, vi } from 'vitest'

const access = vi.fn()

vi.mock('node:fs/promises', () => ({ default: { access } }))

const { resolveXdgOpenCommand } = await import('./xdg-open')

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
}

const originalPlatform = process.platform
const originalElectron = process.versions.electron

describe('resolveXdgOpenCommand', () => {
  afterEach(() => {
    access.mockReset()
    setPlatform(originalPlatform)
    Object.defineProperty(process.versions, 'electron', {
      value: originalElectron,
      configurable: true,
    })
  })

  it('uses the bundled script when it is present and executable', async () => {
    setPlatform('linux')
    access.mockResolvedValue(undefined)

    const command = await resolveXdgOpenCommand()
    expect(command.endsWith('xdg-open')).toBe(true)
    expect(command).not.toBe('xdg-open')
  })

  it('falls back to the system command when the bundled script is missing', async () => {
    setPlatform('linux')
    access.mockRejectedValue(new Error('ENOENT'))

    await expect(resolveXdgOpenCommand()).resolves.toBe('xdg-open')
  })

  it('falls back to the system command on Android', async () => {
    setPlatform('android')
    access.mockResolvedValue(undefined)

    await expect(resolveXdgOpenCommand()).resolves.toBe('xdg-open')
    expect(access).not.toHaveBeenCalled()
  })

  it('falls back to the system command under Electron', async () => {
    setPlatform('linux')
    Object.defineProperty(process.versions, 'electron', { value: '30.0.0', configurable: true })
    access.mockResolvedValue(undefined)

    await expect(resolveXdgOpenCommand()).resolves.toBe('xdg-open')
    expect(access).not.toHaveBeenCalled()
  })
})
