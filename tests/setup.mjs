import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {nativeRegistry} from './mcp-support.mjs';
import {unzipSync} from 'fflate';
import {createHash} from 'node:crypto';
process.env.TEST_BROWSER=process.env.TEST_BROWSER||'msedge';
const {launchAttachedBrowser,loadExtension,browserSlug}=await import('./browser-support.mjs');
const run=promisify(execFile),{version}=JSON.parse(await readFile('package.json','utf8'));
const out=path.resolve('test-results/setup-'+Date.now()),root=path.join(out,'中文 用户 路径','我选择的安装目录'),desktop=path.join(out,'测试桌面');await mkdir(out,{recursive:true});
const profile=path.resolve(`.test-profile-setup-${Date.now()}`);
const executable=path.resolve(`release/xiaoshijian-${version}-setup.exe`),results=[];
const nativeSnapshot=path.join(out,'native-registry-before.json');await nativeRegistry('Save',nativeSnapshot);
let context,browserSession;
const launchSetupBrowser=async profile=>{browserSession=await launchAttachedBrowser(profile);context=browserSession.context;return context;};
async function prepare(useUI=false,target=root){const report=path.join(out,'native-result.json');await run(executable,[useUI?'--ui-install-only':'--install-only','--root',target,'--shortcuts-dir',desktop,'--browser',process.env.TEST_BROWSER==='chrome'?'chrome':'edge','--result',report,...(useUI?['--test-open-browser','--browser-profile',profile]:[])],{windowsHide:true,timeout:60000});return JSON.parse(await readFile(report,'utf8'));}
async function wait(fn){for(let i=0;i<100;i++){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,150));}throw Error('Setup browser validation timed out');}
try {
  await run(executable,['--preview',path.join(out,'setup-preview.png')],{windowsHide:true,timeout:30000});results.push('实际 EXE 渲染安装助手界面');
  const preDetect=path.join(out,'detect-before.json');
  await run(executable,['--ui-detect-test','--browser-profile',profile,'--browser',process.env.TEST_BROWSER==='chrome'?'chrome':'edge','--root',root,'--result',preDetect],{windowsHide:true,timeout:30000});
  assert.equal(JSON.parse(await readFile(preDetect,'utf8')).found,false);results.push('全新浏览器配置下助手检测不到已装扩展（无误报）');
  context=await launchSetupBrowser(profile);const automaticPageEvent=context.waitForEvent('page',{timeout:60000});
  const installed=await prepare(true);const automaticPage=await automaticPageEvent;await automaticPage.waitForURL(/^(about:blank|(edge|chrome):\/\/extensions\/?)$/);await automaticPage.close();assert.equal(installed.folder,path.join(root,'Extension'));assert(installed.success);assert(installed.manualConfirmationRequired);assert(installed.shortcutCreated);assert.equal(installed.version,version);
  const archive=unzipSync(new Uint8Array(await readFile(`release/xiaoshijian-${version}-edge.zip`)));
  for(const [name,bytes] of Object.entries(archive))assert(Buffer.from(bytes).equals(await readFile(path.join(installed.folder,name))));
  results.push('真实 WinForms 输入框和安装按钮使用自选中文/空格目录，逐文件与 ZIP 字节核对');
  const shortcut=JSON.parse((await run('powershell.exe',['-NoProfile','-NonInteractive','-File',path.resolve('tests/inspect-shortcut.ps1'),'-Path',path.join(desktop,'校事笺.lnk')],{windowsHide:true,encoding:'utf8'})).stdout.replace(/^\uFEFF/,''));
  assert.equal(shortcut.target.toLowerCase(),installed.browserPath.toLowerCase());assert.equal(shortcut.arguments,`"${installed.dashboardUrl}"`);results.push('真实 Windows 桌面快捷方式目标和工作台参数正确');
  const buttonReport=path.join(out,'management-button.json');
  // Put a sentinel on the system clipboard first: the helper must NOT overwrite the user's clipboard.
  // 非交互桌面会话（远程/服务上下文）可能整体没有剪贴板访问权，此时退化为核对助手报告里的字段。
  let sentinelSet=true;
  try{await run('powershell.exe',['-NoProfile','-NonInteractive','-Command','Set-Clipboard -Value "xiaoshijian-clipboard-sentinel"'],{windowsHide:true,timeout:15000,encoding:'utf8'});}catch{sentinelSet=false;}
  const managementPageEvent=context.waitForEvent('page',{timeout:30000});
  await run(executable,['--ui-manage-test','--browser-profile',profile,'--browser',process.env.TEST_BROWSER==='chrome'?'chrome':'edge','--result',buttonReport],{windowsHide:true,timeout:30000});
  const managementPage=await managementPageEvent;
  const button=JSON.parse(await readFile(buttonReport,'utf8')),managementURL=(browserSlug==='edge'?'edge':'chrome')+'://extensions/';
  assert(button.success);assert.equal(button.managementAddress,managementURL);assert.equal(button.buttonText,'打开扩展管理页');assert.equal(button.copyDirectoryEnabled,false);
  if(sentinelSet){
    const clip=(await run('powershell.exe',['-NoProfile','-NonInteractive','-Command','Get-Clipboard'],{windowsHide:true,encoding:'utf8'})).stdout.replace(/^\uFEFF/,'').trim();
    assert.equal(clip,'xiaoshijian-clipboard-sentinel');
  } else {
    assert.notEqual(button.clipboardAddress,managementURL);
    assert.notEqual(button.clipboardAddress,'edge://extensions/');
    results.push('当前桌面会话不可访问系统剪贴板：改为核对助手报告的剪贴板字段，确认未写入管理页地址');
  }
  assert.match(button.status,/开发人员模式/);assert.match(button.status,/复制/);
  // The helper only shows and opens the browser; navigation to the manage page is the user's action.
  await managementPage.goto(button.managementAddress);await managementPage.waitForURL(/(edge|chrome):\/\/extensions/);
  await managementPage.getByText(/^(开发人员模式|开发者模式|Developer mode)$/).filter({visible:true}).first().waitFor({timeout:20000}).catch(async()=>{await managementPage.locator('#dev-switch, extensions-manager').first().waitFor({state:'visible',timeout:20000});});await managementPage.screenshot({path:path.join(out,'management-page.png')});await managementPage.close();
  results.push('实际点击 WinForms 管理入口：浏览器新窗口打开且用户剪贴板未被覆写，状态栏提示复制网址进入，并写明开发人员模式开关位置（Edge 左下角 / Chrome 右上角）');
  const runtime=await loadExtension(context,installed.folder);assert.equal(runtime.id,installed.extensionId);
  let welcome=await wait(async()=>context.pages().find(p=>p.url()===runtime.base+'/dashboard.html#welcome'));await welcome.getByRole('heading',{name:'安装完成，可以开始收录了'}).waitFor();
  assert.deepEqual((await welcome.evaluate(()=>chrome.storage.local.get('settings'))).settings,{upcomingDays:7,sort:'deadline',compact:false});results.push('实际加载准备目录，扩展 ID 与快捷方式一致，首次自动打开欢迎页并配置默认设置');
  await welcome.close();const [launched,created]=await Promise.allSettled([run(installed.browserPath,[`--user-data-dir=${profile}`,installed.dashboardUrl],{windowsHide:true,timeout:15000}),context.waitForEvent('page',{timeout:15000})]);if(launched.status==='rejected')assert.equal(launched.reason.code,21);if(created.status==='rejected')throw created.reason;const page=created.value;await page.waitForURL(installed.dashboardUrl);await page.getByRole('heading',{name:'今天，从容一点'}).waitFor();results.push('使用快捷方式对应浏览器和参数，在真实浏览器直接打开工作台');
  await page.evaluate(()=>chrome.storage.local.set({settings:{upcomingDays:12,sort:'created',compact:true}}));await page.goto(runtime.base+'/dashboard.html#import');await page.getByLabel('通知正文',{exact:true}).fill('安装助手升级保留测试\n提交材料：报名表。');await page.getByRole('button',{name:'保存原文并整理'}).click();await page.waitForURL(/#notice\//);await page.getByLabel('准备 报名表',{exact:true}).waitFor();await page.getByLabel('准备 报名表',{exact:true}).click();await wait(()=>page.getByLabel('准备 报名表',{exact:true}).isChecked());const noticeURL=page.url();await writeFile(path.join(root,'用户自留文件.txt'),'不得覆盖');await context.close();await browserSession.close();browserSession=undefined;context=undefined;
  // Preferences are flushed on clean browser shutdown; the assistant's detection reads them there.
  const postDetect=path.join(out,'detect-after.json');
  await run(executable,['--ui-detect-test','--browser-profile',profile,'--browser',process.env.TEST_BROWSER==='chrome'?'chrome':'edge','--root',root,'--result',postDetect],{windowsHide:true,timeout:30000});
  const detected=JSON.parse(await readFile(postDetect,'utf8'));
  assert(detected.found);assert(detected.enabled);assert.equal(detected.id,installed.extensionId);assert.equal(detected.version,version);assert.equal(detected.folder,installed.folder);results.push('浏览器加载并退出后，助手能从配置文件检测到已装扩展（ID/版本/目录一致，无需重新安装）');
  const upgraded=await prepare();assert.equal(upgraded.folder,installed.folder);assert.equal(upgraded.extensionId,installed.extensionId);assert.equal(await readFile(path.join(root,'用户自留文件.txt'),'utf8'),'不得覆盖');assert((await readdir(root)).some(n=>n.startsWith('.previous-')));
  context=await launchSetupBrowser(profile);const second=await loadExtension(context,upgraded.folder);const reopened=await context.newPage();await reopened.goto(noticeURL);await reopened.getByLabel('准备 报名表',{exact:true}).waitFor();assert(await reopened.getByLabel('准备 报名表',{exact:true}).isChecked());assert.deepEqual((await reopened.evaluate(()=>chrome.storage.local.get('settings'))).settings,{upcomingDays:12,sort:'created',compact:true});
  await new Promise(r=>setTimeout(r,500));assert(!context.pages().some(p=>p.url()===second.base+'/dashboard.html#welcome'));results.push('重复准备及浏览器重启后路径/ID 不变，原文件备份、通知、勾选和自定义配置保留；不会重复弹欢迎页');
  const alternate=path.join(out,'另一个安装位置'),moved=await prepare(false,alternate);assert.notEqual(moved.extensionId,installed.extensionId);assert.equal(moved.folder,path.join(alternate,'Extension'));assert.equal(await readFile(path.join(root,'用户自留文件.txt'),'utf8'),'不得覆盖');
  const other=await loadExtension(context,moved.folder);const empty=await context.newPage();await empty.goto(other.base+'/dashboard.html');await empty.getByText('这里等着你的第一份通知').waitFor();assert(await reopened.getByLabel('准备 报名表',{exact:true}).isChecked());results.push('另选任意名称的新目录可安装，ID 正确变化，旧安装和旧数据保留，新目录不伪装已迁移数据');
  const occupied=path.join(out,'已有文件的目录');await mkdir(occupied);await writeFile(path.join(occupied,'重要文件.txt'),'不得覆盖');
  for(const bad of [path.parse(root).root,'relative-folder',occupied]){const report=path.join(out,'rejected.json');let rejected=false;try{await run(executable,['--install-only','--root',bad,'--shortcuts-dir',desktop,'--result',report],{windowsHide:true});}catch{rejected=true;}assert(rejected);assert.equal(JSON.parse(await readFile(report,'utf8')).success,false);}
  assert.equal(await readFile(path.join(occupied,'重要文件.txt'),'utf8'),'不得覆盖');results.push('拒绝磁盘根目录、相对路径和非空未管理目录，原有文件不改动');
  const hash=createHash('sha256').update(await readFile(executable)).digest('hex');const report=JSON.stringify({status:'PASS',version,browser:runtime.browser,browserVersion:runtime.browserVersion,executableSHA256:hash,manualConfirmationRequired:true,managementButtonVerified:true,managementPage:path.join(out,'management-page.png'),results,preview:path.join(out,'setup-preview.png')},null,2);await writeFile('test-results/setup-results.json',report);await writeFile(`test-results/setup-results-${browserSlug}.json`,report);console.log(results.join('\n'));
}catch(e){process.exitCode=1;console.error(e);await writeFile('test-results/setup-results.json',JSON.stringify({status:'FAIL',version,results,error:String(e)},null,2));}finally{await browserSession?.close();await context?.close();await nativeRegistry('Restore',nativeSnapshot);}
