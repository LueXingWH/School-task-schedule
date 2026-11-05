import {launchBrowser,loadExtension,browserName,browserSlug,outputDir} from './browser-support.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {rmSync} from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';

const out=`${outputDir}/workflow`,profile=path.resolve(`.test-profile-workflow-${browserSlug}-${Date.now()}`);
await mkdir(out,{recursive:true});
const context=await launchBrowser(profile,{viewport:{width:1440,height:1050}});
const runtime=await loadExtension(context,'dist'),results=[],errors=[],requests=[];
context.on('page',p=>p.on('pageerror',e=>errors.push(String(e))));
context.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
await context.setOffline(true);
for(const p of context.pages())if(p.url().startsWith(runtime.base))await p.close();
const page=await context.newPage();page.setDefaultTimeout(15000);
const go=hash=>page.goto(`${runtime.base}/dashboard.html#${hash}`);
const readDB=()=>page.evaluate(()=>new Promise((resolve,reject)=>{
  const q=indexedDB.open('xiaoshijian');q.onerror=()=>reject(q.error);q.onsuccess=()=>{
    const db=q.result,t=db.transaction(['notices','jobs','attachments']),data={version:db.version};
    for(const key of ['notices','jobs','attachments']){const r=t.objectStore(key).getAll();r.onsuccess=()=>data[key]=r.result;}
    t.oncomplete=()=>{db.close();resolve(data);};
  };
}));
const wait=async(fn)=>{const until=Date.now()+30000;while(Date.now()<until){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,100));}throw Error('Workflow state timed out');};
const jobsDone=()=>wait(async()=>{const d=await readDB();return d.jobs.every(j=>!['waiting','running'].includes(j.state));});
const current=async()=>(await readDB()).notices.find(n=>n.id===page.url().split('/').at(-1));
const record=async(name,fn)=>{const start=Date.now();try{await fn();results.push({name,status:'PASS',ms:Date.now()-start});console.log('PASS',name);}catch(e){results.push({name,status:'FAIL',error:String(e)});await page.screenshot({path:`${out}/failure.png`,fullPage:true});throw e;}};
const batch=async()=>{await go('import');await page.getByRole('button',{name:'一次导入多项日程'}).click();};
const textFile=(name,text)=>({name,mimeType:'text/plain',buffer:Buffer.from(text)});
let sampleId;
try{
  await page.goto(`${runtime.base}/icons/48.png`);
  await record('旧 v2 数据升级到 v3，四种状态归并且人工内容与任务保留',async()=>{
    await page.evaluate(()=>new Promise((resolve,reject)=>{
      const drop=indexedDB.deleteDatabase('xiaoshijian');drop.onerror=()=>reject(drop.error);drop.onblocked=()=>reject(Error('DB still open'));drop.onsuccess=()=>{
        const q=indexedDB.open('xiaoshijian',20);q.onerror=()=>reject(q.error);q.onupgradeneeded=()=>{
          for(const [name,indexes] of Object.entries({notices:['life','createdAt','updatedAt'],jobs:['noticeId','sourceId','state'],attachments:['noticeId','sourceId'],mcpRequests:['noticeId']})){
            const s=q.result.createObjectStore(name,{keyPath:name==='mcpRequests'?'key':'id'});for(const index of indexes)s.createIndex(index,index);
          }
        };
        q.onsuccess=()=>{const db=q.result,t=db.transaction('notices','readwrite');
          for(const life of ['review','active','done','archived'])t.objectStore('notices').put({id:'legacy-'+life,title:'人工标题-'+life,titleEdited:true,life,deadlineEdited:true,createdAt:1,updatedAt:1,sources:[],dates:[],materials:[],tasks:[{id:'task-'+life,text:'旧任务',date:'2026-11-09',done:true}],dismissedMaterials:[]});
          t.oncomplete=()=>{db.close();resolve(true);};
        };
      };
    }));
    await go('all');await wait(async()=>(await readDB()).version===30);
    const d=await readDB();assert.deepEqual(d.notices.map(n=>[n.id,n.life]).sort(),[['legacy-active','active'],['legacy-archived','done'],['legacy-done','done'],['legacy-review','active']]);
    assert(d.notices.every(n=>n.tasks[0].done&&n.title.startsWith('人工标题-')));
  });
  await record('详情按主标题、内容概述、原文排列；概述可编辑并持久保存',async()=>{
    await go('import');await page.getByLabel('通知正文',{exact:true}).fill('校园项目报名通知\n2026年11月12日提交作品。\n请于2026年11月9日18:30前提交报名表。\n联系人：张老师');
    await page.getByRole('button',{name:'保存原文并整理'}).click();await page.waitForURL(/#notice\//);await jobsDone();sampleId=(await current()).id;
    assert.deepEqual((await page.locator('.detail-main > section > .section-heading > h2').allTextContents()).slice(0,3),['主标题','内容概述','原文']);
    assert(await page.getByRole('textbox',{name:'内容概述',exact:true}).isVisible());assert(await page.getByLabel('原文 未命名通知',{exact:true}).isVisible());
    assert((await current()).summary.includes('报名表'));assert(!(await current()).summary.includes('张老师'));
    await page.getByRole('textbox',{name:'内容概述',exact:true}).fill('先交报名表，再准备作品。');await page.getByLabel('通知状态').focus();
    await wait(async()=>(await current()).summaryEdited);await page.reload();assert.equal(await page.getByRole('textbox',{name:'内容概述',exact:true}).inputValue(),'先交报名表，再准备作品。');
  });
  await record('主截止日直接编辑并立即保存；候选选择、清空与确认不会回退',async()=>{
    assert.equal(await page.getByLabel('人工截止日期').inputValue(),'2026-11-09');
    await page.evaluate(()=>{
      const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      for(const [label,value] of [['人工截止日期','2026-11-11'],['人工截止时刻','09:45']]){
        const input=document.querySelector(`input[aria-label="${label}"]`);set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));
      }
    });
    await wait(async()=>(await current()).deadline?.value==='2026-11-11T09:45');
    await page.getByLabel('人工截止时刻').fill('18:30');await wait(async()=>(await current()).deadline?.value==='2026-11-11T18:30');
    await page.getByLabel('人工截止日期').fill('2026-11-10');await wait(async()=>(await current()).deadline?.value==='2026-11-10T18:30');
    await page.getByLabel('人工截止时刻').fill('14:20');await wait(async()=>(await current()).deadline?.value==='2026-11-10T14:20');
    await page.getByRole('tab',{name:'时间依据',exact:true}).click();await page.getByRole('button',{name:'选为已确认截止日',exact:true}).first().click();
    await wait(async()=>(await current()).deadline?.value==='2026-11-12');await page.getByRole('button',{name:'确认日程',exact:true}).click();assert.equal((await current()).deadline.value,'2026-11-12');
    await page.getByRole('button',{name:'清空截止日',exact:true}).click();await wait(async()=>!(await current()).deadline);
    await page.getByRole('button',{name:'确认日程',exact:true}).click();await page.getByRole('button',{name:'从已保存正文重新提取候选'}).click();
    assert(!(await current()).deadline);assert.equal((await current()).summary,'先交报名表，再准备作品。');
    await page.getByLabel('人工截止日期').fill('2026-11-15');await wait(async()=>(await current()).deadline?.value==='2026-11-15');
    await page.getByRole('tab',{name:'待办与日程',exact:true}).click();await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${out}/detail-desktop.png`,fullPage:true});
  });
  await record('通知状态只有未完成和完成，列表与首页遵循状态切换',async()=>{
    assert.deepEqual(await page.getByLabel('通知状态').locator('option').allTextContents(),['未完成','完成']);
    await page.getByLabel('通知状态').selectOption('done');await wait(async()=>(await current()).life==='done');
    await go('active');assert.equal(await page.getByRole('link',{name:'校园项目报名通知',exact:true}).count(),0);
    await go('done');await page.getByRole('link',{name:'校园项目报名通知',exact:true}).waitFor();
    await go('all');await page.getByRole('link',{name:'校园项目报名通知',exact:true}).waitFor();
    await go(`notice/${sampleId}`);await page.getByLabel('通知状态').selectOption('active');await wait(async()=>(await current()).life==='active');
  });
  await record('单项导入将多个附件归入同一项，可继续关联已有日程',async()=>{
    await go('import');const before=(await readDB()).notices.length;
    await page.getByLabel('导入文件',{exact:true}).setInputFiles([textFile('正文.txt','附件合并通知\n2026年11月9日提交报名表'),textFile('补充.txt','补充说明\n2026年11月12日参加答辩')]);
    await page.waitForURL(/#notice\//);await jobsDone();const n=await current();assert.equal((await readDB()).notices.length,before+1);assert.equal(n.sources.length,2);
    await go(`import/${n.id}`);await page.getByLabel('导入文件',{exact:true}).setInputFiles(textFile('第三份.txt','准备作品介绍PPT'));
    await page.waitForURL(/#notice\//);await jobsDone();assert.equal((await current()).id,n.id);assert.equal((await current()).sources.length,3);assert.equal((await readDB()).notices.length,before+1);
  });
  await record('批量粘贴提供拆分预览，分段原文、概述与日期分别保存',async()=>{
    await batch();const before=(await readDB()).notices.length;
    await page.getByLabel('多项日程正文').fill('批量报名通知\n2026年11月9日提交报名表\n\n保留段内空行。\n---\n批量答辩安排\n2026年11月12日15:00参加答辩\n---\n批量领证通知\n2026年11月15日领取证书');
    assert.equal(await page.getByLabel('批量日程预览').locator('li').count(),3);
    await page.getByRole('button',{name:'保存 3 项日程并整理',exact:true}).click();await page.getByRole('heading',{name:'已保存 3 项日程'}).waitFor();await jobsDone();
    const d=await readDB();assert.equal(d.notices.length,before+3);const n=d.notices.find(n=>n.title==='批量报名通知');assert.equal(n.sources.length,1);assert(n.sources[0].originalText.includes('\n\n保留段内空行。'));assert(n.summary.includes('报名表'));
    assert(d.notices.find(n=>n.title==='批量答辩安排').actions.some(a=>a.time==='2026-11-12T15:00'));
    assert(!d.notices.find(n=>n.title==='批量领证通知').dates.some(d=>d.value==='2026-11-09'));
    await page.screenshot({path:`${out}/batch-desktop.png`,fullPage:true});
    for(const separator of ['line','paragraph']){
      await page.getByLabel('批量分隔方式').selectOption(separator);await page.getByLabel('多项日程正文').fill(separator==='line'?'逐行事项甲\n逐行事项乙':'分段事项甲\n正文甲\n\n分段事项乙\n正文乙');
      await page.getByRole('button',{name:'保存 2 项日程并整理',exact:true}).click();await page.getByRole('heading',{name:'已保存 2 项日程'}).waitFor();await jobsDone();
    }
    assert.equal((await readDB()).notices.length,before+7);
  });
  await record('批量文件分别创建日程，非法文件与超限输入不造成部分导入',async()=>{
    await batch();let before=await readDB();
    await page.getByLabel('导入文件',{exact:true}).setInputFiles([textFile('批量一.txt','第一文件通知\n2026年11月9日提交材料'),textFile('批量二.txt','第二文件通知\n2026年11月12日领取材料')]);
    await page.getByRole('heading',{name:'已保存 2 项日程'}).waitFor();await jobsDone();assert.equal((await readDB()).notices.length,before.notices.length+2);
    const one=(await readDB()).notices.find(n=>n.title==='第一文件通知'),two=(await readDB()).notices.find(n=>n.title==='第二文件通知');assert.notEqual(one.id,two.id);assert.equal(one.sources.length,1);assert.equal(two.sources.length,1);
    before=await readDB();await page.getByLabel('导入文件',{exact:true}).setInputFiles([textFile('合法.txt','不能留下半批内容'),textFile('错误.doc','旧格式')]);await page.getByRole('alert').filter({hasText:'不支持旧版 .doc'}).waitFor();
    const after=await readDB();for(const key of ['notices','attachments','jobs'])assert.equal(after[key].length,before[key].length);
    await page.getByLabel('批量分隔方式').selectOption('line');await page.getByLabel('多项日程正文').fill(Array.from({length:51},(_,i)=>`第 ${i+1} 项日程`).join('\n'));
    assert(await page.getByRole('button',{name:'保存 51 项日程并整理',exact:true}).isDisabled());
  });
  await record('MCP 左侧入口可直达配置，桌面与窄屏布局无横向溢出',async()=>{
    await page.getByRole('navigation').getByRole('link',{name:'MCP 配置'}).click();await page.getByRole('heading',{name:'MCP 接入',exact:true}).waitFor();assert(page.url().endsWith('#mcp'));
    await page.screenshot({path:`${out}/mcp-desktop.png`,fullPage:true});await page.setViewportSize({width:390,height:844});
    for(const hash of ['import',`notice/${sampleId}`,'mcp']){
      await go(hash);assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1));
      if(hash.startsWith('notice/')){await page.evaluate(()=>scrollTo(0,900));const box=await page.getByRole('button',{name:'确认日程',exact:true}).boundingBox();assert(box.y>=0&&box.y+box.height<=844);}
      await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${out}/${hash.startsWith('notice/')?'detail':hash}-mobile.png`});
    }
  });
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
}catch(e){process.exitCode=1;console.error(e);}finally{
  await writeFile(`${out}/results.json`,JSON.stringify({date:new Date().toISOString(),browser:browserName,extensionVersion:runtime.extensionVersion,results,errors,offlineHTTPRequests:requests},null,2));
  await context.close();if(path.dirname(profile)===process.cwd()&&path.basename(profile).startsWith('.test-profile-workflow-'))try{rmSync(profile,{recursive:true,force:true});}catch{}
}
