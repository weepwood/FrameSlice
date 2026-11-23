/**
 * Actual Chrome smoke test for the production-built Vite app.
 * Uses a real origin-private FileSystemDirectoryHandle in place of the
 * operating-system picker to verify structured cloning into Web Workers.
 */
import { chromium } from 'playwright-core'
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const chromePath = process.env.CHROME_PATH
if (!chromePath) throw new Error('CHROME_PATH must reference an installed Chrome binary')
const origin = process.env.APP_URL ?? 'http://127.0.0.1:4173/FrameSlice/'
const dir = await mkdtemp(join(tmpdir(), 'frameslice-browser-'))
const sample = join(dir, 'fixture.mp4')
const encoded = await readFile(new URL('../tests/fixtures/black-h264-aac.mp4.b64', import.meta.url), 'utf8')
await writeFile(sample, Buffer.from(encoded.trim(), 'base64'))

const browser = await chromium.launch({ executablePath: chromePath, headless: true, args: ['--no-sandbox'] })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
  const errors = []
  const networkErrors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', msg => { if (msg.type() === 'error') errors.push('console: ' + msg.text()) })
  page.on('response', response => {
    if (response.status() >= 400) networkErrors.push(response.status() + ' ' + response.url())
  })
  page.on('requestfailed', request => networkErrors.push('failed: ' + request.url() + ' ' + request.failure()?.errorText))
  // The OPFS handle is a genuine native FileSystemDirectoryHandle which can
  // be structured-cloned into a Worker, unlike a JavaScript mock object.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => navigator.storage.getDirectory(),
    })
  })
  await page.goto(origin, { waitUntil: 'networkidle' })
  if (await page.locator('input[type=file]').count() === 0) {
    const html = (await page.content()).slice(0, 2000)
    throw new Error('App did not render file input. URL: ' + page.url() +
      '\\nTitle: ' + await page.title() + '\\nHTML: ' + html +
      '\\nPage errors: ' + JSON.stringify(errors) +
      '\\nNetwork errors: ' + JSON.stringify(networkErrors))
  }
  await page.locator('input[type=file]').setInputFiles(sample)
  await page.locator('.file-codec').waitFor({ timeout: 30_000 })

  await page.getByRole('button', { name: '分析视频' }).click()
  await page.locator('.fs-analysis-metrics').waitFor({ timeout: 30_000 })
  if (await page.locator('.fs-analysis-chart > span').count() !== 48) {
    throw new Error('Keyframe analyzer failed to render all bitrate buckets')
  }

  async function awaitResult(label) {
    await page.waitForFunction(() => {
      const card = document.querySelector('.status-card')
      return card?.classList.contains('success') || card?.classList.contains('failure')
    }, { timeout: 60_000 })
    if (await page.locator('.status-card.failure').count()) {
      const detail = await page.locator('.status-card').innerText()
      throw new Error(label + ' failed: ' + detail)
    }
  }

  await page.getByRole('button', { name: /开始分割视频/ }).click()
  await awaitResult('split Worker')
  if (await page.locator('.result-list .result-item').count() !== 1) {
    throw new Error('Split Worker did not export one MP4 segment')
  }
  if (!(await page.locator('.result-list').innerText()).includes('MP4 结构已校验')) {
    throw new Error('Segment verification status missing from UI')
  }

  const [manifestDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /导出处理报告 JSON/ }).click(),
  ])
  const manifest = JSON.parse(await readFile(await manifestDownload.path(), 'utf8'))
  if (manifest.schemaVersion !== 1 || manifest.summary.outputCount !== 1 ||
      !manifest.outputs[0].verification.passed) {
    throw new Error('Exported split manifest is invalid or missing verification details')
  }

  await page.locator('button.nav-item').nth(1).click()
  await page.getByRole('button', { name: /开始提取图片/ }).click()
  await awaitResult('frame Worker')
  if (await page.locator('.frame-tile img').count() < 1) {
    throw new Error('Frame Worker did not return any image previews')
  }
  const [sheetDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /生成分镜拼图/ }).click(),
  ])
  if (!sheetDownload.suggestedFilename().endsWith('_storyboard.jpg')) {
    throw new Error('Unexpected contact-sheet download name')
  }
  const jpg = await readFile(await sheetDownload.path())
  if (jpg.byteLength < 800 || jpg[0] !== 0xff || jpg[1] !== 0xd8) {
    throw new Error('Contact-sheet JPEG is malformed or empty')
  }
  const files = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    const result = []
    for await (const [dirName, child] of root.entries()) {
      if (child.kind !== 'directory') continue
      for await (const [fileName, handle] of child.entries()) {
        if (handle.kind !== 'file') continue
        const file = await handle.getFile()
        result.push({ path: dirName + '/' + fileName, bytes: file.size })
      }
    }
    return result
  })
  if (!files.some(file => file.path.endsWith('.mp4') && file.bytes > 500)) {
    throw new Error('No verified MP4 found in OPFS')
  }
  if (files.filter(file => file.path.endsWith('/frameslice-report.json')).length !== 2) {
    throw new Error('Both exported job folders must contain a JSON manifest')
  }
  if (!files.some(file => file.path.endsWith('.jpg') && file.bytes > 100)) {
    throw new Error('No JPEG export found in OPFS')
  }
  // All three tools live in the same Vue workspace. React lives in a Shadow
  // DOM island, so test actual editor controls without navigating to /subtitles/.
  const initialURL = page.url()
  await page.getByRole('button', { name: /字幕工作台/ }).click()
  if (page.url() !== initialURL) throw new Error('Subtitle tab unexpectedly navigated away')
  const caption = page.locator('.caption-react-host')
  try {
    await caption.locator('.caption-action-toolbar').waitFor({ timeout: 12_000 })
  } catch (error) {
    const message = await page.locator('.caption-embed-feedback').allTextContents()
    const summary = await page.evaluate(() => ({
      captionContainers: document.querySelectorAll('.caption-react-host').length,
      shadowMounted: Boolean(document.querySelector('.caption-react-host')?.shadowRoot),
      visibleCaption: document.querySelector('.caption-page') ? getComputedStyle(document.querySelector('.caption-page')).display : 'missing',
    }))
    throw new Error('Subtitle island did not mount: ' + JSON.stringify({
      message, summary, errors, networkErrors, url: page.url(),
      originalError: String(error),
    }))
  }
  if (await caption.locator('.nav-rail').count() !== 0 ||
      await caption.locator('.topbar').count() !== 0) {
    throw new Error('Embedded subtitle workspace still has a duplicate navbar/topbar')
  }
  await caption.getByRole('button', { name: /打开工程/ }).waitFor()
  await caption.getByRole('button', { name: /导入字幕/ }).waitFor()
  await caption.locator('input[accept=".srt,.vtt"]').setInputFiles({
    name: 'integration.srt', mimeType: 'text/plain',
    buffer: Buffer.from(['1','00:00:01,000 --> 00:00:03,000','FrameSlice 字幕合并测试',''].join(String.fromCharCode(10)), 'utf8'),
  })
  await caption.getByRole('tab', { name: /导出/ }).click()
  const [subtitleDownload] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    caption.locator('.export-grid button').first().click(),
  ])
  const subtitleContent = await readFile(await subtitleDownload.path(), 'utf8')
  if (!subtitleContent.includes('FrameSlice 字幕合并测试') ||
      !subtitleContent.includes('00:00:01,000')) {
    throw new Error('Embedded subtitle workspace failed SRT import/export roundtrip')
  }
  await page.getByRole('button', { name: /视频分割/ }).click()
  if (page.url() !== initialURL) throw new Error('Video tab unexpectedly navigated away')
  await page.getByRole('button', { name: /导出处理报告 JSON/ }).waitFor()
  await page.getByRole('button', { name: /字幕工作台/ }).click()
  await caption.getByRole('tab', { name: /导出/ }).waitFor()
  if (await caption.locator('.export-grid button').first().isDisabled()) {
    throw new Error('Switching between tools lost the subtitle editor state')
  }
  // Older bookmarks point to /FrameSlice/subtitles/. Keep them functional,
  // but redirect to the same unified page with its subtitle tab selected.
  const oldURL = new URL('subtitles/', initialURL).href
  const redirectResponse = await page.request.get(oldURL)
  const redirectHTML = await redirectResponse.text()
  if (!redirectResponse.ok() || !redirectHTML.includes('url=../#captions')) {
    throw new Error('Legacy subtitle URL does not provide the compatibility redirect')
  }
  await page.goto(initialURL + '#captions', { waitUntil: 'networkidle' })
  await page.locator('.caption-react-host .caption-action-toolbar').waitFor({ timeout: 30_000 })
  if (!await page.getByRole('button', { name: /字幕工作台/ }).getAttribute('class')
      .then(value => value?.includes('active'))) {
    throw new Error('Direct caption deep link did not activate the unified subtitle tab')
  }
  if (errors.length) throw new Error('Browser runtime errors: ' + errors.join('; ') + '\\nNetwork errors: ' + JSON.stringify(networkErrors))
  console.log(JSON.stringify({ browser: 'Chrome', app: origin, split: 'passed', extract: 'passed', keyframeAnalysis: 'passed', manifest: 'passed', storyboard: 'passed', captionStudio: 'embedded', captionSRT: 'passed', samePageNavigation: 'passed', legacyCaptionLink: 'passed', files }, null, 2))
} finally {
  await browser.close()
  await rm(dir, { recursive: true, force: true })
}
