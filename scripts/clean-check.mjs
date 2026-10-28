import {mkdir,cp,copyFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
const target=path.resolve(`test-results/clean-build-${Date.now()}`);await mkdir(target,{recursive:true});
for(const name of ['src','scripts','installer','bridge'])await cp(name,`${target}/${name}`,{recursive:true});
await mkdir(`${target}/public`,{recursive:true});await copyFile('public/manifest.json',`${target}/public/manifest.json`);
for(const name of ['package.json','package-lock.json','tsconfig.json','vite.config.ts','dashboard.html','popup.html'])await copyFile(name,`${target}/${name}`);
const npmCLI=process.env.npm_execpath||path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
// npm run may export its global-only allow-scripts option. It cannot be forwarded to project npm ci.
const childEnv={...process.env};for(const key of Object.keys(childEnv))if(key.toLowerCase()==='npm_config_allow_scripts')delete childEnv[key];
const run=(args)=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,[npmCLI,...args],{cwd:target,env:childEnv,windowsHide:true,stdio:'inherit'});p.on('error',reject);p.on('close',code=>code===0?resolve():reject(Error(`${args.join(' ')} exited ${code}`)));});
const {readFile}=await import('node:fs/promises');const {version}=JSON.parse(await readFile('package.json','utf8'));
try{await run(['ci','--ignore-scripts']);await run(['run','build']);await writeFile('test-results/clean-build.json',JSON.stringify({status:'PASS',version,path:target,date:new Date().toISOString()},null,2));}catch(e){await writeFile('test-results/clean-build.json',JSON.stringify({status:'FAIL',version,path:target,error:String(e)},null,2));throw e;}
