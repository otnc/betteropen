import { defineConfig } from 'tsup'

// Node >= 20 supports ES2023.
const target = 'node20'

// tsup runs every entry in this array concurrently and each `clean: true` wipes
// the *entire* shared `dist/` (not just that entry's own files), so cleaning
// here would race between the two builds and could delete whichever one
// finishes first. `dist/` is cleaned once up front instead, via the `clean`
// npm script that `build` runs before this file is even loaded.
export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: false,
    target,
    platform: 'node',
    outExtension: ({ format }) => ({
      js: format === 'cjs' ? '.cjs' : '.mjs',
    }),
  },
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    dts: false,
    clean: false,
    target,
    platform: 'node',
  },
])
