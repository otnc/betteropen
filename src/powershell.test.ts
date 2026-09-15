import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import {
  buildEncodedCommandArguments,
  encodeCommand,
  escapePowerShellArgument,
  windowsPowerShellPath,
} from './powershell'

describe('windowsPowerShellPath', () => {
  it('points at the well-known WindowsPowerShell v1.0 executable', () => {
    expect(windowsPowerShellPath()).toMatch(
      /\\System32\\WindowsPowerShell\\v1\.0\\powershell\.exe$/,
    )
  })
})

describe('encodeCommand', () => {
  it('base64-encodes the command as UTF-16LE', () => {
    const encoded = encodeCommand('echo hi')
    expect(Buffer.from(encoded, 'base64').toString('utf16le')).toBe('echo hi')
  })
})

describe('escapePowerShellArgument', () => {
  it('wraps the value in single quotes', () => {
    expect(escapePowerShellArgument('hello')).toBe("'hello'")
  })

  it('doubles an embedded ASCII apostrophe', () => {
    expect(escapePowerShellArgument("it's")).toBe("'it''s'")
  })

  it('doubles the typographic quote variants that PowerShell also treats as delimiters', () => {
    expect(escapePowerShellArgument('‘’‚‛')).toBe("'‘‘’’‚‚‛‛'")
  })
})

describe('buildEncodedCommandArguments', () => {
  it('includes the safety flags ahead of the encoded command', () => {
    const args = buildEncodedCommandArguments('Get-Process')
    expect(args.slice(0, -1)).toEqual([
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
    ])
    expect(Buffer.from(args.at(-1) as string, 'base64').toString('utf16le')).toBe('Get-Process')
  })
})
