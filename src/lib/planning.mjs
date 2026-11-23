/** Pure packing algorithm for keyframe-aligned groups, independent of browser APIs. */
export function planGroups(groups, maxBytes) {
  const budget = Math.floor(maxBytes * 0.95)
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 32 * 1024 * 1024) {
    throw new Error('每份文件的大小至少为 32 MB。')
  }
  const result = []
  let current = []
  let total = 0
  for (const group of groups) {
    if (group.bytes > budget) throw new Error('单个关键帧组已超过目标文件大小，无法在不重新编码的情况下分割。请增大目标大小。')
    if (current.length && total + group.bytes > budget) {
      result.push(current)
      current = []
      total = 0
    }
    current.push(group)
    total += group.bytes
  }
  if (current.length) result.push(current)
  return result
}
