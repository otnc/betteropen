import { afterEach, describe, expect, it, vi } from 'vitest'
import { isInSsh } from './env'

describe('isInSsh', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllEnvs()
  })

  it('is false with no SSH environment variables', () => {
    vi.stubEnv('SSH_CONNECTION', '')
    vi.stubEnv('SSH_CLIENT', '')
    vi.stubEnv('SSH_TTY', '')
    expect(isInSsh()).toBe(false)
  })

  it('is true when SSH_CONNECTION is set', () => {
    vi.stubEnv('SSH_CONNECTION', '10.0.0.1 22 10.0.0.2 22')
    expect(isInSsh()).toBe(true)
  })

  it('is true when SSH_TTY is set', () => {
    vi.stubEnv('SSH_TTY', '/dev/pts/0')
    expect(isInSsh()).toBe(true)
  })
})
