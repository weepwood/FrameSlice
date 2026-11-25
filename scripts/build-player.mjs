import {build} from 'esbuild';
await build({entryPoints:['src/player/register.ts'],outfile:'dist/player/media-chrome.js',bundle:true,minify:true,format:'esm',target:'es2022',legalComments:'linked'});

import {copyFile} from 'node:fs/promises';
await copyFile('node_modules/media-chrome/LICENSE','dist/player/LICENSE.txt');
