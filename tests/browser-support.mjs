import {chromium} from 'playwright';
import {spawn,execSync} from 'node:child_process';
import path from 'node:path';
import {existsSync,readdirSync,rmSync,statSync} from 'node:fs';
import {readFile} from 'node:fs/promises';

export const channel=process.env.TEST_BROWSER||'chrome';
if(!['chrome','msedge'].includes(channel))throw Error('TEST_BROWSER must be chrome or msedge');
export const browserName=channel==='msedge'?'Microsoft Edge':'Google Chrome';
export const browserSlug=channel==='msedge'?'edge':'chrome';
export const outputDir=`test-results/${browserSlug}`;
export const versionPage=channel==='msedge'?'edge://version':'chrome://version';
// 每轮测试都会新建 .test-profile-*（Chromium/Edge 用户配置，几十 MB），泄漏会累积到数 GB。
// 启动时清扫超过 24h 的旧 profile：足够老即不可能有并发测试会话仍在使用。
export function cleanupStaleProfiles(maxAgeMs=24*60*60*1000) {
  const cutoff=Date.now()-maxAgeMs;let removed=0;
  try{for(const name of readdirSync('.')){
    if(!name.startsWith('.test-profile-'))continue;
    try{if(statSync(name).mtimeMs>cutoff)continue;rmSync(name,{recursive:true,force:true});removed++;}catch{}
  }}catch{}
  return removed;
}
export async function launchBrowser(profile,extra={}) {
  cleanupStaleProfiles();
  return chromium.launchPersistentContext(profile,{channel,headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging'],...extra});
}
export function browserExecutable() {
  const candidates=channel==='msedge'
    ?['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe']
    :['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'];
  for(const candidate of candidates)if(existsSync(candidate))return candidate;
  throw Error(`未找到 ${browserName} 可执行文件`);
}
let attachedPort=9800;
// 直接 spawn 浏览器并用 CDP 附加，贴近安装助手面对的真实形态（外部进程交接对新窗口的处理
// 在 Playwright launchPersistentContext 托管的实例上不可见，见 test-results/exp 调试记录）。
export async function launchAttachedBrowser(profile) {
  cleanupStaleProfiles();
  // 本地 CDP 调试端口绝不能走系统/环境代理：沙箱注入的 HTTPS_PROXY 会把 127.0.0.1 请求
// 转发到外部代理并返回 502。仅在附加启动这条链路里清理。
  for(const key of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'])delete process.env[key];
  process.env.NO_PROXY='127.0.0.1,localhost';
  const executable=browserExecutable();const port=attachedPort++;
  const child=spawn(executable,['--user-data-dir='+path.resolve(profile),'--no-first-run','--remote-debugging-port='+port,'--window-position=-20000,-20000','--window-size=1280,900','--enable-unsafe-extension-debugging'],{stdio:'ignore'});
  const endpoint='http://127.0.0.1:'+port;
  let browser;
  for(let attempt=0;attempt<3&&!browser;attempt++) {
    for(let i=0;i<100;i++){try{const response=await fetch(endpoint+'/json/version');if(response.ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,300));}
    try{browser=await chromium.connectOverCDP(endpoint);}catch{await new Promise(resolve=>setTimeout(resolve,2000));}
  }
  if(!browser){
    try{
      execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='${channel==='msedge'?'msedge':'chrome'}.exe'\\" | Where-Object { $_.CommandLine -like '*${path.resolve(profile).replace(/'/g,"''")}*' } | Select-Object ProcessId,CommandLine | ConvertTo-Json | Out-File -Encoding utf8 'test-results/exp/attach-fail.json'"`,{stdio:'pipe',timeout:30000});
    }catch{}
    throw Error('无法通过 CDP 附加到 '+browserName+'（'+endpoint+'）');
  }
  // connectOverCDP 的 browser.close() 只断开连接；CDP Browser.close 通常能优雅退出，
  // 但个别场景（如测试中被外部进程多次交接后）会失效，此时按调试端口定位真实主进程整树结束。
  const waitDead=async()=>{
    const deadline=Date.now()+10000;
    while(Date.now()<deadline){try{await fetch(endpoint+'/json/version');await new Promise(resolve=>setTimeout(resolve,300));}catch{return true;}}
    return false;
  };
  const close=async()=>{
    try{const cdp=await browser.newBrowserCDPSession();await cdp.send('Browser.close');}catch{}
    let dead=await waitDead();
    if(!dead) {
      try{execSync(`powershell -NoProfile -Command "$p=Get-CimInstance Win32_Process -Filter \\"Name='${channel==='msedge'?'msedge':'chrome'}.exe'\\" | Where-Object { $_.CommandLine -match '--remote-debugging-port=${port}\\b' -and $_.CommandLine -notmatch '--type=' }; if($p){taskkill /PID $($p.ProcessId) /T /F | Out-Null}"`,{stdio:'pipe',timeout:30000});}catch{}
      dead=await waitDead();
    }
    if(!dead)try{child.kill();}catch{}
    await new Promise(resolve=>setTimeout(resolve,600));
  };
  return {browser,context:browser.contexts()[0],child,endpoint,close};
}
export async function loadExtension(context,folder) {
  const cdp=await context.browser().newBrowserCDPSession();
  const {id}=await cdp.send('Extensions.loadUnpacked',{path:path.resolve(folder),enableInIncognito:false});
  const version=await cdp.send('Browser.getVersion');
  const manifest=JSON.parse(await readFile(path.join(folder,'manifest.json'),'utf8'));
  return {cdp,id,base:`chrome-extension://${id}`,browser:browserName,browserVersion:await context.browser().version(),extensionVersion:manifest.version,userAgent:version.userAgent};
}
let protocolId=100;
export async function connectPopup(cdp,base) {
  let info;
  for(let i=0;i<100;i++) {
    const {targetInfos}=await cdp.send('Target.getTargets',{filter:[{}]});
    info=targetInfos.find(t=>t.type==='page'&&t.url===base+'/popup.html');
    if(info)break;await new Promise(r=>setTimeout(r,100));
  }
  if(!info)throw Error(`${browserName} toolbar popup did not open`);
  const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:info.targetId,flatten:false});
  const command=async(method,params={})=>{
    const msgId=protocolId++;
    return new Promise((resolve,reject)=>{
      const finish=(error,result)=>{clearTimeout(timer);cdp.off('Target.receivedMessageFromTarget',listener);error?reject(error):resolve(result);};
      const timer=setTimeout(()=>finish(Error('Popup CDP command timed out')),10000);
      const listener=e=>{if(e.sessionId!==sessionId)return;const msg=JSON.parse(e.message);if(msg.id===msgId)finish(msg.error?Error(msg.error.message):undefined,msg.result);};
      cdp.on('Target.receivedMessageFromTarget',listener);
      cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id:msgId,method,params})}).catch(e=>finish(e));
    });
  };
  // A target URL exists before React mounts. Wait for a real button, including on Edge.
  const ready=await command('Runtime.evaluate',{expression:'(async()=>{for(let i=0;i<100;i++){if(document.querySelector("button"))return true;await new Promise(r=>setTimeout(r,50));}return false;})()',awaitPromise:true,returnByValue:true});
  if(!ready.result?.value)throw Error(`${browserName} popup UI failed to mount`);
  return command;
}
