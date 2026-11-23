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

/** Split at keyframe boundaries, with each segment no longer than maxSeconds. */
export function planGroupsByDuration(groups, duration, maxSeconds) {
  if (!Number.isFinite(duration) || duration <= 0 ||
      !Number.isFinite(maxSeconds) || maxSeconds < 0.5) {
    throw new Error('分割时长必须至少为 0.5 秒，且视频时长必须有效。')
  }
  if (!groups.length) throw new Error('没有可用的关键帧组。')
  for (let i = 0; i < groups.length; i++) {
    const time = groups[i].time
    const end = i + 1 < groups.length ? groups[i + 1].time : duration
    if (!Number.isFinite(time) || !Number.isFinite(end) ||
        time < 0 || end <= time || end > duration + 0.001) {
      throw new Error('视频关键帧时间戳无效或顺序异常。')
    }
    if (end - time > maxSeconds + 0.000001) {
      throw new Error('相邻关键帧间隔超过目标时长；无法无损切割，请增大时长。')
    }
  }
  const result = []
  for (let start = 0; start < groups.length;) {
    let cursor = start + 1
    while (cursor < groups.length && groups[cursor].time - groups[start].time <= maxSeconds + 0.000001) {
      cursor++
    }
    if (cursor === groups.length && duration - groups[start].time <= maxSeconds + 0.000001) {
      result.push(groups.slice(start))
      break
    }
    const boundary = cursor - 1
    if (boundary <= start) throw new Error('关键帧间隔过长，无法按照指定时长无损分割。')
    result.push(groups.slice(start, boundary))
    start = boundary
  }
  return result
}
