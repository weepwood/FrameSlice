export interface StoryboardItem {
  url: string
  timestamp: number
}

const COLUMNS = 3
const TILE_WIDTH = 300
const TILE_HEIGHT = 170
const CAPTION_HEIGHT = 34
const GAP = 12
const PADDING = 20
const HEADER_HEIGHT = 72

function stamp(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  return [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60]
    .map((value, index) => index === 0 ? String(value).padStart(2, '0') : String(value).padStart(2, '0'))
    .join(':')
}

function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement,
  x: number, y: number, width: number, height: number): void {
  const ratio = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const sw = width / ratio
  const sh = height / ratio
  ctx.drawImage(image, (image.naturalWidth - sw) / 2, (image.naturalHeight - sh) / 2,
    sw, sh, x, y, width, height)
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  if (!url.startsWith('blob:')) throw new Error('分镜图只允许读取当前页面生成的本地预览。')
  const image = new Image()
  image.src = url
  await image.decode()
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('预览图片尺寸无效。')
  return image
}

/**
 * Composes at most 12 existing local preview thumbnails into a JPEG contact
 * sheet. Never decodes the source video again or allocates huge image arrays.
 */
export async function createStoryboard(items: StoryboardItem[], title: string): Promise<Blob> {
  if (!items.length) throw new Error('没有可用的截图预览，无法生成分镜图。')
  const samples = items.length <= 12 ? items
    : Array.from({ length: 12 }, (_, i) => items[Math.round(i * (items.length - 1) / 11)])
  const rows = Math.ceil(samples.length / COLUMNS)
  const canvas = document.createElement('canvas')
  canvas.width = PADDING * 2 + COLUMNS * TILE_WIDTH + (COLUMNS - 1) * GAP
  canvas.height = HEADER_HEIGHT + rows * (TILE_HEIGHT + CAPTION_HEIGHT) + (rows - 1) * GAP + PADDING
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器无法创建分镜图画布。')
  ctx.fillStyle = '#151c18'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#f3f4ef'
  ctx.font = '600 20px system-ui, sans-serif'
  ctx.fillText(String(title).slice(0, 60), PADDING, 32, canvas.width - PADDING * 2)
  ctx.fillStyle = '#a7b3a7'
  ctx.font = '12px system-ui, sans-serif'
  ctx.fillText(`FRAMESLICE  /  ${samples.length} FRAMES  /  LOCAL CONTACT SHEET`,
    PADDING, 54, canvas.width - PADDING * 2)

  for (let i = 0; i < samples.length; i++) {
    const item = samples[i]
    const image = await loadImage(item.url)
    const col = i % COLUMNS
    const row = Math.floor(i / COLUMNS)
    const x = PADDING + col * (TILE_WIDTH + GAP)
    const y = HEADER_HEIGHT + row * (TILE_HEIGHT + CAPTION_HEIGHT + GAP)
    ctx.fillStyle = '#2e3830'
    ctx.fillRect(x, y, TILE_WIDTH, TILE_HEIGHT)
    drawCover(ctx, image, x, y, TILE_WIDTH, TILE_HEIGHT)
    ctx.fillStyle = '#25302a'
    ctx.fillRect(x, y + TILE_HEIGHT, TILE_WIDTH, CAPTION_HEIGHT)
    ctx.fillStyle = '#e3ebe0'
    ctx.font = '12px system-ui, sans-serif'
    ctx.fillText(stamp(item.timestamp), x + 12, y + TILE_HEIGHT + 22)
    ctx.textAlign = 'right'
    ctx.fillStyle = '#a8b6a9'
    ctx.fillText(String(i + 1).padStart(2, '0'), x + TILE_WIDTH - 12, y + TILE_HEIGHT + 22)
    ctx.textAlign = 'left'
  }
  return new Promise((resolve, reject) => canvas.toBlob(blob =>
    blob && blob.type === 'image/jpeg' ? resolve(blob) : reject(new Error('无法将分镜图编码为 JPEG。')),
  'image/jpeg', 0.9))
}
