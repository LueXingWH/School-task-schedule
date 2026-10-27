import { mkdir, readdir, copyFile, cp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { createCanvas } from '@napi-rs/canvas';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const base='public/vendor';await mkdir(`${base}/ocr/core`,{recursive:true});await mkdir(`${base}/ocr/lang`,{recursive:true});
await copyFile('node_modules/tesseract.js/dist/worker.min.js',`${base}/ocr/worker.min.js`);
for(const name of await readdir('node_modules/tesseract.js-core'))if(name.endsWith('.wasm')||name.endsWith('.wasm.js'))await copyFile(`node_modules/tesseract.js-core/${name}`,`${base}/ocr/core/${name}`);
await mkdir(`${base}/pdf`,{recursive:true});await copyFile('node_modules/pdfjs-dist/build/pdf.worker.min.mjs',`${base}/pdf/pdf.worker.min.mjs`);
for(const name of ['cmaps','standard_fonts','wasm','iccs'])await cp(`node_modules/pdfjs-dist/${name}`,`${base}/pdf/${name}`,{recursive:true});
const commit='87416418657359cb625c412a48b6e1d6d41c29bd';
let hashes={};try{hashes=JSON.parse(await readFile('scripts/ocr-resources.json','utf8'));}catch{}
for(const lang of ['chi_sim','eng']) {
  const target=`${base}/ocr/lang/${lang}.traineddata.gz`;let data;
  try {data=await readFile(target);}catch {
    const url=`https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${commit}/${lang}.traineddata`;
    console.log(`Downloading build-time resource: ${lang}`);const res=await fetch(url);if(!res.ok)throw Error(`${url}: ${res.status}`);
    data=gzipSync(new Uint8Array(await res.arrayBuffer()),{level:9});await writeFile(target,data);
  }
  const hash=createHash('sha256').update(data).digest('hex');if(hashes[lang]&&hashes[lang].sha256!==hash)throw Error(`OCR resource integrity mismatch: ${lang}`);
  hashes[lang]={commit,sha256:hash,source:`https://github.com/tesseract-ocr/tessdata_fast/blob/${commit}/${lang}.traineddata`};
}
await writeFile('scripts/ocr-resources.json',JSON.stringify(hashes,null,2)+'\n');
await mkdir('public/icons',{recursive:true});
for(const size of [16,48,128]){const c=createCanvas(size,size),x=c.getContext('2d');x.fillStyle='#136f63';x.beginPath();x.roundRect(0,0,size,size,size*.23);x.fill();x.fillStyle='#fff9ec';x.fillRect(size*.27,size*.19,size*.48,size*.63);x.strokeStyle='#136f63';x.lineWidth=size*.045;for(let i=0;i<3;i++){x.beginPath();x.moveTo(size*.36,size*(.36+i*.14));x.lineTo(size*.65,size*(.36+i*.14));x.stroke();}await writeFile(`public/icons/${size}.png`,c.toBuffer('image/png'));}
await mkdir('public/licenses',{recursive:true});
for(const name of ['tesseract.js','tesseract.js-core','pdfjs-dist','mammoth','react','react-dom','dexie','fflate','zod']) {
  for(const f of ['LICENSE','LICENSE.md','LICENSE.txt','License.txt'])try{await copyFile(`node_modules/${name}/${f}`,`public/licenses/${name}.txt`);break;}catch{}
}
// Include notices for transitive runtime dependencies as well as top-level packages.
const tree=JSON.parse(execFileSync(process.execPath,[process.env.npm_execpath||path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),'ls','--omit=dev','--all','--json'],{encoding:'utf8'}));
const packages=new Map();
function collect(deps,parent='node_modules') {for(const [name,value] of Object.entries(deps||{})){let dir=path.join(parent,name);if(!packages.has(name+'@'+value.version)){packages.set(name+'@'+value.version,{name,version:value.version,dir});collect(value.dependencies,path.join(dir,'node_modules'));}}}
collect(tree.dependencies);
const notices=['# Third-party runtime notices','', 'OCR language data: tesseract-ocr/tessdata_fast, Apache-2.0, pinned commit '+commit+'. License: licenses/tessdata_fast.txt',''];
for(const item of packages.values()) {
  let info;try{info=JSON.parse(await readFile(`${item.dir}/package.json`,'utf8'));}catch{item.dir=`node_modules/${item.name}`;try{info=JSON.parse(await readFile(`${item.dir}/package.json`,'utf8'));}catch{continue;}}
  const filename=item.name.replaceAll('/','_')+'.txt';let found=false;
  for(const name of ['LICENSE','LICENSE.md','LICENSE.markdown','LICENSE.txt','license','license.md','LICENCE','License.txt','LICENSE-MIT'])try{await copyFile(`${item.dir}/${name}`,`public/licenses/${filename}`);found=true;break;}catch{}
  notices.push(`- ${item.name}@${item.version}: ${typeof info.license==='string'?info.license:JSON.stringify(info.license)}. ${found?'licenses/'+filename:'License declaration in npm package metadata.'}`);
}
await writeFile('public/THIRD-PARTY-NOTICES.md',notices.join('\n')+'\n');
try{await readFile('public/licenses/tessdata_fast.txt');}catch{const license=await fetch(`https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${commit}/LICENSE`);if(license.ok)await writeFile('public/licenses/tessdata_fast.txt',await license.text());else throw Error('Language data license download failed');}
console.log('Offline parsers, OCR language data and icons are ready.');
