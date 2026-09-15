# betteropen

> Better and more convenient "open"

[![npm](https://img.shields.io/npm/v/betteropen)](https://www.npmjs.com/package/betteropen)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/otnc/betteropen/ci.yml?branch=main)](https://github.com/otnc/betteropen/actions)
[![GitHub](https://img.shields.io/github/license/otnc/betteropen)](https://github.com/otnc/betteropen/blob/main/LICENSE)
[![Node](https://img.shields.io/node/v/betteropen)](https://www.npmjs.com/package/betteropen)

Open URLs, files, and executables in their default (or a chosen) app, from Node.js or the command line — macOS, Windows, Linux, and WSL, as a single package with both a library and a bundled CLI.

## Install

```sh
npm install betteropen
```

For just the CLI:

```sh
npm install --global betteropen
```

## Usage

### As a library

```ts
import open, { openApp, apps } from 'betteropen'

// Opens the URL in the default browser.
await open('https://example.com')

// Opens a file in its default app, waiting for that app to exit.
await open('./document.pdf', { wait: true })

// Opens the URL in a specific app.
await open('https://example.com', { app: { name: 'firefox' } })

// Opens the default browser in private/incognito mode.
await open('https://example.com', { app: { name: apps.browserPrivate } })

// Launches an app directly, without a target.
await openApp(apps.chrome, { arguments: ['--incognito'] })
```

`open(target, options?)` and `openApp(name, options?)` both resolve to the spawned [`ChildProcess`](https://nodejs.org/api/child_process.html#class-childprocess). `options` accepts `wait`, `background` (macOS), `newInstance` (macOS), `app`/`arguments`, and `allowNonzeroExitCode` — see the type definitions shipped with the package for the full reference.

`apps` gives you the platform-correct binary name for a handful of well-known browsers (lazily resolved, so nothing is spawned until you actually read a property):

```ts
apps.chrome
apps.brave
apps.firefox
apps.edge
apps.safari
apps.opera
apps.vivaldi
apps.chromium
apps.browser // the OS default browser
apps.browserPrivate // the OS default browser, in private/incognito mode
```

### As a CLI

Installed as both `betteropen` and `open`:

```sh
betteropen https://example.com
betteropen https://example.com -- firefox
betteropen document.pdf --wait
cat image.png | betteropen
echo '<h1>hi</h1>' | betteropen --extension=html
```

Run `betteropen --help` for the full flag list.

> [!NOTE]
> Installing this package globally may conflict with any other package that also provides an `open` command.

## How it compares

A feature comparison against the two packages most people reach for today for this job — one library, one separate CLI wrapping it. All three cover the same ground on the basics (macOS/Windows/Linux/WSL, default browser resolution, private/incognito mode, `wait`/`background`/`newInstance`), so the table below focuses on where they actually differ:

| | betteropen | open | open-cli |
| --- | --- | --- | --- |
| Node.js | >= 20 | >= 20 | >= 22 |
| Library and CLI | both, one package | library only | CLI only, depends on `open` |
| Module format | ESM + CJS | ESM only | ESM only (bin script) |
| Runtime dependencies | 2 (CLI only) | 6 | 4, including `open` itself |
| Browser shortcuts | Chrome, Brave, Firefox, Edge, Safari, Opera, Vivaldi, Chromium | Chrome, Brave, Firefox, Edge, Safari | — |
| Recognizes beta/dev/nightly/ESR browser channels as their base browser | ✅ | — | — |
| CLI command name(s) | `betteropen`, `open` | — | `open-cli` |

## Requirements

- Node.js >= 20
- On Linux, a graphical desktop environment — the bundled `xdg-open` script needs one of the usual desktop tools (`gio`, `gvfs-open`, `kde-open`, `exo-open`, ...) to actually hand off to an app.

## Features

- Opens URLs, files, and executables in the platform default app, or a specific one you choose.
- Works on macOS, Windows, Linux, and WSL (including launching Windows apps from WSL via PowerShell).
- Resolves the default browser, with built-in support for opening it in private/incognito mode, and recognizes it even on less common release channels (beta, dev, nightly, ESR, developer edition, ...).
- Includes shortcuts for Chrome, Brave, Firefox, Edge, Safari, Opera, Vivaldi, and Chromium out of the box.
- Ships a CLI in the same package, installed as both `betteropen` and `open` — no separate install needed.
- Bundles a known-good `xdg-open` for Linux, falling back to the system's own copy when present.
- Minimal footprint: OS integration has no dependencies of its own — the library itself pulls in nothing, and only the CLI adds two small dependencies (flag parsing and stdin type detection).

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

## License

Distributed under the [MIT License](./LICENSE).
