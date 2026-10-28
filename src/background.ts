import { addSource, db } from './db';
import { safeURL, LIMITS } from './model';
import { DEFAULT_SETTINGS } from './settings';
import {bridgeRequest,startMcpBridge} from './mcp/bridge';
void startMcpBridge();
chrome.runtime.onStartup.addListener(()=>{void startMcpBridge();});
const open=async(hash='')=>chrome.tabs.create({url:chrome.runtime.getURL('dashboard.html')+hash});
chrome.runtime.onInstalled.addListener(details=>{
  void (async()=>{
    const saved=await chrome.storage.local.get(['settings','welcomeShown']);
    const firstWelcome=details.reason==='install'&&saved.welcomeShown!==true;
    await chrome.storage.local.set({settings:{...DEFAULT_SETTINGS,...(saved.settings as object||{})},...(firstWelcome?{welcomeShown:true}:{})});
    if(firstWelcome)await open('#welcome');
  })();
});
chrome.runtime.onMessage.addListener((msg,_sender,respond)=>{
  if(typeof msg?.type==='string'&&msg.type.startsWith('mcp-')){
    void bridgeRequest(msg,_sender).then(respond,e=>respond({error:e instanceof Error?e.message:'MCP 操作失败'}));return true;
  }
  if(msg?.type==='open'){void open(msg.hash||'').then(()=>respond({ok:true}));return true;}
  if(msg?.type==='save-capture') {
    void(async()=>{try {
      const input=msg.input;if(typeof input?.text!=='string'||input.text.length>LIMITS.textChars||!safeURL(input.url))throw Error('网页来源或正文不合法');
      if(!msg.force){const existing=(await db.notices.toArray()).find(n=>n.sources.some(s=>s.url===input.url));if(existing){respond({duplicate:existing.id});return;}}
      const result=await addSource({kind:'web',name:String(input.title||'网页通知').slice(0,1000),titleHint:String(input.title||'').slice(0,1000),text:input.text,url:input.url});
      await open(`#notice/${result.noticeId}`);respond({ok:true});
    }catch(e){respond({error:e instanceof Error?e.message:String(e)});}})();return true;
  }
});
