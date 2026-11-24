// GitHub Pages applications share an origin. Never clear every CacheStorage bucket.
const CACHE='transformers-cache'
const models=new Set(['whisper-tiny','whisper-base','whisper-small','whisper-tiny.en','whisper-base.en'])
export function isWhisperModelRequest(url:string):boolean {
 try{const u=new URL(url);const [,org,model,route]=u.pathname.split('/');return u.protocol==='https:'&&u.hostname==='huggingface.co'&&org==='onnx-community'&&models.has(model)&&route==='resolve'}catch{return false}
}
async function existing(){return typeof caches!=='undefined'&&(await caches.has(CACHE))?caches.open(CACHE):null}
export async function countWhisperCache(){const cache=await existing();return cache?(await cache.keys()).filter(r=>isWhisperModelRequest(r.url)).length:0}
export async function clearWhisperCache(){const cache=await existing();if(!cache)return 0;let count=0;for(const request of await cache.keys())if(isWhisperModelRequest(request.url)&&await cache.delete(request))count++;return count}
