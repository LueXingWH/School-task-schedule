import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { zipSync } from 'fflate';
import { createHash } from 'node:crypto';
const files={};async function walk(path,prefix=''){for(const d of await readdir(path,{withFileTypes:true})){if(d.isDirectory())await walk(`${path}/${d.name}`,`${prefix}${d.name}/`);else files[prefix+d.name]=new Uint8Array(await readFile(`${path}/${d.name}`));}}
await walk('dist');await mkdir('release',{recursive:true});const zip=zipSync(files,{level:6});await writeFile('release/xiaoshijian-1.0.0-chrome.zip',zip);
await writeFile('release/SHA256SUMS.txt',`${createHash('sha256').update(zip).digest('hex')}  xiaoshijian-1.0.0-chrome.zip\n`);console.log(`Extension ZIP ${(zip.length/1024**2).toFixed(1)} MB`);
