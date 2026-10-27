import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {unzipSync} from 'fflate';
import {createHash} from 'node:crypto';
process.env.TEST_BROWSER=process.env.TEST_BROWSER||'msedge';
const {launchBrowser,loadExtension}=await import('./browser-support.mjs');
const run=promisify(execFile),{version}=JSON.parse(await readFile('package.json','utf8'));
const out=path.resolve('test-results/setup-'+Date.now()),root=path.join(out,'中文 用户 路径','Xiaoshijian'),desktop=path.join(out,'测试桌面');await mkdir(out,{recursive:true});
const executable=path.resolve(`release/xiaoshijian-${version}-setup.exe`),results=[];
let context;
const launchSetupBrowser=profile=>launchBrowser(profile,{headless:false,args:['--enable-unsafe-extension-debugging','--window-position=-20000,-20000']});
async function prepare(){const report=path.join(out,'native-result.json');await run(executable,['--install-only','--root',root,'--shortcuts-dir',desktop,'--browser',process.env.TEST_BROWSER==='chrome'?'chrome':'edge','--result',report],{windowsHide:true,timeout:60000});return JSON.parse(await readFile(report,'utf8'));}
async function wait(fn){for(let i=0;i<100;i++){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,150));}throw Error('Setup browser validation timed out');}
try {
  await run(executable,['--preview',path.join(out,'setup-preview.png')],{windowsHide:true,timeout:30000});results.push('实际 EXE 渲染安装助手界面');
  const installed=await prepare();assert(installed.success);assert(installed.manualConfirmationRequired);assert(installed.shortcutCreated);assert.equal(installed.version,version);
  const archive=unzipSync(new Uint8Array(await readFile(`release/xiaoshijian-${version}-edge.zip`)));
  for(const [name,bytes] of Object.entries(archive))assert(Buffer.from(bytes).equals(await readFile(path.join(installed.folder,name))));
  results.push('真实 EXE 在含中文和空格的路径准备全部扩展文件，逐文件与 ZIP 字节核对');
  const shortcut=JSON.parse((await run('powershell.exe',['-NoProfile','-NonInteractive','-File',path.resolve('tests/inspect-shortcut.ps1'),'-Path',path.join(desktop,'校事笺.lnk')],{windowsHide:true,encoding:'utf8'})).stdout.replace(/^\uFEFF/,''));
  assert.equal(shortcut.target.toLowerCase(),installed.browserPath.toLowerCase());assert.equal(shortcut.arguments,`"${installed.dashboardUrl}"`);results.push('真实 Windows 桌面快捷方式目标和工作台参数正确');
  const profile=path.resolve(`.test-profile-setup-${Date.now()}`);context=await launchSetupBrowser(profile);const runtime=await loadExtension(context,installed.folder);assert.equal(runtime.id,installed.extensionId);
  let welcome=await wait(async()=>context.pages().find(p=>p.url()===runtime.base+'/dashboard.html#welcome'));await welcome.getByRole('heading',{name:'安装完成，可以开始收录了'}).waitFor();
  assert.deepEqual((await welcome.evaluate(()=>chrome.storage.local.get('settings'))).settings,{upcomingDays:7,sort:'deadline',compact:false});results.push('实际加载准备目录，扩展 ID 与快捷方式一致，首次自动打开欢迎页并配置默认设置');
  await welcome.close();const [launched,created]=await Promise.allSettled([run(installed.browserPath,[`--user-data-dir=${profile}`,installed.dashboardUrl],{windowsHide:true,timeout:15000}),context.waitForEvent('page',{timeout:15000})]);if(launched.status==='rejected')assert.equal(launched.reason.code,21);if(created.status==='rejected')throw created.reason;const page=created.value;await page.waitForURL(installed.dashboardUrl);await page.getByRole('heading',{name:'今天，从容一点'}).waitFor();results.push('使用快捷方式对应浏览器和参数，在真实浏览器直接打开工作台');
  await page.evaluate(()=>chrome.storage.local.set({settings:{upcomingDays:12,sort:'created',compact:true}}));await page.goto(runtime.base+'/dashboard.html#import');await page.getByLabel('通知正文',{exact:true}).fill('安装助手升级保留测试\n提交材料：报名表。');await page.getByRole('button',{name:'保存原文并整理'}).click();await page.waitForURL(/#notice\//);await page.getByLabel('准备 报名表',{exact:true}).waitFor();await page.getByLabel('准备 报名表',{exact:true}).click();await wait(()=>page.getByLabel('准备 报名表',{exact:true}).isChecked());const noticeURL=page.url();await writeFile(path.join(root,'用户自留文件.txt'),'不得覆盖');await context.close();context=undefined;
  const upgraded=await prepare();assert.equal(upgraded.folder,installed.folder);assert.equal(upgraded.extensionId,installed.extensionId);assert.equal(await readFile(path.join(root,'用户自留文件.txt'),'utf8'),'不得覆盖');assert((await readdir(root)).some(n=>n.startsWith('.previous-')));
  context=await launchSetupBrowser(profile);const second=await loadExtension(context,upgraded.folder);const reopened=await context.newPage();await reopened.goto(noticeURL);await reopened.getByLabel('准备 报名表',{exact:true}).waitFor();assert(await reopened.getByLabel('准备 报名表',{exact:true}).isChecked());assert.deepEqual((await reopened.evaluate(()=>chrome.storage.local.get('settings'))).settings,{upcomingDays:12,sort:'created',compact:true});
  await new Promise(r=>setTimeout(r,500));assert(!context.pages().some(p=>p.url()===second.base+'/dashboard.html#welcome'));results.push('重复准备及浏览器重启后路径/ID 不变，原文件备份、通知、勾选和自定义配置保留；不会重复弹欢迎页');
  const bad=path.join(out,'不得写入的目录'),report=path.join(out,'rejected.json');let rejected=false;try{await run(executable,['--install-only','--root',bad,'--shortcuts-dir',desktop,'--result',report],{windowsHide:true});}catch{rejected=true;}assert(rejected);assert.equal(JSON.parse(await readFile(report,'utf8')).success,false);results.push('拒绝非项目命名目录，原有安装仍保留');
  const hash=createHash('sha256').update(await readFile(executable)).digest('hex');await writeFile('test-results/setup-results.json',JSON.stringify({status:'PASS',version,browser:runtime.browser,browserVersion:runtime.browserVersion,executableSHA256:hash,manualConfirmationRequired:true,results,preview:path.join(out,'setup-preview.png')},null,2));console.log(results.join('\n'));
}catch(e){process.exitCode=1;console.error(e);await writeFile('test-results/setup-results.json',JSON.stringify({status:'FAIL',version,results,error:String(e)},null,2));}finally{await context?.close();}
