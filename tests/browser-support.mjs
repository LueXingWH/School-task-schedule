import {chromium} from 'playwright';
import path from 'node:path';
import {readFile} from 'node:fs/promises';

export const channel=process.env.TEST_BROWSER||'chrome';
if(!['chrome','msedge'].includes(channel))throw Error('TEST_BROWSER must be chrome or msedge');
export const browserName=channel==='msedge'?'Microsoft Edge':'Google Chrome';
export const browserSlug=channel==='msedge'?'edge':'chrome';
export const outputDir=`test-results/${browserSlug}`;
export const versionPage=channel==='msedge'?'edge://version':'chrome://version';
export async function launchBrowser(profile,extra={}) {
  return chromium.launchPersistentContext(profile,{channel,headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging'],...extra});
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
