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

/** Manual cuts must be exact indexed GOP boundaries. No silent snapping in the engine. */
export function planManualGroups(groups,cuts){
 if(!groups.length||!Array.isArray(cuts)||cuts.length>10000)throw Error('无效手动切割点')
 const indexes=new Map(groups.map((g,i)=>[g.time,i]))
 const requested=[...new Set(cuts)].sort((a,b)=>a-b)
 const result=[];let start=0
 for(const cut of requested){const i=indexes.get(cut);if(!Number.isFinite(cut)||i===undefined||i<=start)throw Error('手动切割点不是有效关键帧边界');result.push(groups.slice(start,i));start=i}
 result.push(groups.slice(start));return result
}

/** Exact start/end boundaries, end is exclusive. */
export function selectGopRange(groups,duration,start,end){if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>duration)throw Error('截取区间无效');const i=groups.findIndex(g=>g.time===start),j=end===duration?groups.length:groups.findIndex(g=>g.time===end);if(i<0||j<=i)throw Error('起点和终点必须是实际 GOP 边界（终点也可为视频结束）');return {groups:groups.slice(i,j),end:groups[j]??null}}
