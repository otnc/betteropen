/**
 * Define a property whose value is computed on first access and then cached, so the (potentially expensive, e.g. spawning a process) `resolve` callback only ever runs once, and never runs at all if the property is never read.
 */
export function defineLazyProperty<T extends object, K extends PropertyKey>(
  target: T,
  key: K,
  resolve: () => unknown,
): T {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    get() {
      const value = resolve()
      Object.defineProperty(target, key, { value, enumerable: true, writable: true })
      return value
    },
    set(value) {
      Object.defineProperty(target, key, { value, enumerable: true, writable: true })
    },
  })

  return target
}
