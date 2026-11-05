import React,{useState} from 'react';
import {addSources} from '../db';
import {LIMITS,type Notice,safeURL} from '../model';
import {daysLabel,materialStats} from '../schedule';
import {splitSchedules,validateImportFiles,type Separator} from '../importing';
import {titleFrom} from '../rules/title';

export function ImportPanel({notices,initialNoticeId=''}:{notices:Notice[];initialNoticeId?:string}) {
  const [mode,setMode]=useState<'single'|'batch'>('single');
  const [text,setText]=useState('');
  const [url,setURL]=useState('');
  const [separator,setSeparator]=useState<Separator>('divider');
  const [attachTo,setAttachTo]=useState(initialNoticeId);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [drag,setDrag]=useState(false);
  const [imported,setImported]=useState<string[]>([]);
  const batch=mode==='batch';
  const parts=batch?splitSchedules(text,separator):[];
  const finished=(results:{noticeId:string}[])=>{
    if(!batch){location.hash=`notice/${results[0].noticeId}`;return;}
    setImported(results.map(r=>r.noticeId));setText('');
  };
  const fileImport=async(files:File[])=>{
    if(busy)return;
    setBusy(true);setMessage('');setImported([]);
    try{
      const inputs=validateImportFiles(files);
      finished(await addSources(inputs,{separate:batch,noticeId:!batch&&attachTo||undefined}));
    }catch(e){setMessage(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  };
  const paste=(e:React.ClipboardEvent)=>{
    const files=Array.from(e.clipboardData.files);
    if(files.length){e.preventDefault();void fileImport(files);}
  };
  const save=async()=>{
    if(busy)return;
    setBusy(true);setMessage('');setImported([]);
    try{
      if(!text.trim()&&(batch||!url.trim()))throw Error(batch?'请粘贴要批量导入的日程':'请粘贴正文或填写来源链接');
      if(text.length>LIMITS.textChars)throw Error('文字超过一百万字符，请分批导入');
      if(batch){
        if(parts.length>LIMITS.importItems)throw Error(`每批最多导入 ${LIMITS.importItems} 项日程，请分批保存`);
        finished(await addSources(parts.map(body=>({kind:'text',name:titleFrom(body,'未命名通知'),text:body})),{separate:true}));
      }else{
        if(url&&!safeURL(url))throw Error('来源仅接受有效 http/https 链接');
        finished(await addSources([{kind:url?'web':'text',name:'未命名通知',text,url}],{noticeId:attachTo||undefined}));
      }
    }catch(e){setMessage(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  };
  const recent=[...notices].sort((a,b)=>b.createdAt-a.createdAt).slice(0,3);

  return <div className="import-page" onPaste={paste}>
    <div className="import-modes" role="group" aria-label="日程导入方式">
      <button aria-pressed={!batch} disabled={busy} onClick={()=>{setMode('single');setMessage('');setImported([]);}}><strong>导入一项日程</strong><span>一份正文或多个附件，整理为同一项日程</span></button>
      <button aria-pressed={batch} disabled={busy} onClick={()=>{setMode('batch');setMessage('');setImported([]);}}><strong>一次导入多项日程</strong><span>分段粘贴或选择多个文件，分别保存</span></button>
    </div>
    {imported.length>0&&<section className="panel import-result" role="status">
      <h2>已保存 {imported.length} 项日程</h2><p>原文已收好，正在逐项识别。点开日程即可核对。</p>
      <div className="recent-picks">{imported.map((noticeId,i)=><a key={noticeId} href={`#notice/${noticeId}`}>{notices.find(n=>n.id===noticeId)?.title||`日程 ${i+1}`}<span>查看 →</span></a>)}</div>
      <a href="#all">查看所有日程 →</a>
    </section>}
    <div className="import-layout">
      <section className="panel">
        <div className="section-heading"><h2>{batch?'批量粘贴日程':'粘贴一份通知'}</h2><span>先保存，随时回来修改</span></div>
        {!batch&&<label>关联通知<select aria-label="关联通知" value={attachTo} disabled={busy} onChange={e=>setAttachTo(e.target.value)}>
          <option value="">创建新通知</option>{notices.map(n=><option key={n.id} value={n.id}>{n.title}</option>)}
        </select></label>}
        {batch&&<label>如何拆分日程<select aria-label="批量分隔方式" value={separator} disabled={busy} onChange={e=>setSeparator(e.target.value as Separator)}>
          <option value="divider">单独一行 --- 分隔（保留段内换行）</option><option value="paragraph">空行分隔</option><option value="line">每行一项</option>
        </select></label>}
        <label>{batch?'多项日程正文':'通知正文'}<textarea aria-label={batch?'多项日程正文':'通知正文'} className="import-text" disabled={busy} placeholder={batch?'第一项日程标题\n请于2026年11月9日前提交报名表。\n---\n第二项日程标题\n2026年11月12日下午3点参加答辩。':'把微信、QQ群或学校网页里的通知粘贴到这里…\n没有日期也可以先保存。'} value={text} onChange={e=>setText(e.target.value)}/></label>
        <p className="char-count">{text.length.toLocaleString('zh-CN')} 字符{batch?` · 已拆分 ${parts.length} 项`:''}</p>
        {batch?<>
          <p className="muted">每项单独保留标题、概述和原文。每批最多 {LIMITS.importItems} 项；先检查下面的拆分预览。</p>
          {parts.length>0&&<ol className="batch-preview" aria-label="批量日程预览">{parts.slice(0,LIMITS.importItems).map((body,i)=><li key={i}><strong>{titleFrom(body,`日程 ${i+1}`)}</strong><small>{body.length} 字符</small></li>)}</ol>}
        </>:<>
          <label>来源链接（可选）<input placeholder="https://…" disabled={busy} value={url} onChange={e=>setURL(e.target.value)}/></label>
          <p className="muted">仅有链接时会保存链接。要读取网页正文，请打开网页后点击扩展的“整理当前网页”。</p>
        </>}
        <button className="primary wide" onClick={()=>void save()} disabled={busy||(batch&&(!parts.length||parts.length>LIMITS.importItems))}>{busy?'正在保存…':batch?`保存 ${parts.length} 项日程并整理`:'保存原文并整理 →'}</button>
      </section>
      <section className="panel">
        <div className="section-heading"><h2>截图与附件</h2><span>{batch?'每个文件创建一项日程':'多个文件归入同一项日程'}</span></div>
        <label className={`drop-zone ${drag?'drag':''}`} tabIndex={0} onDragOver={e=>{e.preventDefault();if(!busy)setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);void fileImport(Array.from(e.dataTransfer.files));}}>
          <span>↑</span><strong>选择文件，或拖到这里</strong><small>PNG / JPEG / WebP · PDF · DOCX · TXT / Markdown</small>
          <input aria-label="导入文件" type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,.docx,.doc,.txt,.md" multiple disabled={busy} onChange={e=>{void fileImport(Array.from(e.target.files||[]));e.target.value='';}}/>
        </label>
        <div className="hint"><b>自动提取标题、概述、待办与时间</b><p>也可按 Ctrl+V 粘贴截图。{batch?'多个文件各自识别，不会混在一起。':'一项日程的正文与附件可以继续关联补充。'}</p></div>
        <p className="muted">图片 ≤ 10 MB / 2500 万像素；附件 ≤ 20 MB；每批最多 {LIMITS.importItems} 个文件。PDF ≤ 100 页，自动 OCR 前 10 个扫描页，剩余页可选页继续。加密 PDF 请先解密导出。</p>
        {recent.length>0&&<><h4 style={{marginTop:18}}>继续处理最近的通知</h4><div className="recent-picks">{recent.map(n=>{const mats=materialStats(n),left=daysLabel(n);return <a key={n.id} href={`#notice/${n.id}`}>{n.title}<span>{left||(mats.total?`${mats.done}/${mats.total} 材料`:'无日期')}</span></a>;})}</div></>}
        <p className="muted" style={{marginTop:14}}>关闭工作台会中断识别；原件已先保存，重开后可重试。已确认的截止日和人工修改都会保留。</p>
      </section>
    </div>
    {message&&<p role="alert" className="warning">{message}</p>}
  </div>;
}
