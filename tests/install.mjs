import {launchBrowser,loadExtension,browserName,browserSlug,outputDir} from './browser-support.mjs';
import {unzipSync,zipSync,strToU8,strFromU8} from 'fflate';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {rmSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const {version}=JSON.parse(await readFile('package.json','utf8'));
const stamp=Date.now(),folder=`${outputDir}/install-${stamp}/extension`,profile=`.test-profile-install-${browserSlug}-${stamp}`;await mkdir(folder,{recursive:true});
const archive=unzipSync(new Uint8Array(await readFile(`release/xiaoshijian-${version}-${browserSlug}.zip`)));for(const [name,bytes] of Object.entries(archive)){await mkdir(path.dirname(`${folder}/${name}`),{recursive:true});await writeFile(`${folder}/${name}`,bytes);}
const results=[];let context,page,base,runtime;
async function launch(){context=await launchBrowser(profile);runtime=await loadExtension(context,folder);base=runtime.base;page=await context.newPage();page.setDefaultTimeout(15000);await context.setOffline(true);await page.goto(`${base}/dashboard.html#settings`);await page.waitForFunction(()=>new Promise(resolve=>{const q=indexedDB.open('xiaoshijian');q.onsuccess=()=>{const db=q.result;const ready=db.objectStoreNames.contains('notices');db.close();resolve(ready);};q.onerror=()=>resolve(false);}));}
const dbRead=()=>page.evaluate(()=>new Promise(r=>{const q=indexedDB.open('xiaoshijian');q.onsuccess=()=>{const d=q.result,t=d.transaction(['notices','attachments','jobs']),result={};for(const k of ['notices','attachments','jobs']){const a=t.objectStore(k).getAll();a.onsuccess=()=>result[k]=a.result;}t.oncomplete=()=>{d.close();r(result);};};}));
async function wait(fn){const start=Date.now();while(Date.now()-start<15000){if(await fn())return;await new Promise(r=>setTimeout(r,200));}throw Error('Fresh install timed out');}
try {
  await launch();assert.equal((await dbRead()).notices.length,0);results.push(`真实生产 ZIP 解压并在新的 ${browserName} 配置加载，初始数据为空`);console.log(results.at(-1));
  await page.getByLabel('恢复备份文件').setInputFiles(path.resolve(`${outputDir}/roundtrip-backup.zip`));await page.getByRole('button',{name:'确认合并恢复'}).click();await wait(async()=>(await dbRead()).notices.length>0);const first=await dbRead();assert(first.attachments.length>=7);assert(first.notices.some(n=>n.title==='我的参赛准备'&&n.materials.some(m=>m.done)));results.push('断网的新安装环境恢复全部通知、材料勾选、任务与原文件');
  await page.getByLabel('恢复备份文件').setInputFiles(path.resolve(`${outputDir}/roundtrip-backup.zip`));await page.getByRole('button',{name:'确认合并恢复'}).click();await wait(async()=>(await dbRead()).notices.length===first.notices.length*2);const merged=await dbRead();assert.equal(new Set(merged.notices.map(n=>n.id)).size,merged.notices.length);results.push('已有数据再次恢复采用新 ID 副本合并，无覆盖');
  const backup=unzipSync(new Uint8Array(await readFile(`${outputDir}/roundtrip-backup.zip`)));const info=JSON.parse(strFromU8(backup['data.json']));info.attachments[0].sha256='0'.repeat(64);backup['data.json']=strToU8(JSON.stringify(info));const invalid=`${outputDir}/corrupted-backup.zip`;await writeFile(invalid,zipSync(backup));await page.getByLabel('恢复备份文件').setInputFiles(path.resolve(invalid));await page.getByRole('status').filter({hasText:'校验值不匹配'}).waitFor();assert.equal((await dbRead()).notices.length,merged.notices.length);results.push('篡改附件校验值的 ZIP 被拒绝，数据库未变');
  await context.close();await launch();assert.equal((await dbRead()).notices.length,merged.notices.length);results.push('整个浏览器退出并重启后 IndexedDB 全部保留');
  await page.goto(`${base}/dashboard.html#home`);await page.screenshot({path:`${outputDir}/fresh-install-restored.png`,fullPage:true});
  if(browserSlug==='edge') {
    const before=await dbRead();const chromeBackup='test-results/chrome/roundtrip-backup.zip';
    const chromeInfo=JSON.parse(strFromU8(unzipSync(new Uint8Array(await readFile(chromeBackup)))['data.json']));
    await page.goto(base+'/dashboard.html#settings');await page.getByLabel('恢复备份文件').setInputFiles(path.resolve(chromeBackup));await page.getByRole('button',{name:'确认合并恢复'}).click();await wait(async()=>(await dbRead()).notices.length===before.notices.length+chromeInfo.notices.length);
    const after=await dbRead();assert.equal(after.attachments.length,before.attachments.length+chromeInfo.attachments.length);
    const previousIds=new Set(before.notices.map(n=>n.id));const imported=after.notices.filter(n=>!previousIds.has(n.id));
    const summary=n=>JSON.stringify({title:n.title,life:n.life,deadline:n.deadline?{value:n.deadline.value,precision:n.deadline.precision,confirmed:n.deadline.confirmed}:null,sources:n.sources.map(s=>({kind:s.kind,text:s.text,originalText:s.originalText})),materials:n.materials.map(m=>({name:m.name,requirement:m.requirement,done:m.done})),tasks:n.tasks.map(t=>({text:t.text,date:t.date,done:t.done}))});
    assert.deepEqual(imported.map(summary).sort(),chromeInfo.notices.map(summary).sort());
    const previousAttachments=new Set(before.attachments.map(a=>a.id));const importedAttachmentIds=after.attachments.filter(a=>!previousAttachments.has(a.id)).map(a=>a.id);
    const hashes=await page.evaluate(async ids=>{const d=await new Promise(r=>{const q=indexedDB.open('xiaoshijian');q.onsuccess=()=>r(q.result);});const a=await new Promise(r=>{const q=d.transaction('attachments').objectStore('attachments').getAll();q.onsuccess=()=>r(q.result);});d.close();return Promise.all(a.filter(x=>ids.includes(x.id)).map(async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await x.blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('')));},importedAttachmentIds);
    assert.deepEqual(hashes.sort(),chromeInfo.attachments.map(a=>a.sha256).sort());results.push('Chrome 完整备份可在 Edge 恢复，通知/清单/任务与原文件 SHA-256 均保留');
  }
  console.log(results.join('\n'));
}catch(e){process.exitCode=1;results.push('FAIL '+e);console.error(e);}finally{await writeFile(`${outputDir}/install-results.json`,JSON.stringify({date:new Date().toISOString(),browser:browserName,browserVersion:runtime?.browserVersion,extensionVersion:runtime?.extensionVersion,results},null,2));await context?.close();try{rmSync(profile,{recursive:true,force:true});}catch{}}
