/** Strict, bounded SRT / WebVTT normalization for embedding as a soft subtitle track. */
const MAX_CUES = 50_000
const MAX_SOURCE_LENGTH = 4_000_000

function timeInMs(value) {
  const match = /^(?:(\d{1,4}):)?([0-5]?\d):([0-5]\d)[,.](\d{1,3})$/.exec(value.trim())
  if (!match) return null
  const h = Number(match[1] || 0)
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  const milli = Number(match[4].padEnd(3, '0'))
  const total = ((h * 60 + minutes) * 60 + seconds) * 1000 + milli
  return Number.isSafeInteger(total) ? total : null
}

function formatTime(ms) {
  const n = Math.floor(ms)
  const hours = Math.floor(n / 3600000)
  const minutes = Math.floor(n / 60000) % 60
  const seconds = Math.floor(n / 1000) % 60
  return [hours, minutes, seconds].map(x => String(x).padStart(2, '0')).join(':') +
    '.' + String(n % 1000).padStart(3, '0')
}

export function normalizeSubtitleText(raw, extension) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_SOURCE_LENGTH) {
    throw Error('字幕文本大小无效（最多 4MB）。')
  }
  const ext = String(extension).toLowerCase().replace(/^\./, '')
  if (!['srt', 'vtt'].includes(ext)) throw Error('只支持导入 SRT 或 VTT 文本字幕。')
  const text = raw.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n')
  const blocks = text.split(/\n\s*\n/)
  const cues = []
  for (const block of blocks) {
    const lines = block.split('\n').map(s => s.trimEnd())
    const index = lines.findIndex(s => s.includes('-->'))
    if (index < 0) continue // Ignore WEBVTT header, NOTE and STYLE blocks.
    const [beginRaw, endRaw] = lines[index].split(/\s*-->\s*/)
    const begin = timeInMs(beginRaw || '')
    const end = timeInMs((endRaw || '').trim().split(/\s+/)[0])
    const payload = lines.slice(index + 1).join('\n').trim()
    if (begin === null || end === null || end <= begin || !payload) {
      throw Error('字幕包含无效时间戳或空文本，请先在字幕工作台中修正。')
    }
    if (payload.length > 4096) throw Error('单条字幕超过安全字符限制。')
    cues.push({ begin, end, payload })
    if (cues.length > MAX_CUES) throw Error('字幕条目过多，最多支持五万条。')
  }
  if (!cues.length) throw Error('没有找到可用的字幕时间轴。')
  cues.sort((a,b) => a.begin - b.begin || a.end - b.end)
  const webvtt = 'WEBVTT\n\n' + cues.map(c =>
    `${formatTime(c.begin)} --> ${formatTime(c.end)}\n${c.payload}\n`).join('\n')
  return { webvtt, count: cues.length, endSeconds: cues.at(-1).end / 1000 }
}
