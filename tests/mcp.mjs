import {launchBrowser,loadExtension,browserName,browserSlug,outputDir} from './browser-support.mjs';
import {mcpClient,nativeRegistry} from './mcp-support.mjs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {rmSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {unzipSync,strFromU8} from 'fflate';
import assert from 'node:assert/strict';
import path from 'node:path';

const {version}=JSON.parse(await readFile('package.json','utf8'));
const run=promisify(execFile),out=`${outputDir}/mcp`;await mkdir(out,{recursive:true});
const profile=`.test-profile-mcp-${browserSlug}-${Date.now()}`,snapshot=`${out}/native-registry-before.json`;
await nativeRegistry('Save',snapshot);
let context,page,runtime,config,installed;const clients=[],errors=[],requests=[],results=[];
const wait=async(fn,timeout=30000)=>{const until=Date.now()+timeout;while(Date.now()<until){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,150));}throw Error('MCP browser state timed out');};
const readDB=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const q=indexedDB.open('xiaoshijian');q.onerror=()=>reject(q.error);q.onsuccess=()=>{const d=q.result,t=d.transaction(['notices','mcpRequests']),value={version:d.version};for(const key of ['notices','mcpRequests']){const r=t.objectStore(key).getAll();r.onsuccess=()=>value[key]=r.result;}t.oncomplete=()=>{d.close();resolve(value);};};}));
const client=async(cfg=config)=>{const c=mcpClient(cfg);clients.push(c);const initialized=await c.initialize();assert.equal(initialized.serverInfo.version,version);return c;};
const tool=async(c,name,args={})=>{const value=await c.call(name,args);assert(!value.isError,value.content?.[0]?.text);return value.structuredContent;};
const record=async(name,fn)=>{const start=Date.now();try{await fn();results.push({name,status:'PASS',ms:Date.now()-start});console.log('PASS',name);}catch(e){results.push({name,status:'FAIL',error:String(e)});throw e;}};
const ready=()=>wait(async()=>await page.locator('.mcp-panel .status').innerText()==='已连接');
const getConfig=async()=>{await page.getByRole('button',{name:'生成 MCP 配置',exact:true}).click();return JSON.parse(await page.getByLabel('MCP 客户端配置').inputValue()).mcpServers.xiaoshijian;};
let agent,day,request,noticeId;
try{
  await record('实际安装助手放置并注册随包 MCP EXE（中文路径）',async()=>{
    const report=path.resolve(`${out}/installed.json`);
    await run(path.resolve(`release/xiaoshijian-${version}-setup.exe`),['--install-only','--root',path.resolve(`${out}/安装目录`),'--shortcuts-dir',path.resolve(`${out}/测试桌面`),'--browser',browserSlug==='edge'?'edge':'chrome','--result',report],{windowsHide:true,timeout:60000});
    installed=JSON.parse(await readFile(report,'utf8'));assert(installed.success&&installed.mcpRegistered);assert.equal(installed.version,version);assert.equal(path.resolve(installed.mcpCommand),path.resolve(installed.folder,'bridge/Xiaoshijian.Mcp.exe'));
    assert((await readFile(installed.mcpCommand)).equals(await readFile('dist/bridge/Xiaoshijian.Mcp.exe')));
  });
  context=await launchBrowser(profile,{viewport:{width:1440,height:1050},acceptDownloads:true});runtime=await loadExtension(context,installed.folder);
  context.on('page',p=>p.on('pageerror',e=>errors.push(String(e))));context.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await context.setOffline(true);for(const p of context.pages())if(p.url().startsWith(runtime.base))await p.close();
  page=await context.newPage();await page.goto(`${runtime.base}/icons/48.png`);
  await record('真实 IndexedDB v1 升级到 v3，旧日程保留',async()=>{
    await page.evaluate(()=>new Promise((resolve,reject)=>{const drop=indexedDB.deleteDatabase('xiaoshijian');drop.onerror=()=>reject(drop.error);drop.onblocked=()=>reject(Error('Old DB still in use'));drop.onsuccess=()=>{
      const q=indexedDB.open('xiaoshijian',10);q.onupgradeneeded=()=>{const d=q.result;for(const [name,indexes] of Object.entries({notices:['life','createdAt','updatedAt'],attachments:['noticeId','sourceId'],jobs:['noticeId','sourceId','state']})){const s=d.createObjectStore(name,{keyPath:'id'});for(const index of indexes)s.createIndex(index,index);}};
      q.onsuccess=()=>{const d=q.result,t=d.transaction('notices','readwrite');t.objectStore('notices').put({id:'legacy',title:'旧版保留任务',titleEdited:true,life:'active',deadlineEdited:true,createdAt:1,updatedAt:1,sources:[],dates:[],materials:[],dismissedMaterials:[],tasks:[{id:'legacy-task',text:'旧版保留任务',date:'2026-11-01',done:true}]});t.oncomplete=()=>{d.close();resolve(true);};};q.onerror=()=>reject(q.error);
    };}));
    await page.goto(`${runtime.base}/dashboard.html#home`);await page.getByRole('navigation').getByRole('link',{name:'MCP 配置'}).click();await page.getByRole('heading',{name:'MCP 接入',exact:true}).waitFor();
    await wait(async()=>(await readDB()).version===30);assert((await readDB()).notices.some(n=>n.id==='legacy'&&n.tasks[0].done));
    assert(!await page.getByLabel('启用 MCP 接入').isChecked());
  });
  await record('真实 EXE 注册与浏览器原生连接，左侧入口生成 MCP 配置',async()=>{
    await page.getByLabel('启用 MCP 接入').click();await ready();
    await page.screenshot({path:`${out}/connected.png`,fullPage:true});config=await getConfig();assert.equal(path.resolve(config.command),path.resolve(installed.mcpCommand));
    const registration=await run(installed.mcpCommand,['--register','--extension-id',runtime.id,'--browser',browserSlug==='edge'?'edge':'chrome','--registration-dir',path.resolve(`${out}/registration`)],{windowsHide:true,timeout:15000});assert(JSON.parse(registration.stdout).registered);
    assert.match(config.env.XIAOSHIJIAN_MCP_TOKEN,/^[a-f0-9]{64}$/);
    const probe=mcpClient(config);clients.push(probe);assert.equal((await probe.rpc('tools/list',{})).error.code,-32000);await probe.close();
    agent=await client();const tools=(await agent.rpc('tools/list',{})).result.tools;assert.deepEqual(tools.map(t=>t.name),['add_schedule','list_schedules']);
    assert.equal((await agent.rpc('not_a_method',{})).error.code,-32601);
  });
  await record('MCP 添加日程立即落库，进入今日清单，重复请求不重建',async()=>{
    day=await page.evaluate(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;});
    request={request_id:'acceptance-create',title:'MCP 真实添加的答辩准备',date:day,time:'18:30',notes:'带上原型和报名资料'};
    const added=await tool(agent,'add_schedule',request);assert(added.created);noticeId=added.schedule.noticeId;
    const retry=await tool(agent,'add_schedule',request);assert(!retry.created);assert.equal(retry.schedule.id,added.schedule.id);
    const n=(await readDB()).notices.find(n=>n.id===noticeId);assert.equal(n.tasks[0].time,'18:30');assert.equal(n.tasks[0].agent.client,'xiaoshijian-acceptance');assert(!n.deadline);
    await page.goto(`${runtime.base}/dashboard.html#home`);await page.getByText(request.title,{exact:true}).first().waitFor();await page.screenshot({path:`${out}/schedule-added.png`,fullPage:true});
  });
  await record('工作台关闭仍可通过原生通道添加，多客户端并发幂等',async()=>{
    await page.close();const second=await client();
    const args={request_id:'concurrent-create',title:'关闭工作台后添加的日程',date:day};
    const values=await Promise.all([tool(agent,'add_schedule',args),tool(second,'add_schedule',args)]);assert.equal(values.filter(v=>v.created).length,1);assert.equal(values[0].schedule.id,values[1].schedule.id);
    page=await context.newPage();await page.goto(`${runtime.base}/dashboard.html#home`);await page.getByText(args.title,{exact:true}).first().waitFor();
    assert.equal((await readDB()).notices.filter(n=>n.title===args.title).length,1);
  });
  await record('无效参数、同 ID 不同内容、非法日期不会写入',async()=>{
    const before=(await readDB()).notices.length;
    for(const args of [{...request,title:'同 ID 换内容'},{...request,request_id:'bad-date',date:'2026-02-30'},{...request,request_id:'bad-time',time:'29:00'},{...request,request_id:'bad-field',unknown:true}])assert((await agent.call('add_schedule',args)).isError);
    assert.equal((await readDB()).notices.length,before);assert((await agent.call('list_schedules',{limit:101})).isError);
    const list=await tool(agent,'list_schedules',{date_from:day,date_to:day});assert.equal(list.items.length,2);assert(list.items.every(t=>t.date===day));assert(!JSON.stringify(list).includes('originalText'));
  });
  await record('任务人工修改和勾选保留，查询过滤完成项',async()=>{
    await page.goto(`${runtime.base}/dashboard.html#notice/${noticeId}`);await page.getByLabel('任务内容',{exact:true}).fill('我修改后的答辩准备');await page.getByLabel('任务日期',{exact:true}).focus();
    await page.getByLabel('完成任务 我修改后的答辩准备',{exact:true}).click();await wait(async()=>(await readDB()).notices.find(n=>n.id===noticeId).tasks[0].done);
    const replay=await tool(agent,'add_schedule',request);assert(!replay.created);assert.equal(replay.schedule.title,'我修改后的答辩准备');assert(replay.schedule.done);
    const list=await tool(agent,'list_schedules',{});assert(!list.items.some(t=>t.noticeId===noticeId));
    assert((await tool(agent,'list_schedules',{include_done:true})).items.some(t=>t.noticeId===noticeId&&t.done));
  });
  await record('备份恢复保留 agent 来源与请求身份，连接口令不进入备份',async()=>{
    await page.goto(`${runtime.base}/dashboard.html#settings`);const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出完整备份 ZIP'}).click();const file=path.resolve(`${out}/roundtrip.zip`);await (await download).saveAs(file);
    const data=strFromU8(unzipSync(new Uint8Array(await readFile(file)))['data.json']);assert(!data.includes(config.env.XIAOSHIJIAN_MCP_TOKEN));assert(data.includes('xiaoshijian-acceptance'));
    const before=(await readDB()).notices.length;await page.getByRole('button',{name:'清除全部数据…',exact:true}).click();await page.getByLabel('清除确认文字').fill('清除校事笺');await page.getByRole('button',{name:'确认清除',exact:true}).click();await wait(async()=>(await readDB()).notices.length===0);
    await page.getByLabel('恢复备份文件').setInputFiles(file);await page.getByRole('button',{name:'确认合并恢复'}).click();await wait(async()=>(await readDB()).notices.length===before);
    const restored=await tool(agent,'add_schedule',request);assert(!restored.created);assert.notEqual(restored.schedule.noticeId,noticeId);assert(restored.schedule.done);noticeId=restored.schedule.noticeId;
    assert.equal((await readDB()).notices.length,before);
  });
  await record('只有工作台能读取配置，关闭接入和旧口令不能调用',async()=>{
    await page.goto(`${runtime.base}/dashboard.html#mcp`);
    const popup=await context.newPage();await popup.goto(`${runtime.base}/popup.html`);const denied=await popup.evaluate(()=>chrome.runtime.sendMessage({type:'mcp-config'}));assert(denied.error.includes('仅允许工作台'));await popup.close();
    await page.getByLabel('启用 MCP 接入').click();await wait(async()=>await page.locator('.mcp-panel .status').innerText()==='已关闭');assert((await agent.call('list_schedules',{})).isError);
    await page.getByLabel('启用 MCP 接入').click();await ready();const next=await getConfig();assert.notEqual(next.env.XIAOSHIJIAN_MCP_TOKEN,config.env.XIAOSHIJIAN_MCP_TOKEN);assert((await agent.call('list_schedules',{})).isError);
    const bad=await client({...next,env:{XIAOSHIJIAN_MCP_TOKEN:'0'.repeat(64)}});assert((await bad.call('list_schedules',{})).isError);
    config=next;agent=await client();assert((await tool(agent,'list_schedules',{})).items.length>0);
  });
  await record('删除日程后的旧请求不会将它复活',async()=>{
    await page.goto(`${runtime.base}/dashboard.html#notice/${noticeId}`);await page.getByRole('button',{name:'删除通知与关联文件',exact:true}).click();await page.getByRole('button',{name:'确认删除',exact:true}).click();await wait(async()=>!(await readDB()).notices.some(n=>n.id===noticeId));
    const response=await agent.call('add_schedule',request);assert(response.isError);assert(response.content[0].text.includes('已删除'));
  });
  await record('浏览器退出后返回连接错误，不伪装为已执行',async()=>{
    await context.close();context=undefined;const result=await agent.call('list_schedules',{});assert(result.isError);
  });
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
}catch(e){process.exitCode=1;console.error(e);}finally{
  for(const c of clients)await c.close();await context?.close();await nativeRegistry('Restore',snapshot);
  await writeFile(`${out}/results.json`,JSON.stringify({date:new Date().toISOString(),browser:browserName,extensionVersion:runtime?.extensionVersion,results,errors,offlineHTTPRequests:requests},null,2));
  const cleanup=path.resolve(profile);if(path.dirname(cleanup)===process.cwd()&&path.basename(cleanup).startsWith('.test-profile-mcp-'))try{rmSync(cleanup,{recursive:true,force:true});}catch{}
}
