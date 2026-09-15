import process from 'node:process'
import { defaultBrowserId } from './default-browser.js'
import { isWsl } from './env.js'
import { defineLazyProperty } from './lazy.js'
import type { AppName } from './types.js'

type KnownBrowser =
  | 'chrome'
  | 'brave'
  | 'firefox'
  | 'edge'
  | 'safari'
  | 'opera'
  | 'vivaldi'
  | 'chromium'

// Maps every raw id we might see (macOS bundle id, Linux .desktop file, Windows ProgId) to a short canonical name. Lowercased, since Windows ProgIds and macOS bundle ids don't reliably agree on casing. Covers every release channel we know of (canary/beta/dev/nightly/ESR/developer edition) so a default browser on a less common channel still resolves to its browser family instead of being reported as unsupported.
const BROWSER_IDS: Record<string, KnownBrowser> = {
  'com.google.chrome': 'chrome',
  'com.google.chrome.canary': 'chrome',
  'com.google.chrome.beta': 'chrome',
  'com.google.chrome.dev': 'chrome',
  'com.brave.browser': 'brave',
  'com.brave.browser.beta': 'brave',
  'com.brave.browser.nightly': 'brave',
  'org.mozilla.firefox': 'firefox',
  'org.mozilla.firefoxdeveloperedition': 'firefox',
  'org.mozilla.nightly': 'firefox',
  'com.microsoft.edgemac': 'edge',
  'com.microsoft.edgemac.beta': 'edge',
  'com.microsoft.edgemac.dev': 'edge',
  'com.apple.safari': 'safari',
  'com.operasoftware.opera': 'opera',
  'com.operasoftware.operagx': 'opera',
  'com.vivaldi.vivaldi': 'vivaldi',
  'org.chromium.chromium': 'chromium',
  'google-chrome.desktop': 'chrome',
  'google-chrome-stable.desktop': 'chrome',
  'google-chrome-beta.desktop': 'chrome',
  'google-chrome-unstable.desktop': 'chrome',
  'brave-browser.desktop': 'brave',
  'firefox.desktop': 'firefox',
  'firefox-esr.desktop': 'firefox',
  'firefox-developer-edition.desktop': 'firefox',
  'firefox-nightly.desktop': 'firefox',
  'microsoft-edge.desktop': 'edge',
  'microsoft-edge-beta.desktop': 'edge',
  'microsoft-edge-dev.desktop': 'edge',
  'opera.desktop': 'opera',
  'opera-stable.desktop': 'opera',
  'vivaldi-stable.desktop': 'vivaldi',
  'vivaldi.desktop': 'vivaldi',
  'chromium.desktop': 'chromium',
  'chromium-browser.desktop': 'chromium',
  chromehtml: 'chrome',
  chromebhtml: 'chrome',
  chromedhtml: 'chrome',
  msedgehtm: 'edge',
  msedgebhtml: 'edge',
  msedgedhtml: 'edge',
  firefoxurl: 'firefox',
  bravehtml: 'brave',
  operastable: 'opera',
  operagxstable: 'opera',
  vivaldihtm: 'vivaldi',
  chromiumhtm: 'chromium',
}

const PRIVATE_MODE_FLAGS: Partial<Record<KnownBrowser, string>> = {
  chrome: '--incognito',
  brave: '--incognito',
  firefox: '--private-window',
  edge: '--inPrivate',
  opera: '--private',
  vivaldi: '--incognito',
  chromium: '--incognito',
  // Safari has no command-line flag for private mode.
}

/** Look up a raw browser id (any variant) against the known-browser table. */
function resolveKnownBrowser(id: string): KnownBrowser | undefined {
  // Windows can append a hash suffix to a ProgId (e.g. `FirefoxURL-6F193CCC56814779`
  // or `ChromeHTML.ABC123`). Try the exact id first, then each suffix-stripped form.
  const dotIndex = id.lastIndexOf('.')
  const hyphenIndex = id.lastIndexOf('-')
  const candidates = [
    id,
    dotIndex === -1 ? undefined : id.slice(0, dotIndex),
    hyphenIndex === -1 ? undefined : id.slice(0, hyphenIndex),
  ]

  for (const candidate of candidates) {
    const key = candidate?.toLowerCase()
    if (key && Object.hasOwn(BROWSER_IDS, key)) {
      return BROWSER_IDS[key]
    }
  }

  return undefined
}

function detectPlatformBinary(
  byPlatform: Partial<Record<NodeJS.Platform, string | readonly string[]>>,
): string | readonly string[] {
  const binary = byPlatform[process.platform]
  if (!binary) {
    throw new Error(`${process.platform} is not supported`)
  }

  return binary
}

/** Resolve the `AppTarget.name` to open the given browser, possibly in private mode. */
export async function resolveBrowserApp(
  which: Extract<AppName, 'browser' | 'browserPrivate'>,
): Promise<{ name: string | readonly string[]; arguments: string[] }> {
  const id = await defaultBrowserId()
  const known = resolveKnownBrowser(id)

  if (!known) {
    throw new Error(`${id} is not supported as a default browser`)
  }

  const extraArguments: string[] = []

  if (which === 'browserPrivate') {
    const flag = PRIVATE_MODE_FLAGS[known]
    if (!flag) {
      throw new Error(`${known} doesn't support opening in private mode via the command line`)
    }

    extraArguments.push(flag)
  }

  return { name: apps[known], arguments: extraArguments }
}

// Every named browser is attached below via `defineLazyProperty` so its (potentially process-spawning) resolution only happens on first access.
export const apps = {
  browser: 'browser',
  browserPrivate: 'browserPrivate',
} as Record<AppName, string | readonly string[]>

defineLazyProperty(apps, 'chrome', () =>
  detectPlatformBinary({
    darwin: 'google chrome',
    win32: 'chrome',
    // `chromium-browser` is the older Debian/Ubuntu package name from before the snap.
    linux: isWsl()
      ? [
          '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
          '/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        ]
      : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'],
  }),
)

defineLazyProperty(apps, 'brave', () =>
  detectPlatformBinary({
    darwin: 'brave browser',
    win32: 'brave',
    linux: isWsl()
      ? [
          '/mnt/c/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
          '/mnt/c/Program Files (x86)/BraveSoftware/Brave-Browser/Application/brave.exe',
        ]
      : ['brave-browser', 'brave'],
  }),
)

defineLazyProperty(apps, 'firefox', () =>
  detectPlatformBinary({
    darwin: 'firefox',
    win32: String.raw`C:\Program Files\Mozilla Firefox\firefox.exe`,
    linux: isWsl() ? '/mnt/c/Program Files/Mozilla Firefox/firefox.exe' : 'firefox',
  }),
)

defineLazyProperty(apps, 'edge', () =>
  detectPlatformBinary({
    darwin: 'microsoft edge',
    win32: 'msedge',
    linux: isWsl()
      ? '/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
      : ['microsoft-edge', 'microsoft-edge-dev'],
  }),
)

defineLazyProperty(apps, 'safari', () =>
  detectPlatformBinary({
    darwin: 'Safari',
  }),
)

defineLazyProperty(apps, 'opera', () =>
  detectPlatformBinary({
    darwin: 'opera',
    win32: 'opera',
    // Opera installs per-user rather than to a fixed Program Files path, so there's no reliable WSL mount path to fall back to here.
    linux: ['opera', 'opera-stable'],
  }),
)

defineLazyProperty(apps, 'vivaldi', () =>
  detectPlatformBinary({
    darwin: 'vivaldi',
    win32: 'vivaldi',
    linux: ['vivaldi-stable', 'vivaldi'],
  }),
)

defineLazyProperty(apps, 'chromium', () =>
  detectPlatformBinary({
    darwin: 'chromium',
    win32: 'chromium',
    linux: ['chromium', 'chromium-browser'],
  }),
)
