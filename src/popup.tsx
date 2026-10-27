import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {captureVisiblePage} from './capture';
import './style.css';
function Popup(){const [message,setMessage]=useState('仅在你点击时读取当前可见网页。');const [busy,setBusy]=useState(false);const [duplicate,setDuplicate]=useState('');const [input,setInput]=useState<ReturnType<typeof captureVisiblePage>>();
  const open=(hash='')=>void chrome.runtime.sendMessage({type:'open',hash});
  const save=async(data:ReturnType<typeof captureVisiblePage>,force=false)=>{const result=await chrome.runtime.sendMessage({type:'save-capture',input:data,force});if(result.error)throw Error(result.error);if(result.duplicate){setDuplicate(result.duplicate);setInput(data);setMessage('这个网址已经收录，可打开原通知或另存。');}else{setMessage(data.text?'原文已保存，工作台正在整理候选。':'链接已保存；页面无可读取正文，请在工作台粘贴文字。');}};
  const capture=async()=>{setBusy(true);try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id||!/^https?:\/\//.test(tab.url||''))throw Error('此页面受浏览器保护。请打开普通网页，或到工作台粘贴文字/上传截图。');const results=await chrome.scripting.executeScript({target:{tabId:tab.id},func:captureVisiblePage});if(!results[0]?.result)throw Error('页面已变化或无法访问，请重试或粘贴文字');await save(results[0].result);}catch(e){setMessage(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
  return <div className="popup"><div className="brand"><img src="icons/48.png" alt=""/><div>校事笺<small>校园里的每件事，都有着落</small></div></div><button className="primary wide" disabled={busy} onClick={capture}>{busy?'正在收录…':'＋ 整理当前网页 / 选中文字'}</button><button className="wide" onClick={()=>open('#import')}>粘贴文字 · 截图 · 导入附件</button><button className="wide" onClick={()=>open()}>打开我的工作台 ↗</button><p role="status">{message}</p>{duplicate&&<div className="row"><button onClick={()=>open(`#notice/${duplicate}`)}>打开原通知</button><button onClick={()=>{if(input)void save(input,true).catch(e=>setMessage(e.message));}}>另存一份</button></div>}<small>本机存储 · 无账号 · 无 API 密钥</small></div>;
}
createRoot(document.getElementById('root')!).render(<Popup/>);
