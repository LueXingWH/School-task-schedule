import {mkdir,cp,copyFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
const target=path.resolve(`test-results/clean-build-${Date.now()}`);await mkdir(target,{recursive:true});
for(const name of ['src','scripts'])await cp(name,`${target}/${name}`,{recursive:true});
await mkdir(`${target}/public`,{recursive:true});await copyFile('public/manifest.json',`${target}/public/manifest.json`);
for(const name of ['package.json','package-lock.json','tsconfig.json','vite.config.ts','dashboard.html','popup.html'])await copyFile(name,`${target}/${name}`);
const npmCLI=process.env.npm_execpath||path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const run=(args)=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,[npmCLI,...args],{cwd:target,windowsHide:true,stdio:'inherit'});p.on('close',code=>code===0?resolve():reject(Error(`${args.join(' ')} exited ${code}`)));});
try{await run(['ci','--ignore-scripts']);await run(['run','build']);await writeFile('test-results/clean-build.json',JSON.stringify({status:'PASS',path:target,date:new Date().toISOString()},null,2));}catch(e){await writeFile('test-results/clean-build.json',JSON.stringify({status:'FAIL',path:target,error:String(e)},null,2));throw e;}
