import {chromium} from 'playwright';
import {unzipSync,zipSync,strToU8,strFromU8} from 'fflate';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const stamp=Date.now(),folder=`test-results/install-${stamp}/extension`,profile=`.test-profile-install-${stamp}`;await mkdir(folder,{recursive:true});
const archive=unzipSync(new Uint8Array(await readFile('release/xiaoshijian-1.0.0-chrome.zip')));for(const [name,bytes] of Object.entries(archive)){await mkdir(path.dirname(`${folder}/${name}`),{recursive:true});await writeFile(`${folder}/${name}`,bytes);}
const results=[];let context,page,base,cdp;
async function launch(){context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});cdp=await context.browser().newBrowserCDPSession();const {id}=await cdp.send('Extensions.loadUnpacked',{path:path.resolve(folder)});base=`chrome-extension://${id}`;page=await context.newPage();page.setDefaultTimeout(15000);await context.setOffline(true);await page.goto(`${base}/dashboard.html#settings`);await page.waitForFunction(()=>new Promise(resolve=>{const q=indexedDB.open('xiaoshijian');q.onsuccess=()=>{const db=q.result;const ready=db.objectStoreNames.contains('notices');db.close();resolve(ready);};q.onerror=()=>resolve(false);}));}
const dbRead=()=>page.evaluate(()=>new Promise(r=>{const q=indexedDB.open('xiaoshijian');q.onsuccess=()=>{const d=q.result,t=d.transaction(['notices','attachments','jobs']),result={};for(const k of ['notices','attachments','jobs']){const a=t.objectStore(k).getAll();a.onsuccess=()=>result[k]=a.result;}t.oncomplete=()=>{d.close();r(result);};};}));
async function wait(fn){const start=Date.now();while(Date.now()-start<15000){if(await fn())return;await new Promise(r=>setTimeout(r,200));}throw Error('Fresh install timed out');}
try {
  await launch();assert.equal((await dbRead()).notices.length,0);results.push('真实生产 ZIP 解压并在新的 Chrome 配置加载，初始数据为空');console.log(results.at(-1));
  await page.getByLabel('恢复备份文件').setInputFiles(path.resolve('test-results/roundtrip-backup.zip'));await page.getByRole('button',{name:'确认合并恢复'}).click();await wait(async()=>(await dbRead()).notices.length>0);const first=await dbRead();assert(first.attachments.length>=7);assert(first.notices.some(n=>n.title==='我的参赛准备'&&n.materials.some(m=>m.done)));results.push('断网的新安装环境恢复全部通知、材料勾选、任务与原文件');
  await page.getByLabel('恢复备份文件').setInputFiles(path.resolve('test-results/roundtrip-backup.zip'));await page.getByRole('button',{name:'确认合并恢复'}).click();await wait(async()=>(await dbRead()).notices.length===first.notices.length*2);const merged=await dbRead();assert.equal(new Set(merged.notices.map(n=>n.id)).size,merged.notices.length);results.push('已有数据再次恢复采用新 ID 副本合并，无覆盖');
  const backup=unzipSync(new Uint8Array(await readFile('test-results/roundtrip-backup.zip')));const info=JSON.parse(strFromU8(backup['data.json']));info.attachments[0].sha256='0'.repeat(64);backup['data.json']=strToU8(JSON.stringify(info));const invalid='test-results/corrupted-backup.zip';await writeFile(invalid,zipSync(backup));await page.getByLabel('恢复备份文件').setInputFiles(path.resolve(invalid));await page.getByRole('status').filter({hasText:'校验值不匹配'}).waitFor();assert.equal((await dbRead()).notices.length,merged.notices.length);results.push('篡改附件校验值的 ZIP 被拒绝，数据库未变');
  await context.close();await launch();assert.equal((await dbRead()).notices.length,merged.notices.length);results.push('整个浏览器退出并重启后 IndexedDB 全部保留');
  await page.goto(`${base}/dashboard.html#home`);await page.screenshot({path:'test-results/fresh-install-restored.png',fullPage:true});
  console.log(results.join('\n'));
}catch(e){process.exitCode=1;results.push('FAIL '+e);console.error(e);}finally{await writeFile('test-results/install-results.json',JSON.stringify({date:new Date().toISOString(),results},null,2));await context?.close();}
