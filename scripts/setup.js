#!/usr/bin/env node
// Template setup: fill in package metadata interactively.
//
// Run with: npm run setup
//
// It asks for the package name, description, author, GitHub repository, license
// and keywords, then rewrites package.json and every placeholder in the text
// files (README, CONTRIBUTING, GitHub workflows and templates).
// The LICENSE file is NOT generated — place your own LICENSE file in the root.
// No dependencies — Node >= 22 built-ins only.

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// When stdin is piped (non-TTY), readline's `question` doesn't drain the
// buffered lines reliably, so read all of stdin up front and answer from it.
// Interactive (TTY) use keeps the normal readline prompt flow.
const interactive = stdin.isTTY
let rl = null
let pipedLines = []

if (interactive) {
  rl = createInterface({ input: stdin, output: stdout })
} else {
  const chunks = []
  for await (const chunk of stdin) chunks.push(chunk)
  pipedLines = Buffer.concat(chunks).toString().split(/\r?\n/)
}

const ask = async (question, defaultValue) => {
  const suffix = defaultValue ? ` (${defaultValue})` : ''
  let answer
  if (interactive) {
    answer = (await rl.question(`${question}${suffix}: `)).trim()
  } else {
    answer = (pipedLines.shift() ?? '').trim()
    process.stdout.write(`${question}${suffix}: ${answer}\n`)
  }
  return answer || defaultValue || ''
}

// Detect which package manager invoked `run setup` so it can be the default.
function detectManager() {
  const ua = process.env.npm_config_user_agent || ''
  if (ua.startsWith('pnpm')) return 'pnpm'
  if (ua.startsWith('yarn')) return 'yarn'
  if (ua.startsWith('bun')) return 'bun'
  return 'npm'
}

const VALID_MANAGERS = new Set(['npm', 'pnpm', 'yarn', 'bun'])

// Normalize a GitHub repository URL: adds the https:// protocol (and the
// github.com host for a bare "owner/repo"), and strips a trailing ".git"
// or trailing slash.
function normalizeGitUrl(input) {
  let url = input.trim()
  if (!url) return ''

  url = url.replace(/\/+$/, '')
  url = url.replace(/\.git$/i, '').replace(/\/+$/, '')

  if (!/^https?:\/\//i.test(url)) {
    const host = url.split('/')[0]
    if (!host.includes('.')) url = `github.com/${url}`
    url = `https://${url}`
  }

  return url
}

// GitHub Actions setup steps (checkout is added separately in the workflow).
// `nodeVersion` is either a literal ("22") or the matrix expression string.
function setupSteps(pm, nodeVersion) {
  switch (pm) {
    case 'npm':
      return [
        '      - uses: actions/setup-node@v4',
        '        with:',
        `          node-version: ${nodeVersion}`,
        '          cache: npm',
        '      - run: npm install',
      ].join('\n')
    case 'pnpm':
      return [
        '      - uses: pnpm/action-setup@v4',
        '        with:',
        '          version: 10',
        '      - uses: actions/setup-node@v4',
        '        with:',
        `          node-version: ${nodeVersion}`,
        '          cache: pnpm',
        '      - run: pnpm install',
      ].join('\n')
    case 'yarn':
      return [
        '      - uses: actions/setup-node@v4',
        '        with:',
        `          node-version: ${nodeVersion}`,
        '          cache: yarn',
        '      - run: yarn install',
      ].join('\n')
    case 'bun':
      return [
        '      - uses: oven-sh/setup-bun@v2',
        '      - uses: actions/setup-node@v4',
        '        with:',
        `          node-version: ${nodeVersion}`,
        '      - run: bun install',
      ].join('\n')
  }
}

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === '.git' ||
        entry.name === '.private'
      )
        continue
      out.push(...(await walk(full)))
    } else {
      // Skip lockfiles — they're generated and may not be committed.
      if (
        entry.name === 'package-lock.json' ||
        entry.name === 'pnpm-lock.yaml' ||
        entry.name === 'yarn.lock' ||
        entry.name === 'bun.lockb' ||
        entry.name === 'bun.lock'
      )
        continue
      out.push(full)
    }
  }
  return out
}

// Only rewrite text files that may carry placeholders.
const TEXT_EXT = new Set(['.md', '.yml', '.yaml', '.json', '.ts', '.js', '.cjs', '.mjs'])
// Skip in the generic placeholder walk: package.json is handled explicitly,
// LICENSE is user-managed, setup.js would otherwise rewrite its own placeholders,
// and the workflows are generated per package manager below.
const SKIP_FILES = new Set([
  join(root, 'package.json'),
  join(root, 'LICENSE'),
  join(root, 'scripts/setup.js'),
  join(root, '.github/workflows/ci.yml'),
  join(root, '.github/workflows/release.yml'),
])

async function main() {
  console.log('\n=== npm-biome.ts template setup ===\n')

  const name = await ask('Package name (npm name)')
  if (!name) {
    console.error('Package name is required.')
    if (interactive) rl.close()
    process.exit(1)
  }

  const description = await ask('Description')
  const author = await ask('Author (e.g. "Your Name <you@example.com>")')
  const gitUrlRaw = await ask('GitHub repository URL (https://github.com/owner/repo)')
  const gitUrl = normalizeGitUrl(gitUrlRaw)

  const license = await ask('License SPDX identifier (e.g. MIT, ISC, Apache-2.0)', 'MIT')

  const keywordsRaw = await ask('Keywords (comma-separated)')
  const keywords = keywordsRaw
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)

  const pm = await ask('Package manager (npm / pnpm / yarn / bun)', detectManager())
  if (!VALID_MANAGERS.has(pm)) {
    console.error(`Unknown package manager "${pm}". Choose one of: npm, pnpm, yarn, bun.`)
    if (interactive) rl.close()
    process.exit(1)
  }

  if (interactive) rl.close()

  // Derive owner/repo from the GitHub URL for shields.io badges.
  let repoSlug = ''
  if (gitUrl) {
    const match = gitUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/)
    if (match) repoSlug = `${match[1]}/${match[2]}`
  }

  const year = new Date().getFullYear()

  const values = {
    '<package-name>': name,
    '<package-description>': description,
    '<package-author>': author,
    '<package-git>': gitUrl,
    '<package-repo>': repoSlug,
    '<package-license>': license,
    '<package-year>': String(year),
    '<pm>': pm,
  }

  // 1. Rewrite package.json fields explicitly (keywords need an array).
  const pkgPath = join(root, 'package.json')
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
  pkg.name = name
  pkg.description = description
  pkg.author = author || pkg.author
  pkg.license = license
  if (keywords.length) pkg.keywords = keywords
  if (gitUrl) {
    pkg.homepage = `${gitUrl}#readme`
    pkg.bugs = { url: `${gitUrl}/issues` }
    pkg.repository = { type: 'git', url: `git+${gitUrl}.git` }
  }
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
  console.log(`updated ${relative(root, pkgPath)}`)

  // 2. Generate the GitHub Actions workflows for the chosen package manager.
  //    The run commands use `<pm>` and the setup/install block uses
  //    `<setup-steps>`; the publish step always uses the npm CLI because
  //    trusted publishing (OIDC) is an npm feature regardless of dev manager.
  // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression
  const matrixExpr = '${{ matrix.node-version }}'
  const ciPath = join(root, '.github/workflows/ci.yml')
  let ci = await readFile(ciPath, 'utf8')
  ci = ci.split('<pm>').join(pm).split('<setup-steps>').join(setupSteps(pm, matrixExpr))
  await writeFile(ciPath, ci)
  console.log(`updated ${relative(root, ciPath)}`)

  const releasePath = join(root, '.github/workflows/release.yml')
  let release = await readFile(releasePath, 'utf8')
  release = release.split('<pm>').join(pm).split('<setup-steps>').join(setupSteps(pm, '22'))
  await writeFile(releasePath, release)
  console.log(`updated ${relative(root, releasePath)}`)

  // 3. Replace placeholders in every text file under the project, except
  //    the ones handled explicitly above.
  const files = await walk(root)
  for (const file of files) {
    if (SKIP_FILES.has(file)) continue
    const ext = file.slice(file.lastIndexOf('.'))
    if (!TEXT_EXT.has(ext)) continue

    const original = await readFile(file, 'utf8')
    let updated = original
    for (const [placeholder, value] of Object.entries(values)) {
      updated = updated.split(placeholder).join(value)
    }
    if (updated !== original) {
      await writeFile(file, updated)
      console.log(`updated ${relative(root, file)}`)
    }
  }

  console.log('\nSetup complete.')
  console.log('Next steps:')
  console.log('  1. Place your LICENSE file in the project root')
  console.log(`  2. ${pm} install`)
  console.log(`  3. ${pm} run check && ${pm} run test && ${pm} run build`)
  console.log('  4. Review README.md and CONTRIBUTING.md')
  console.log('  5. Delete scripts/setup.js if you no longer need it')
  console.log('  6. Configure npm trusted publishing for your package on npmjs.com')
  console.log('     (Settings -> Publishing access -> Trusted publishers -> GitHub)')
  console.log('')
}

main().catch((err) => {
  console.error(err)
  if (interactive) rl.close()
  process.exit(1)
})
