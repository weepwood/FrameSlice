/**
 * Actual Chrome smoke test for the production-built Vite app.
 * Uses a real origin-private FileSystemDirectoryHandle in place of the
 * operating-system picker to verify structured cloning into Web Workers.
 */
import { chromium } from 'playwright-core'
import { readFile, mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises'
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
  const inspector = page.getByRole('complementary', { name: '媒体检查器' })
  await inspector.getByText('源媒体', { exact: true }).waitFor()
  if (!(await inspector.locator('.fs-inspector-filename').innerText()).trim()) throw Error('Inspector filename missing')
  await page.getByRole('button', { name: '隐藏检查器' }).click()
  if (await inspector.count()) throw Error('Inspector should be hidden')
  await page.getByRole('button', { name: '显示检查器' }).click()
  await inspector.getByText('当前输出', { exact: true }).waitFor()
  await inspector.getByRole('region',{name:'输出设置'}).waitFor()
  await page.getByRole('button',{name:'隐藏检查器'}).click()
  await page.locator('.workspace').getByRole('region',{name:'输出设置'}).waitFor()
  await page.getByRole('button',{name:'显示检查器'}).click()
  await inspector.getByRole('region',{name:'输出设置'}).waitFor()
  const preview=page.getByRole('region',{name:'视频预览'}).locator('video')
  await preview.waitFor()
  // Verify the native decoder actually presents the local fixture before visual capture.
  await preview.evaluate(async v=>{await v.play();v.pause()})
  await page.waitForFunction(()=>{const v=document.querySelector('.fs-preview-panel video');return v&&v.readyState>=2&&!v.seeking},{},{timeout:15000})
  const action=page.getByRole('button',{name:/开始分割视频/});await action.waitFor()
  if(await action.count()!==1||!await page.locator('.topbar').getByRole('button',{name:/开始分割视频/}).isVisible())throw Error('Desktop primary action not uniquely available in toolbar')
  await page.setViewportSize({width:390,height:844});await page.locator('.execution').getByRole('button',{name:/开始分割视频/}).waitFor()
  await page.setViewportSize({width:1440,height:900});await page.locator('.topbar').getByRole('button',{name:/开始分割视频/}).waitFor()
  await page.getByRole('slider',{name:'时间轴缩放'}).fill('2')
  await page.getByRole('button',{name:'定位到播放位置'}).click()
  await page.getByRole('slider',{name:'时间轴缩放'}).fill('1')
  await page.getByRole('slider',{name:'定位播放位置'}).fill('1')
  await page.waitForFunction(()=>{const v=document.querySelector('.fs-preview-panel video');return v&&Math.abs(v.currentTime-1)<.05&&!v.seeking&&v.readyState>=2},{},{timeout:15000})

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

  await page.getByRole('button', { name: '预览分割计划' }).click()
  await page.getByText(/1 个片段 · 下列为媒体包估算/).waitFor({timeout:30000})
  await page.getByRole('combobox',{name:'主题'}).selectOption('dark')
  if(await page.locator('html').getAttribute('data-fs-theme')!=='dark')throw Error('theme switch failed')
  await mkdir('visual-regression',{recursive:true})
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'visual-regression/loaded-split-dark.png',animations:'disabled'})
  await page.getByRole('combobox',{name:'主题'}).selectOption('light')
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'visual-regression/loaded-split-light.png',animations:'disabled'})
  await page.getByRole('region',{name:'媒体时间轴'}).scrollIntoViewIfNeeded();await page.screenshot({path:'visual-regression/loaded-timeline-light.png',animations:'disabled'})
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
  await caption.getByRole('textbox',{name:'第 1 条字幕'}).waitFor()
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'visual-regression/loaded-caption-light.png',animations:'disabled'})
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
  // Caption editor to soft subtitle mux: reuse the already loaded media File,
  // transfer generated SRT in-memory; no redundant SRT export/reimport step.
  await caption.locator('input[accept^="video/*"]').setInputFiles(sample)
  await caption.getByRole('button', { name: /封装软字幕/ }).click()
  await page.locator('.ct-file-note').waitFor({ timeout: 30_000 })
  if (!((await page.locator('.ct-file-note').innerText()).includes('caption-export.srt')) ||
      !((await page.locator('.ct-choice.active').innerText()).includes('重新封装')) ||
      !((await page.locator('select[aria-label="封装目标格式"]').inputValue()) === 'mkv')) {
    throw new Error('Edited caption handoff failed to preselect source media and MKV soft subtitles')
  }
  await page.getByRole('button', { name: /字幕工作台/ }).click()
  await caption.getByRole('tab', { name: /导出/ }).waitFor()
  // Browser-native container tooling: reuse the video's File from the Vue
  // workbench, then exercise a true FileSystemDirectoryHandle in the worker.
  await page.getByRole('button', { name: /视频分割/ }).click()
  await page.getByRole('button', { name: /轨道提取与封装/ }).click()
  const containerPanel = page.locator('.ct-workspace')
  await containerPanel.locator('.ct-track').first().waitFor({ timeout: 20_000 })
  if (await containerPanel.locator('.ct-track').count() !== 2) {
    throw new Error('Container inspector did not identify H.264 video and AAC audio')
  }
  await containerPanel.locator('.ct-choice').first().click()
  await containerPanel.locator('.ct-ack input').check()
  await containerPanel.getByRole('button', { name: /开始提取所选轨道/ }).click()
  await page.waitForFunction(() => {
    const panel = document.querySelector('.ct-workspace')
    return panel?.querySelectorAll('.ct-output').length === 2 ||
      panel?.querySelector('.ct-error')
  }, { timeout: 45_000 })
  if (await containerPanel.locator('.ct-error').count()) {
    throw new Error('Container demux failed: ' + await containerPanel.locator('.ct-error').innerText())
  }
  if (!(await containerPanel.locator('.ct-result').innerText()).includes('完成 2 个输出')) {
    throw new Error('Container demux task did not complete')
  }
  await containerPanel.locator('.ct-choice').nth(1).click()
  await containerPanel.locator('input[accept=".srt,.vtt"]').setInputFiles({
    name: 'mux.srt', mimeType: 'text/plain',
    buffer: Buffer.from(['1','00:00:00,000 --> 00:00:01,000','嵌入式字幕封装测试',''].join(String.fromCharCode(10)), 'utf8'),
  })
  await containerPanel.getByRole('button', { name: /开始无损重新封装/ }).click()
  await page.waitForFunction(() => {
    const panel = document.querySelector('.ct-workspace')
    return panel?.querySelector('.ct-output') || panel?.querySelector('.ct-error')
  }, { timeout: 45_000 })
  if (await containerPanel.locator('.ct-error').count()) {
    throw new Error('Container subtitle mux failed: ' + await containerPanel.locator('.ct-error').innerText())
  }
  if (!(await containerPanel.locator('.ct-output').innerText()).includes('字幕轨已写入')) {
    throw new Error('MKV output does not report verified WebVTT subtitle')
  }
  // Re-import the *actual* generated MKV, including its WebVTT track, to
  // verify Matroska inspection warns before selectively remuxing to MP4.
  const matroskaBytes = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    for await (const [, dir] of root.entries()) {
      if (dir.kind !== 'directory') continue
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === 'file' && name.endsWith('_packaged.mkv')) {
          const bytes = await (await handle.getFile()).arrayBuffer()
          return Array.from(new Uint8Array(bytes))
        }
      }
    }
    return []
  })
  if (!matroskaBytes.length) throw new Error('No MKV soft subtitle output found in OPFS')
  await containerPanel.locator('input[type=file]').first().setInputFiles({
    name: 'reimported.mkv', mimeType: 'video/x-matroska',
    buffer: Buffer.from(matroskaBytes),
  })
  await page.waitForFunction(() =>
    document.querySelectorAll('.ct-workspace .ct-track').length >= 3,
    undefined, { timeout: 20_000 })
  if (await containerPanel.locator('.ct-unavailable').count() < 1) {
    throw new Error('MKV inspector silently omitted an embedded subtitle track')
  }
  await containerPanel.locator('.ct-ack input').check()
  await containerPanel.locator('select[aria-label="封装目标格式"]').selectOption('mp4')
  await containerPanel.getByRole('button', { name: /开始无损重新封装/ }).click()
  await page.waitForFunction(() => {
    const panel = document.querySelector('.ct-workspace')
    return panel?.querySelector('.ct-output') || panel?.querySelector('.ct-error')
  }, undefined, { timeout: 45_000 })
  if (await containerPanel.locator('.ct-error').count()) {
    throw new Error('Real MKV→MP4 remux failed: ' + await containerPanel.locator('.ct-error').innerText())
  }
  if (!(await containerPanel.locator('.ct-output').innerText()).includes('.mp4')) {
    throw new Error('Real MKV→MP4 export did not produce a checked MP4')
  }
  // Returning to the normal split tool must not trigger page navigation.
  await page.getByRole('button', { name: /无损分割/ }).click()
  if (!page.url().startsWith(initialURL)) throw new Error('Container subtool changed the page URL')
  // Older bookmarks point to /FrameSlice/subtitles/. Keep them functional,
  // but redirect to the same unified page with its subtitle tab selected.
  const oldURL = new URL('subtitles/', initialURL).href
  const redirectResponse = await page.request.get(oldURL)
  const redirectHTML = await redirectResponse.text()
  if (!redirectResponse.ok() || !redirectHTML.includes('url=../#captions')) {
    throw new Error('Legacy subtitle URL does not provide the compatibility redirect')
  }
  await page.goto(initialURL + '?caption-entry-test=1#captions', { waitUntil: 'networkidle' })
  await page.locator('.caption-react-host .caption-action-toolbar').waitFor({ timeout: 30_000 })
  if (!await page.getByRole('button', { name: /字幕工作台/ }).getAttribute('class')
      .then(value => value?.includes('active'))) {
    throw new Error('Direct caption deep link did not activate the unified subtitle tab')
  }
  if (errors.length) throw new Error('Browser runtime errors: ' + errors.join('; ') + '\\nNetwork errors: ' + JSON.stringify(networkErrors))
  console.log(JSON.stringify({ browser: 'Chrome', app: origin, split: 'passed', extract: 'passed', keyframeAnalysis: 'passed', manifest: 'passed', storyboard: 'passed', captionStudio: 'embedded', captionSRT: 'passed', samePageNavigation: 'passed', legacyCaptionLink: 'passed', containerDemux: 'passed', subtitleMux: 'passed', mkvToMp4: 'passed', captionHandoff: 'passed', files }, null, 2))
} finally {
  await browser.close()
  await rm(dir, { recursive: true, force: true })
}
