// Use the CSS parser already required and locked by Vite, not a second parser.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {parse}=createRequire(require.resolve('vite/package.json'))('postcss');
const dir='apps/caption-studio/src/';
const files=['styles.css','editor-layout.css','caption-workbench.css'];
let failed=false;
for(const file of files){
 const root=parse(await readFile(dir+file,'utf8'),{from:dir+file});
 const seen=new Map();
 for(const rule of root.nodes.filter(node=>node.type==='rule')){
  for(const decl of rule.nodes.filter(node=>node.type==='decl')){
   const key=JSON.stringify([rule.selector,decl.prop,decl.value,!!decl.important]);
   if(seen.has(key)){
    console.error(file+':'+decl.source.start.line+' exact duplicate of line '+seen.get(key)+' ('+decl.prop+')');
    failed=true;
   }else seen.set(key,decl.source.start.line);
  }
 }
 console.log(file+': '+seen.size+' unique unconditional declarations');
}
const shared=await readFile(dir+'caption-style-entry.ts','utf8');
const expected=['./styles.css','./editor-layout.css','../../../src/assets/fluent-controls.css','../../../src/assets/fluent-player.css','./caption-workbench.css'];
const imports=source=>Array.from(source.matchAll(/^import\s+['"]([^'"]+)['"]/gm),m=>m[1]);
if(JSON.stringify(imports(shared))!==JSON.stringify(expected)){console.error('caption style entry order changed');failed=true}
for(const file of ['main.tsx','embed.tsx']){
 const list=imports(await readFile(dir+file,'utf8'));
 if(list.filter(x=>x==='./caption-style-entry').length!==1||list.some(x=>expected.includes(x))){console.error(file+': use the shared caption style entry exactly once');failed=true}
 if(file==='embed.tsx'&&list.some(x=>x.endsWith('fluent-theme.css'))){console.error('embedded theme must inherit host tokens');failed=true}
}
if(failed)process.exitCode=1;
