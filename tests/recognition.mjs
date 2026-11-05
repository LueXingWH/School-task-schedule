import {launchBrowser,loadExtension,browserName,browserSlug,outputDir} from './browser-support.mjs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {rmSync} from 'node:fs';
import {PDFDocument} from 'pdf-lib';
import {zipSync,strToU8} from 'fflate';
import assert from 'node:assert/strict';
import path from 'node:path';

const out=`${outputDir}/recognition`;await mkdir(out,{recursive:true});
const profile=`.test-profile-recognition-${browserSlug}-${Date.now()}`;
const context=await launchBrowser(profile,{viewport:{width:1440,height:1050},acceptDownloads:true});
const runtime=await loadExtension(context,'dist');const page=await context.newPage();page.setDefaultTimeout(15000);
const errors=[],requests=[],results=[];page.on('pageerror',e=>errors.push(String(e)));
context.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});await context.setOffline(true);
const readDB=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const q=indexedDB.open('xiaoshijian');q.onerror=()=>reject(q.error);q.onsuccess=()=>{const db=q.result,t=db.transaction(['notices','jobs']),data={};for(const k of ['notices','jobs']){const r=t.objectStore(k).getAll();r.onsuccess=()=>data[k]=r.result;}t.oncomplete=()=>{db.close();resolve(data);};};}));
async function wait(fn,timeout=180000){const until=Date.now()+timeout;while(Date.now()<until){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,250));}throw Error('Recognition state timed out');}
const jobsDone=()=>wait(async()=>{const d=await readDB();return d.jobs.length&&d.jobs.every(j=>!['waiting','running'].includes(j.state));});
const current=async()=>{const d=await readDB();return d.notices.find(n=>n.id===page.url().split('/').at(-1));};
async function paste(text){await page.goto(`${runtime.base}/dashboard.html#import`);await page.getByLabel('通知正文',{exact:true}).fill(text);await page.getByRole('button',{name:'保存原文并整理'}).click();await page.waitForURL(/#notice\//);await jobsDone();return current();}
async function upload(file){await page.goto(`${runtime.base}/dashboard.html#import`);await page.getByLabel('导入文件',{exact:true}).setInputFiles(file);await page.waitForURL(/#notice\//);await jobsDone();return current();}
const tab=name=>name==='原文与来源'?page.getByRole('heading',{name:'原文',exact:true}).scrollIntoViewIfNeeded():page.getByRole('tab',{name,exact:true}).click();
async function record(name,fn){const start=Date.now();try{await fn();results.push({name,status:'PASS',ms:Date.now()-start});console.log('PASS',name);}catch(e){results.push({name,status:'FAIL',error:String(e)});await page.screenshot({path:`${out}/failure.png`,fullPage:true});throw e;}}
let sampleId;
try{
  await record('文字自动提取、时间对应、右上角确认及无时间保留',async()=>{
    const n=await paste('微信：创新群\n各位同学请查看\n校园创新作品征集通知\n请于2026年11月9日18:30前提交报名表，并于11月12日下午3点参加答辩。\n准备作品演示。');sampleId=n.id;
    assert.equal(n.title,'校园创新作品征集通知');assert.equal(n.actions.length,3);assert.equal(n.tasks.length,0);
    assert.deepEqual(n.actions.map(a=>a.time),['2026-11-09T18:30','2026-11-12T15:00',undefined]);
    assert.equal(await page.getByLabel('通知标题',{exact:true}).inputValue(),n.title);
    const box=await page.getByRole('button',{name:'确认日程',exact:true}).boundingBox();assert(box.x>1000&&box.y<280);
    await page.getByRole('button',{name:'确认日程',exact:true}).click();await wait(async()=>(await current()).tasks.length===2);
    assert(await page.getByText('未找到对应时间，待确认',{exact:true}).isVisible());
    await page.getByRole('button',{name:'确认日程',exact:true}).click();assert.equal((await current()).tasks.length,2);
    await page.getByLabel('待办日期 准备作品演示',{exact:true}).fill('2026-11-13');
    await wait(async()=>(await current()).actions[2].time==='2026-11-13');
    await page.getByLabel('待办时刻 准备作品演示',{exact:true}).fill('14:00');
    await page.getByRole('button',{name:'确认日程',exact:true}).click();await wait(async()=>(await current()).tasks.length===3);
    assert.equal((await current()).tasks[2].time,'14:00');
    await page.getByLabel('完成任务 提交报名表',{exact:true}).click();
    await wait(async()=>(await current()).tasks[0].done);
    await tab('原文与来源');await page.getByRole('button',{name:'从已保存正文重新提取候选'}).click();
    await wait(async()=>(await current()).tasks[0].done);assert.equal((await current()).tasks.length,3);
  });
  await record('上传 UTF-8 TXT 自动整理',async()=>{
    const file=`${out}/notice.txt`;await writeFile(file,'材料领取通知\n请于2026年11月8日9:00领取参赛证。');const n=await upload(file);
    assert.equal(n.title,'材料领取通知');assert(n.actions.some(a=>a.text==='领取参赛证'&&a.time==='2026-11-08T09:00'));
  });
  await record('真实截图、文本 PDF、扫描 PDF 自动提取，无联网请求',async()=>{
    for(const filename of ['notice-zh.png','text-multipage.pdf','scanned.pdf']){
      const n=await upload(`tests/fixtures/${filename}`);assert(n.title.includes('校园'));assert(n.actions.length>0);assert(n.dates.length>0);
      if(filename!=='text-multipage.pdf')assert(n.actions.some(a=>a.time?.startsWith('2026-11-09')));
      if(filename==='scanned.pdf')assert.equal(n.sources[0].pages[0].method,'ocr');
    }
  });
  await record('低分辨率截图经放大预处理仍识别标题、截止日与时刻',async()=>{
    const {createCanvas,loadImage}=await import('@napi-rs/canvas');const original=await loadImage(await readFile('tests/fixtures/notice-zh.png'));
    const small=createCanvas(750,350);small.getContext('2d').drawImage(original,0,0,750,350);
    const file=`${out}/small-notice.png`;await writeFile(file,small.toBuffer('image/png'));const n=await upload(file);
    assert(n.title.includes('校园'));assert(n.dates.some(d=>d.value==='2026-11-09T18:00'));assert(n.actions.length>0);
    await writeFile(`${out}/small-ocr-actual.txt`,n.sources[0].text);
  });
  await record('11 页扫描 PDF 自动处理 10 页，明确剩余范围并可选页继续',async()=>{
    const original=await PDFDocument.load(await readFile('tests/fixtures/scanned.pdf'));const pdf=await PDFDocument.create();
    for(let i=0;i<11;i++){const [p]=await pdf.copyPages(original,[0]);pdf.addPage(p);}
    const file=`${out}/eleven-pages.pdf`;await writeFile(file,await pdf.save());let n=await upload(file);
    assert.deepEqual(n.sources[0].pages.map(p=>p.method),[...Array(10).fill('ocr'),'scan']);
    assert(n.sources[0].warnings.some(w=>w.includes('第 11 页')&&w.includes('10 页')));
    assert((await readDB()).jobs.some(j=>j.noticeId===n.id&&j.state==='partial'));
    const first=n.sources[0].pages[0].text;await tab('原文与来源');
    await page.getByLabel('PDF OCR 页码').fill('11');await page.getByRole('button',{name:'识别选定扫描页'}).click();
    await wait(async()=>(await readDB()).jobs.some(j=>j.noticeId===n.id&&j.pages?.includes(11)));await jobsDone();n=await current();
    assert(n.sources[0].pages.every(p=>p.method==='ocr'));assert.equal(n.sources[0].pages[0].text,first);
  });
  await record('长待办紧凑列表、页签和窄屏确认按钮保持可见',async()=>{
    await paste('学生办事通知\n'+Array.from({length:40},(_,i)=>`2026年11月9日提交第${i+1}份报名表。`).join('\n'));
    const list=page.locator('.action-list');assert(await list.evaluate(el=>el.scrollHeight>el.clientHeight&&el.clientHeight<=320));
    assert(await page.locator('.notice-sources').isVisible());assert(await page.locator('#panel-dates').isHidden());
    await page.screenshot({path:`${out}/compact-desktop.png`,fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1));
    await page.evaluate(()=>window.scrollTo(0,400));const box=await page.getByRole('button',{name:'确认日程',exact:true}).boundingBox();
    assert(box.x>180&&box.y>=140&&box.y+box.height<844);await page.screenshot({path:`${out}/compact-mobile.png`,fullPage:true});
    await page.setViewportSize({width:1440,height:1050});
  });
  await record('新待办完整备份恢复，日程及来源 ID 重映射和勾选保留',async()=>{
    await page.goto(`${runtime.base}/dashboard.html#settings`);const before=(await readDB()).notices;
    const event=page.waitForEvent('download');await page.getByRole('button',{name:'导出完整备份 ZIP'}).click();const dl=await event;const file=path.resolve(`${out}/actions-backup.zip`);await dl.saveAs(file);
    await page.getByLabel('恢复备份文件').setInputFiles(file);await page.getByRole('button',{name:'确认合并恢复'}).click();await wait(async()=>(await readDB()).notices.length===before.length*2);
    const restored=(await readDB()).notices.find(n=>n.title==='校园创新作品征集通知'&&n.id!==sampleId&&n.tasks.length===3);
    assert(restored);assert(restored.tasks[0].done);assert.equal(restored.tasks[0].time,'18:30');
    for(const a of restored.actions){assert(restored.sources.some(s=>s.id===a.evidence.sourceId));assert(a.originKey.startsWith(a.evidence.sourceId+':'));assert(restored.tasks.some(t=>t.id===a.taskId));}
    await page.goto(`${runtime.base}/dashboard.html#notice/${restored.id}`);await tab('原文与来源');await page.getByRole('button',{name:'从已保存正文重新提取候选'}).click();await tab('待办与日程');
    await page.getByRole('button',{name:'确认日程',exact:true}).click();assert.equal((await current()).tasks.length,3);
  });
  await record('实际恢复 1.3.0 数据，重提取新增待办而不改旧任务',async()=>{
    const old=structuredClone((await readDB()).notices.find(n=>n.id===sampleId));delete old.actions;for(const t of old.tasks)delete t.time;
    const file=`${out}/legacy-1.3.0.zip`;await writeFile(file,zipSync({'data.json':strToU8(JSON.stringify({format:'xiaoshijian-backup',schema:1,createdAt:1,notices:[old],attachments:[],jobs:[]}))}));
    const before=(await readDB()).notices;const previousIds=new Set(before.map(n=>n.id));await page.goto(`${runtime.base}/dashboard.html#settings`);await page.getByLabel('恢复备份文件').setInputFiles(file);await page.getByRole('button',{name:'确认合并恢复'}).click();await wait(async()=>(await readDB()).notices.length===before.length+1);
    const legacy=(await readDB()).notices.find(n=>!previousIds.has(n.id));assert(legacy);
    await page.goto(`${runtime.base}/dashboard.html#notice/${legacy.id}`);await tab('原文与来源');await page.getByRole('button',{name:'从已保存正文重新提取候选'}).click();
    await wait(async()=>(await current()).actions?.length===3);assert.equal((await current()).tasks.length,3);assert((await current()).tasks[0].done);
  });
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
}catch(e){console.error(e);process.exitCode=1;}finally{
  await writeFile(`${out}/results.json`,JSON.stringify({date:new Date().toISOString(),browser:browserName,extensionVersion:runtime.extensionVersion,results,errors,offlineHTTPRequests:requests},null,2));
  await context.close();try{rmSync(profile,{recursive:true,force:true});}catch{}
}
