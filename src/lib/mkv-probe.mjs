/** Bounded EBML probe for Matroska TrackEntry metadata (not a full demuxer). */
const ids = {
  ebml: 0x1a45dfa3, segment: 0x18538067, tracks: 0x1654ae6b,
  entry: 0xae, number: 0xd7, type: 0x83, codec: 0x86,
  language: 0x22b59c, languageIetf: 0x22b59d,
  name: 0x536e, attached: 0x1941a469, chapters: 0x1043a770,
  cluster: 0x1f43b675,
}
const MAX_HEAD = 8 * 1024 * 1024
const decoder = new TextDecoder('utf-8', { fatal: false })

function vint(view, pos, elementId) {
  if (pos >= view.byteLength) return null
  const first = view[pos]
  if (!first) throw Error('无效的 EBML 变长整数。')
  let length = 1
  while (length <= 8 && !(first & (0x80 >> (length - 1)))) length++
  if (length > (elementId ? 4 : 8)) throw Error('EBML 整数编码长度异常。')
  if (pos + length > view.byteLength) return null
  let value = elementId ? first : first & (0xff >> length)
  let allOnes = !elementId && value === (0xff >> length)
  for (let i = 1; i < length; i++) {
    value = value * 256 + view[pos + i]
    allOnes &&= view[pos + i] === 255
  }
  if (!Number.isSafeInteger(value)) throw Error('EBML 元素长度过大。')
  return { value: allOnes ? Infinity : value, length }
}

function element(view, pos, parentEnd) {
  const id = vint(view, pos, true)
  if (!id) return null
  const size = vint(view, pos + id.length, false)
  if (!size) return null
  const start = pos + id.length + size.length
  const end = size.value === Infinity ? parentEnd : start + size.value
  if (size.value !== Infinity && (end > parentEnd || !Number.isSafeInteger(end))) return null
  return { id: id.value, start, end, next: end }
}

function elements(view, start, end, consume) {
  let cursor = start
  while (cursor < end) {
    const e = element(view, cursor, end)
    if (!e || e.next <= cursor) return false
    consume(e)
    cursor = e.next
  }
  return cursor === end
}

function integer(view, start, end) {
  if (end - start > 8) throw Error('轨道字段整数过长。')
  let result = 0
  for (let i = start; i < end; i++) {
    result = result * 256 + view[i]
    if (!Number.isSafeInteger(result)) throw Error('轨道字段整数超出范围。')
  }
  return result
}

function readTrack(view, start, end) {
  const t = { number: 0, kind: 'other', codecId: '', language: 'und', name: '' }
  elements(view, start, end, e => {
    const n = e.id
    if (n === ids.number) t.number = integer(view, e.start, e.end)
    if (n === ids.type) t.kind = ({ 1:'video', 2:'audio', 17:'subtitle' })[integer(view, e.start, e.end)] || 'other'
    if (n === ids.codec) t.codecId = decoder.decode(view.subarray(e.start, e.end)).slice(0, 80)
    if (n === ids.language || n === ids.languageIetf) t.language = decoder.decode(view.subarray(e.start, e.end)).slice(0, 32)
    if (n === ids.name) t.name = decoder.decode(view.subarray(e.start, e.end)).slice(0, 160)
  })
  return t
}

function segmentContents(view, start, end, result) {
  let cursor = start
  while (cursor < end) {
    const e = element(view, cursor, end)
    if (!e) return
    if (e.id === ids.tracks) {
      const tracks = []
      const complete = elements(view, e.start, e.end, t => {
        if (t.id === ids.entry) tracks.push(readTrack(view, t.start, t.end))
      })
      if (complete) { result.tracks = tracks; result.foundTracks = true }
      return
    }
    if (e.id === ids.cluster) return // Never probe media payloads.
    if (e.id === ids.attached) result.attachments = true
    if (e.id === ids.chapters) result.chapters = true
    cursor = e.next
  }
}

/** Reads at most 8 MiB. If no TrackEntry list is found, reports uncertainty. */
export async function probeMatroska(file) {
  if (!file || !Number.isSafeInteger(file.size) || file.size <= 0) {
    throw Error('无效的 MKV 文件。')
  }
  const buffer = await file.slice(0, Math.min(file.size, MAX_HEAD)).arrayBuffer()
  const view = new Uint8Array(buffer)
  const result = { foundTracks: false, tracks: [], attachments: false, chapters: false, scannedBytes: view.byteLength }
  try {
    let pos = 0
    const header = element(view, pos, view.length)
    if (!header || header.id !== ids.ebml) throw Error('文件缺少 Matroska EBML 标识。')
    pos = header.next
    while (pos < view.length) {
      const e = element(view, pos, view.length)
      if (!e) break
      if (e.id === ids.segment) {
        segmentContents(view, e.start, e.end, result)
        break
      }
      pos = e.next
    }
  } catch (error) {
    result.reason = error instanceof Error ? error.message : String(error)
  }
  return result
}
