export function lowerBound(keys,t){let lo=0,hi=keys.length;while(lo<hi){let mid=(lo+hi)>>>1;if(keys[mid]<t)lo=mid+1;else hi=mid}return lo}
export function nearestKey(keys,t){if(!keys.length)return undefined;const i=lowerBound(keys,t);if(i===0)return keys[0];if(i===keys.length)return keys[i-1];return t-keys[i-1]<=keys[i]-t?keys[i-1]:keys[i]}
export function visibleKeys(keys,start,end,max=200){const a=lowerBound(keys,start),b=lowerBound(keys,end+Number.EPSILON),step=Math.max(1,Math.ceil((b-a)/max)),out=[];for(let i=a;i<b;i+=step)out.push(keys[i]);return out}
