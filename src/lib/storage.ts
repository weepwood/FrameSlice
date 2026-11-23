import { checkCanceled } from './format'

export function supportsFolderWrite(): boolean {
  return typeof window.showDirectoryPicker === 'function' && window.isSecureContext
}

export async function chooseFolder(): Promise<FileSystemDirectoryHandle> {
  if (!supportsFolderWrite()) throw new Error('当前浏览器不支持直接保存到文件夹，请改用桌面版 Chrome 或 Edge 的 HTTPS 页面。')
  return window.showDirectoryPicker!({ mode: 'readwrite', id: 'frameslice-output' })
}

export async function saveBlob(folder: FileSystemDirectoryHandle, filename: string, blob: Blob, signal: AbortSignal): Promise<void> {
  checkCanceled(signal)
  const handle = await folder.getFileHandle(filename, { create: true })
  const writable = await handle.createWritable()
  try {
    // blob.stream() does not eagerly materialize the complete blob in JS memory.
    const reader = blob.stream().getReader()
    try {
      for (;;) {
        checkCanceled(signal)
        const { done, value } = await reader.read()
        if (done) break
        await writable.write(value)
      }
    } finally {
      reader.releaseLock()
    }
    checkCanceled(signal)
    await writable.close()
  } catch (error) {
    await writable.abort().catch(() => {})
    // Each export has a unique job directory. Remove partial/empty output on failure.
    await folder.removeEntry(filename).catch(() => {})
    throw error
  }
}

export function downloadBlob(blob: Blob, name: string): void {
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.href = url
  link.download = name
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
