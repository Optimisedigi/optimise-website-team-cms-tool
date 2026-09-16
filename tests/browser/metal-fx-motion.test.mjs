import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { build } from 'esbuild'
import { chromium } from 'playwright'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const componentPath = path.join(projectRoot, 'src/components/OptiMateMetalSend.tsx')

function findChromiumExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    chromium.executablePath(),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]

  return candidates.find((candidate) => candidate && existsSync(candidate))
}

function hashDataUrl(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

test('MetalFx pixels keep changing while the wrapped Send button is disabled', async (context) => {
  const executablePath = findChromiumExecutable()
  assert.ok(
    executablePath,
    'Chromium is required. Install the Playwright browser or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.',
  )

  const outputDirectory = await mkdtemp(path.join(tmpdir(), 'optimate-metal-motion-'))
  context.after(async () => rm(outputDirectory, { recursive: true, force: true }))

  const entryPath = path.join(outputDirectory, 'entry.tsx')
  const bundlePath = path.join(outputDirectory, 'bundle.js')
  await writeFile(
    entryPath,
    `import React from 'react'
import { createRoot } from 'react-dom/client'
import OptiMateMetalSend from ${JSON.stringify(componentPath)}

createRoot(document.getElementById('root')!).render(
  <OptiMateMetalSend>
    <button
      aria-label="Send"
      disabled
      style={{ width: 48, height: 48, border: 0, borderRadius: '50%', background: '#a8cf45' }}
    >
      ↑
    </button>
  </OptiMateMetalSend>,
)
`,
  )

  await build({
    absWorkingDir: projectRoot,
    bundle: true,
    entryPoints: [entryPath],
    format: 'iife',
    jsx: 'automatic',
    nodePaths: [path.join(projectRoot, 'node_modules')],
    outfile: bundlePath,
    platform: 'browser',
  })

  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--enable-unsafe-swiftshader'],
  })
  context.after(async () => browser.close())

  const page = await browser.newPage({ viewport: { width: 320, height: 240 } })
  await page.setContent(`<!doctype html>
<html>
  <head>
    <style>
      html, body, #root { width: 100%; height: 100%; margin: 0; }
      body { display: grid; place-items: center; background: #151515; }
      #root { display: grid; place-items: center; }
    </style>
  </head>
  <body><div id="root"></div></body>
</html>`)
  await page.addScriptTag({ content: await readFile(bundlePath, 'utf8') })

  const metal = page.locator('.metal-fx-root')
  await metal.waitFor({ state: 'visible', timeout: 5_000 })
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.metal-fx-canvas')
    return canvas instanceof HTMLCanvasElement && canvas.width > 1 && canvas.height > 1
  })

  assert.equal(await page.getByRole('button', { name: 'Send' }).isDisabled(), true)
  assert.equal(await metal.getAttribute('data-paused'), null)

  await page.waitForTimeout(150)
  const canvas = metal.locator('.metal-fx-canvas')
  const firstFrame = await canvas.evaluate((element) => element.toDataURL())
  await page.waitForTimeout(500)
  const secondFrame = await canvas.evaluate((element) => element.toDataURL())

  assert.notEqual(
    hashDataUrl(firstFrame),
    hashDataUrl(secondFrame),
    'MetalFx canvas pixels did not move',
  )
})
