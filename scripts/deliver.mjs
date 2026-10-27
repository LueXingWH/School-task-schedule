import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {zipSync} from 'fflate';
import {createHash} from 'node:crypto';
const {version}=JSON.parse(await readFile('package.json','utf8'));
const clean=JSON.parse(await readFile('test-results/clean-build.json','utf8'));
const unit=JSON.parse(await readFile('test-results/unit-results.json','utf8'));
if(clean.status!=='PASS'||clean.version!==version||!unit.success||unit.numFailedTests)throw Error('Current-version clean build and unit tests must pass before delivery');
const setup=JSON.parse(await readFile('test-results/setup-results.json','utf8'));
const setupBytes=await readFile(`release/xiaoshijian-${version}-setup.exe`);
if(setup.status!=='PASS'||setup.version!==version||setup.executableSHA256!==createHash('sha256').update(setupBytes).digest('hex'))throw Error('The actual Windows installer must pass its current-binary acceptance tests');
// Require fresh results from both installed browsers before producing a delivery.
for(const browser of ['chrome','edge']) {
  const native=JSON.parse(await readFile(`test-results/setup-results-${browser}.json`,'utf8'));
  if(native.status!=='PASS'||native.version!==version||!native.managementButtonVerified||native.executableSHA256!==setup.executableSHA256)throw Error(`Missing current-binary ${browser} management-button acceptance`);
  const core=JSON.parse(await readFile(`test-results/${browser}/browser-results.json`,'utf8'));
  const install=JSON.parse(await readFile(`test-results/${browser}/install-results.json`,'utf8'));
  if(core.extensionVersion!==version||install.extensionVersion!==version||core.results.filter(r=>r.status==='PASS').length<15||core.results.some(r=>r.status==='FAIL')||core.errors.length||core.offlineHTTPRequests.length||install.results.some(r=>r.startsWith('FAIL'))||install.results.length<(browser==='edge'?6:5))throw Error(`Missing or failing ${browser} ${version} acceptance results`);
}
const source={};
async function walk(folder,into,prefix=folder+'/'){for(const item of await readdir(folder,{withFileTypes:true})){if(folder==='public'&&item.name==='vendor')continue;const p=`${folder}/${item.name}`;if(item.isDirectory())await walk(p,into,`${prefix}${item.name}/`);else into[prefix+item.name]=new Uint8Array(await readFile(p));}}
for(const dir of ['src','scripts','docs','tests','public','installer'])await walk(dir,source);
for(const name of ['AGENTS.md','README.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','dashboard.html','popup.html','.gitignore','Xiaoshijian_Project_and_Codex_Prompt.md'])source[name]=new Uint8Array(await readFile(name));
await mkdir('release',{recursive:true});const srcZip=zipSync(source,{level:6});await writeFile(`release/xiaoshijian-${version}-source.zip`,srcZip);
const full={};await walk('dist',full,'extension/');for(const [name,data] of Object.entries(source))full[`source/${name}`]=data;
full['START-HERE.md']=new Uint8Array(await readFile('docs/delivery-start.md'));
full[`xiaoshijian-${version}-setup.exe`]=new Uint8Array(setupBytes);
for(const name of ['extension/manifest.json','extension/vendor/ocr/worker.min.js','extension/vendor/ocr/lang/chi_sim.traineddata.gz','extension/vendor/ocr/lang/eng.traineddata.gz','extension/vendor/pdf/pdf.worker.min.mjs'])if(!full[name])throw Error('Incomplete delivery: '+name);
for(const browser of ['chrome','edge'])for(const name of ['browser-results.json','install-results.json','public-web.json','ocr-actual.txt','pdf-text-actual.txt','pdf-scan-actual.txt','docx-actual.txt','dashboard.png','mobile.png','ocr-result.png','fresh-install-restored.png','public-web.png'])try{full[`evidence/${browser}/${name}`]=new Uint8Array(await readFile(`test-results/${browser}/${name}`));}catch{}
for(const name of ['clean-build.json','unit-results.json','setup-results.json'])try{full[`evidence/${name}`]=new Uint8Array(await readFile(`test-results/${name}`));}catch{}
if(setup.preview)full['evidence/setup-preview.png']=new Uint8Array(await readFile(setup.preview));
for(const browser of ['chrome','edge']) {
  const native=JSON.parse(await readFile(`test-results/setup-results-${browser}.json`,'utf8'));
  full[`evidence/${browser}/setup-results.json`]=new Uint8Array(await readFile(`test-results/setup-results-${browser}.json`));
  full[`evidence/${browser}/management-page.png`]=new Uint8Array(await readFile(native.managementPage));
}
await writeFile(`release/xiaoshijian-${version}-delivery.zip`,zipSync(full,{level:6}));
const sums=[];for(const kind of ['edge','chrome','source','delivery','setup']){const name=`xiaoshijian-${version}-${kind}.${kind==='setup'?'exe':'zip'}`;const bytes=await readFile('release/'+name);sums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);console.log(`${name}: ${(bytes.length/1024**2).toFixed(2)} MiB`);}
await writeFile('release/SHA256SUMS.txt',sums.join('\n')+'\n');
