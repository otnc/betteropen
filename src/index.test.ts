import { describe, expect, it } from 'vitest'
import open, { apps, openApp } from './index'

describe('public API', () => {
  it('exposes open, openApp, and apps', () => {
    expect(typeof open).toBe('function')
    expect(typeof openApp).toBe('function')
    expect(typeof apps).toBe('object')
  })

  it('throws on a non-string target', () => {
    // @ts-expect-error intentionally wrong type
    expect(() => open(123)).toThrow(TypeError)
  })

  it('throws on an invalid app name', () => {
    // @ts-expect-error intentionally wrong type
    expect(() => openApp(123)).toThrow(TypeError)
  })
})
