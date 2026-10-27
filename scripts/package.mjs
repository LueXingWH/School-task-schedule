import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { zipSync } from 'fflate';
import { createHash } from 'node:crypto';
const {version}=JSON.parse(await readFile('package.json','utf8'));
const files={};async function walk(path,prefix=''){for(const d of await readdir(path,{withFileTypes:true})){if(d.isDirectory())await walk(`${path}/${d.name}`,`${prefix}${d.name}/`);else files[prefix+d.name]=new Uint8Array(await readFile(`${path}/${d.name}`));}}
await walk('dist');await mkdir('release',{recursive:true});const zip=zipSync(files,{level:6});
const hash=createHash('sha256').update(zip).digest('hex');const sums=[];
// Edge and Chrome use the same tested MV3 payload, with separate download names for installation.
for(const browser of ['edge','chrome']){const name=`xiaoshijian-${version}-${browser}.zip`;await writeFile(`release/${name}`,zip);sums.push(`${hash}  ${name}`);}
await writeFile('release/SHA256SUMS.txt',sums.join('\n')+'\n');console.log(`Edge / Chrome extension ZIP ${(zip.length/1024**2).toFixed(1)} MB each`);
