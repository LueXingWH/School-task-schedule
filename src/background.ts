import { addSource, db } from './db';
import { safeURL, LIMITS } from './model';
const open=async(hash='')=>chrome.tabs.create({url:chrome.runtime.getURL('dashboard.html')+hash});
chrome.runtime.onMessage.addListener((msg,_sender,respond)=>{
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
