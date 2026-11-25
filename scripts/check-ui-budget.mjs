import {readFile,readdir} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
const assets=await readdir('dist/assets');
function entry(prefix){
 const files=assets.filter(n=>n.startsWith(prefix+'-')&&n.endsWith('.js'));
 if(files.length!==1)throw Error('Expected one '+prefix+' JS entry, found '+files.length);
 return 'dist/assets/'+files[0];
}
const limits=[
 [entry('index'),60000],
 [entry('App'),115000],
 ['dist/caption/caption-workspace.js',215000],
 ['dist/player/media-chrome.js',55000]
];
let failed=false;
for(const [file,limit] of limits){
 const bytes=gzipSync(await readFile(file)).length;
 console.log(JSON.stringify({file,gzipBytes:bytes,budgetBytes:limit,passed:bytes<=limit}));
 if(bytes>limit)failed=true;
}
if(failed)process.exitCode=1;
