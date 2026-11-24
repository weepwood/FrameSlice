/** Generate a real, non-sparse MP4 of at least 12GB from encoded moving video. */
import {execFileSync} from 'node:child_process'
import {mkdir,stat,writeFile,unlink} from 'node:fs/promises'
import {resolve,join} from 'node:path'
const dir=resolve(process.argv[2]||'/tmp/frameslice-large-media')
await mkdir(dir,{recursive:true})
const target=Number(process.env.TARGET_BYTES||12000000000)
if(!Number.isSafeInteger(target)||target<100000000||target>13000000000)throw Error('invalid generated fixture size')
const seed=join(dir,'seed.mp4'),list=join(dir,'concat.txt'),output=join(dir,'real-large.mp4')
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=1280x720:rate=30','-vf','noise=alls=45:allf=t+u','-t','12','-an','-c:v','libx264','-preset','ultrafast','-qp','12','-g','30','-bf','0',seed],{stdio:'inherit'})
const bytes=(await stat(seed)).size
if(bytes<1000000)throw Error('seed unexpectedly small')
const count=Math.ceil(target*1.04/bytes)+1
if(count>10000)throw Error('too many concat segments')
await writeFile(list,Array.from({length:count},()=> "file 'seed.mp4'").join('\n')+'\n')
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',list,'-c','copy',output],{stdio:'inherit'})
const result=await stat(output)
if(result.size<target||result.blocks*512<target*.98)throw Error('real on-disk video size below target or sparse')
const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_format','-show_streams','-of','json',output],{encoding:'utf8'}))
if(!probe.streams.some(s=>s.codec_type==='video'))throw Error('not a valid media container')
await writeFile(join(dir,'fixture.json'),JSON.stringify({kind:'generated-repeated-encoded-video',bytes:result.size,allocatedBytes:result.blocks*512,repeatCount:count,duration:Number(probe.format.duration),codec:probe.streams[0].codec_name},null,2))
await unlink(seed);await unlink(list);console.log(output,result.size)
