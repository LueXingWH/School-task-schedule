import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {zipSync} from 'fflate';
import {createHash} from 'node:crypto';
const source={};
async function walk(folder,into,prefix=folder+'/'){for(const item of await readdir(folder,{withFileTypes:true})){if(folder==='public'&&item.name==='vendor')continue;const p=`${folder}/${item.name}`;if(item.isDirectory())await walk(p,into,`${prefix}${item.name}/`);else into[prefix+item.name]=new Uint8Array(await readFile(p));}}
for(const dir of ['src','scripts','docs','tests','public'])await walk(dir,source);
for(const name of ['README.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','dashboard.html','popup.html','.gitignore','Xiaoshijian_Project_and_Codex_Prompt.md'])source[name]=new Uint8Array(await readFile(name));
await mkdir('release',{recursive:true});const srcZip=zipSync(source,{level:6});await writeFile('release/xiaoshijian-1.0.0-source.zip',srcZip);
const full={};await walk('dist',full,'extension/');for(const [name,data] of Object.entries(source))full[`source/${name}`]=data;
full['START-HERE.md']=new Uint8Array(await readFile('docs/delivery-start.md'));
for(const name of ['extension/manifest.json','extension/vendor/ocr/worker.min.js','extension/vendor/ocr/lang/chi_sim.traineddata.gz','extension/vendor/ocr/lang/eng.traineddata.gz','extension/vendor/pdf/pdf.worker.min.mjs'])if(!full[name])throw Error('Incomplete delivery: '+name);
for(const name of ['browser-results.json','install-results.json','clean-build.json','public-web.json','ocr-actual.txt','pdf-text-actual.txt','pdf-scan-actual.txt','docx-actual.txt','dashboard.png','mobile.png','ocr-result.png','fresh-install-restored.png','public-web.png'])try{full[`evidence/${name}`]=new Uint8Array(await readFile(`test-results/${name}`));}catch{}
await writeFile('release/xiaoshijian-1.0.0-delivery.zip',zipSync(full,{level:6}));
const sums=[];for(const name of ['xiaoshijian-1.0.0-chrome.zip','xiaoshijian-1.0.0-source.zip','xiaoshijian-1.0.0-delivery.zip']){const bytes=await readFile('release/'+name);sums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);console.log(`${name}: ${(bytes.length/1024**2).toFixed(2)} MiB`);}
await writeFile('release/SHA256SUMS.txt',sums.join('\n')+'\n');
