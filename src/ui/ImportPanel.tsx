import React,{useState} from 'react';
import {addSource} from '../db';
import {LIMITS,type Notice,type Source,safeURL} from '../model';
import {daysLabel,materialStats} from '../schedule';

export function ImportPanel({notices,initialNoticeId=''}:{notices:Notice[];initialNoticeId?:string}) {
  const [text,setText]=useState('');
  const [url,setURL]=useState('');
  const [attachTo,setAttachTo]=useState(initialNoticeId);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [drag,setDrag]=useState(false);

  const fileImport=async(files:File[])=>{
    setBusy(true);let last='';
    try{
      for(const file of files){
        const ext=file.name.split('.').pop()?.toLowerCase();
        let kind:Source['kind'];
        if(['png','jpg','jpeg','webp'].includes(ext||''))kind='image';
        else if(ext==='pdf')kind='pdf';
        else if(ext==='docx')kind='docx';
        else if(ext==='doc')throw Error('不支持旧版 .doc。请在 Word/WPS 另存为 .docx 或 PDF。');
        else throw Error('仅支持 PNG/JPEG/WebP、PDF、DOCX');
        if(file.size>(kind==='image'?LIMITS.imageBytes:LIMITS.fileBytes))throw Error(kind==='image'?'图片不能超过 10 MB':'单个附件不能超过 20 MB');
        const result=await addSource({kind,name:file.name,file,noticeId:attachTo||undefined});
        last=result.noticeId;
      }
      if(last)location.hash=`notice/${last}`;
    }catch(e){setMessage(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  };

  const paste=(e:React.ClipboardEvent)=>{
    const files=Array.from(e.clipboardData.files);
    if(files.length){e.preventDefault();void fileImport(files);}
  };

  const save=async()=>{
    setBusy(true);
    try{
      if(!text.trim()&&!url.trim())throw Error('请粘贴正文或填写来源链接');
      if(text.length>LIMITS.textChars)throw Error('文字超过一百万字符，请分批导入');
      if(url&&!safeURL(url))throw Error('来源仅接受有效 http/https 链接');
      const result=await addSource({kind:url?'web':'text',name:'未命名通知',text,url,noticeId:attachTo||undefined});
      location.hash=`notice/${result.noticeId}`;
    }catch(e){setMessage(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  };

  const recent=[...notices].sort((a,b)=>b.createdAt-a.createdAt).slice(0,3);

  return <div className="import-layout" onPaste={paste}>
    <section className="panel">
      <div className="section-heading"><h2>粘贴一份通知</h2><span>先保存，随时回来修改</span></div>
      <label>关联通知<select value={attachTo} onChange={e=>setAttachTo(e.target.value)}>
        <option value="">创建新通知</option>
        {notices.map(n=><option key={n.id} value={n.id}>{n.title}</option>)}
      </select></label>
      <label>通知正文<textarea aria-label="通知正文" className="import-text" placeholder="把微信、QQ群或学校网页里的通知粘贴到这里…&#10;没有日期也可以先保存。" value={text} onChange={e=>setText(e.target.value)}/></label>
      <p className="char-count">{text.length.toLocaleString('zh-CN')} 字符</p>
      <label>来源链接（可选）<input placeholder="https://…" value={url} onChange={e=>setURL(e.target.value)}/></label>
      <p className="muted">仅有链接时会保存链接。要读取网页正文，请打开网页后点击扩展的“整理当前网页”。</p>
      <button className="primary wide" onClick={save} disabled={busy}>保存原文并整理 →</button>
    </section>

    <section className="panel">
      <div className="section-heading"><h2>截图与附件</h2><span>全部在本机处理</span></div>
      <label
        className={`drop-zone ${drag?'drag':''}`}
        tabIndex={0}
        onDragOver={e=>{e.preventDefault();setDrag(true);}}
        onDragLeave={()=>setDrag(false)}
        onDrop={e=>{e.preventDefault();setDrag(false);void fileImport(Array.from(e.dataTransfer.files));}}
      >
        <span>↑</span>
        <strong>选择文件，或拖到这里</strong>
        <small>PNG / JPEG / WebP · PDF · DOCX</small>
        <input aria-label="导入文件" type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,.docx,.doc" multiple disabled={busy} onChange={e=>{void fileImport(Array.from(e.target.files||[]));e.target.value='';}}/>
      </label>
      <div className="hint"><b>也可以直接粘贴截图</b><p>在此页面按 Ctrl+V；浏览器只在你主动粘贴时接收图片。</p></div>
      <p className="muted">图片 ≤ 10 MB / 2500 万像素；附件 ≤ 20 MB；PDF ≤ 100 页，扫描 OCR 每批 ≤ 10 页。加密 PDF 请先解密导出。</p>

      {recent.length>0&&<>
        <h4 style={{marginTop:18}}>继续处理最近的通知</h4>
        <div className="recent-picks">
          {recent.map(n=>{
            const mats=materialStats(n);const left=daysLabel(n);
            return <a key={n.id} href={`#notice/${n.id}`}>
              {n.title}
              <span>{left||(mats.total?`${mats.done}/${mats.total} 材料`:'无日期')}</span>
            </a>;
          })}
        </div>
      </>}
      <p className="muted" style={{marginTop:14}}>关闭工作台会中断识别；原件已先保存，重开后可重试。多个来源的日期均保留，不会覆盖已确认的截止日。</p>
    </section>

    {message&&<p role="alert" className="warning">{message}</p>}
  </div>;
}
