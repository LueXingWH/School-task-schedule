import React,{useEffect,useState} from 'react';
import {db,change,deleteNotice,rederive} from '../db';
import {cancelJob,queueSource,retryJob} from '../jobs';
import {id,type Notice,type ParseJob,type Source} from '../model';
import {useLive,useBlobURL} from '../hooks';
import {materialKey} from '../rules/materials';
import {validDeadline} from '../rules/dates';
import {download} from '../backup';
import {daysLabel,deadlineTone,localDay,materialStats} from '../schedule';
import {ActionsPanel} from './ActionsPanel';
import {confirmSchedule} from '../rules/actions';

const states={waiting:'等待',running:'处理中',success:'成功',partial:'部分成功',failed:'失败',cancelled:'已取消'};

export function Detail({notice:n,jobs}:{notice:Notice;jobs:ParseJob[]}) {
  const [day,setDay]=useState('');
  const [clock,setClock]=useState('');
  const [name,setName]=useState('');
  const [task,setTask]=useState('');
  const [taskDay,setTaskDay]=useState('');
  const [message,setMessage]=useState('');
  const [confirmDelete,setConfirmDelete]=useState(false);
  const [tab,setTab]=useState('actions');
  const [confirming,setConfirming]=useState(false);
  useEffect(()=>{if(n.actions===undefined)void rederive(n.id);},[n.id,n.actions===undefined]);

  const update=(fn:Parameters<typeof change>[1])=>change(n.id,fn);
  const mats=materialStats(n);
  const tone=deadlineTone(n);
  const left=daysLabel(n);
  const pct=Math.round(mats.ratio*100);

  const deadline=async()=>{
    const value=day+(clock?'T'+clock:'');
    if(!validDeadline(value)){setMessage('请输入有效日期');return;}
    await update(x=>{x.deadline={value,precision:clock?'minute':'day',confirmed:true};x.deadlineEdited=true;});
    setMessage('截止日已确认保存');
  };
  const quickDate=(offset:number)=>{
    const d=new Date();d.setDate(d.getDate()+offset);const value=localDay(d);
    setDay(value);setClock('');
    void update(x=>{x.deadline={value,precision:'day',confirmed:true};x.deadlineEdited=true;});
    setMessage(offset===0?'截止日已设为今天':offset===1?'截止日已设为明天':`截止日已设为 ${value}`);
  };
  const markAllDone=()=>{
    if(!mats.left)return;
    void update(x=>{x.materials.forEach(m=>{if(m.requirement!=='excluded'){m.done=true;m.edited=true;}});});
    setMessage('已把全部应交材料标记为已备，提交仍需自行完成');
  };

  const deadlineValues=[...new Set(n.dates.filter(d=>d.role==='deadline'&&d.value).map(d=>d.value))];
  const confirm=async()=>{
    if(day&&!validDeadline(day+(clock?'T'+clock:''))){setMessage('请输入有效截止日期');return;}
    setConfirming(true);
    try{let result={added:0,unresolved:0};let hasDeadline=false;
      await update(x=>{
        if(day){x.deadline={value:day+(clock?'T'+clock:''),precision:clock?'minute':'day',confirmed:true};x.deadlineEdited=true;}
        result=confirmSchedule(x);hasDeadline=!!x.deadline?.confirmed;
      });
      setMessage(`已加入 ${result.added} 项个人任务${hasDeadline?'，截止日已确认':''}${result.unresolved?`；${result.unresolved} 项缺少可靠时间，请补全后再确认`:''}${!result.added&&!result.unresolved&&!hasDeadline?'；请先选择待办并填写日期':''}`);
    }finally{setConfirming(false);}
  };

  return <>
    <div className="detail-toolbar">
      <a className="back-link" href="#all">← 返回通知列表</a>
      <button className="primary" onClick={()=>void confirm()} disabled={confirming||jobs.some(j=>j.state==='waiting'||j.state==='running')}>确认日程</button>
    </div>
    <div className="detail-grid">
      <div className="detail-main">
        <section className="panel notice-overview">
          <div className="section-heading"><h2>通知信息</h2><span>修改自动保存</span></div>
          <label>标题<input key={n.id+':'+n.title} aria-label="通知标题" defaultValue={n.title} maxLength={1000} onBlur={e=>{const title=e.target.value.trim();if(title&&title!==n.title)void update(x=>{x.title=title;x.titleEdited=true;});}}/></label>
          <div className="row">
            <label>通知状态<select aria-label="通知状态" value={n.life} onChange={e=>{const value=e.currentTarget.value as Notice['life'];void update(x=>{x.life=value;});}}>
              <option value="review">待核对</option>
              <option value="active">进行中 / 已核对</option>
              <option value="done">已完成 / 已提交</option>
              <option value="archived">已归档</option>
            </select></label>
            <div className="deadline-display">
              <small>主截止日{left&&<span className={tone==='late'?'warning':'confirmed'} style={{marginLeft:6}}>· {left}</span>}</small>
              <strong>{n.deadline?.value.replace('T',' ')||'尚未设置'}</strong>
              <span className={n.deadline?.confirmed?'confirmed':'warning'}>{n.deadline? n.deadline.confirmed?'已人工确认':'自动建议 · 待核对':'无日期也已保存'}</span>
            </div>
          </div>
          <details className="deadline-editor">
          <summary>调整截止日期</summary>
          <div className="quick-dates">
            <span>快速设置</span>
            <button onClick={()=>quickDate(0)}>今天</button>
            <button onClick={()=>quickDate(1)}>明天</button>
            <button onClick={()=>quickDate(7)}>一周后</button>
          </div>
          <div className="row">
            <label>人工设置日期<input aria-label="人工截止日期" type="date" value={day} onChange={e=>setDay(e.target.value)}/></label>
            <label>时刻（可不填）<input aria-label="人工截止时刻" type="time" value={clock} onChange={e=>setClock(e.target.value)}/></label>
          </div>
          <div className="row">
            <button onClick={deadline}>确认此截止日</button>
            <button onClick={()=>void update(x=>{x.deadline=undefined;x.deadlineEdited=true;})}>清空截止日</button>
          </div>
          </details>
          {deadlineValues.length>1&&<p className="warning">发现多个截止时间，请逐一核对来源。已确认日期不会被后导入文件替换。</p>}
        </section>

        <div className="detail-tabs" role="tablist" aria-label="通知内容">
          {[['actions','待办与日程'],['materials','材料清单'],['dates','时间依据'],['sources','原文与来源']].map(([key,label])=><button key={key} id={`tab-${key}`} role="tab" aria-selected={tab===key} aria-controls={`panel-${key}`} onClick={()=>setTab(key)}>{label}</button>)}
        </div>

        <section className="panel" id="panel-dates" role="tabpanel" aria-labelledby="tab-dates" hidden={tab!=='dates'}>
          <div className="section-heading"><h2>日期候选与依据</h2><span>{n.dates.length} 个</span></div>
          <p className="muted">规则只辅助定位；缺年、相对日期与暂定时间需要你检查。</p>
          <div className="bounded-list">{n.dates.map(d=><div key={d.id} className="candidate">
            <div className="row">
              <strong>{d.value?.replace('T',' ')||d.raw}</strong>
              <span className={`status ${d.role==='deadline'?'status-review':''}`}>{d.role==='deadline'?'截止候选':d.role==='other'?'其他时间':'角色未明'}{d.tentative?' · 暂定':''}</span>
            </div>
            <p>{d.note||'待核对原文'}</p>
            <details><summary>原文依据 · {n.sources.find(s=>s.id===d.sourceId)?.name}{d.page?` · 第 ${d.page} 页`:''}</summary><blockquote>{d.snippet}</blockquote></details>
            {d.value&&d.valid&&<button onClick={()=>void update(x=>{x.deadline={value:d.value!,precision:d.precision as 'day'|'minute',confirmed:true,candidateId:d.id};x.deadlineEdited=true;})}>选为已确认截止日</button>}
          </div>)}</div>
          {!n.dates.length&&<p className="muted">没有可靠日期候选，可在上方手动填写。</p>}
        </section>

        <section className="panel" id="panel-materials" role="tabpanel" aria-labelledby="tab-materials" hidden={tab!=='materials'}>
          <div className="section-heading"><h2>材料清单</h2><span>准备完成后，仍需自行提交</span></div>
          {mats.total>0&&<div className="material-summary">
            <span className={`progress ${tone==='late'?'late':''} ${pct===100?'full':''}`}><i style={{width:pct+'%'}}/></span>
            <strong>{mats.done}/{mats.total}</strong>
            <span className="muted" style={{fontSize:12}}>项已备</span>
            {mats.left>0&&<button className="small" onClick={markAllDone}>全部标记已备</button>}
          </div>}
          <div className="bounded-list">{n.materials.map(m=><div className="material" key={m.id}>
            <div className="row">
              <input aria-label={`准备 ${m.name}`} type="checkbox" checked={m.done} disabled={m.requirement==='excluded'} onChange={e=>{const checked=e.currentTarget.checked;void update(x=>{const item=x.materials.find(y=>y.id===m.id);if(item){item.done=checked;item.edited=true;}});}}/>
              <input aria-label="材料名称" className={m.done?'struck':''} defaultValue={m.name} maxLength={1000} onBlur={e=>{const value=e.currentTarget.value.trim();void update(x=>{const item=x.materials.find(y=>y.id===m.id);if(item&&value){item.name=value;item.edited=true;}});}}/>
              <select aria-label="材料性质" value={m.requirement} onChange={e=>{const value=e.currentTarget.value as typeof m.requirement;void update(x=>{const item=x.materials.find(y=>y.id===m.id);if(item){item.requirement=value;item.edited=true;}});}}>
                <option value="required">必交候选</option>
                <option value="optional">可选</option>
                <option value="excluded">无需提交</option>
              </select>
              <button aria-label={`删除材料 ${m.name}`} onClick={()=>void update(x=>{x.materials=x.materials.filter(y=>y.id!==m.id);if(m.evidence)x.dismissedMaterials.push(m.originKey||materialKey(m.evidence.sourceId,m.name));})}>×</button>
            </div>
            {m.evidence&&<details>
              <summary>查看依据 · {n.sources.find(s=>s.id===m.evidence?.sourceId)?.name}{m.evidence.page?` 第${m.evidence.page}页`:''}</summary>
              <blockquote>{m.evidence.snippet}</blockquote>
              <small>{m.evidence.ruleId} · 区间 {m.evidence.start}–{m.evidence.end}</small>
            </details>}
          </div>)}</div>
          {!n.materials.length&&<p className="muted">未找到明确材料要求。可手动添加，不会补造官方要求。</p>}
          <form className="row" onSubmit={e=>{e.preventDefault();if(!name.trim())return;void update(x=>{x.materials.push({id:id(),name:name.trim(),requirement:'required',done:false,origin:'manual'});});setName('');}}>
            <input aria-label="新增材料名称" placeholder="添加需要准备的材料…" value={name} maxLength={1000} onChange={e=>setName(e.target.value)}/>
            <button>添加材料</button>
          </form>
        </section>

        <section className="panel schedule-panel" id="panel-actions" role="tabpanel" aria-labelledby="tab-actions" hidden={tab!=='actions'}>
          <ActionsPanel notice={n}/>
          <div className="section-heading"><h2>个人任务</h2><span>{n.tasks.length} 项已安排</span></div>
          <p className="muted">你安排的日期会进入当天清单；材料勾选不会自动标为已提交。</p>
          <div className="bounded-list">{n.tasks.map(t=><div className={`row personal-task ${!t.done&&t.date===localDay()?'today':''}`} key={t.id}>
            <input aria-label={`完成任务 ${t.text}`} type="checkbox" checked={t.done} onChange={e=>{const checked=e.currentTarget.checked;void update(x=>{x.tasks.find(y=>y.id===t.id)!.done=checked;});}}/>
            <input aria-label="任务内容" defaultValue={t.text} maxLength={1000} onBlur={e=>{const value=e.currentTarget.value.trim();void update(x=>{if(value)x.tasks.find(y=>y.id===t.id)!.text=value;});}}/>
            <input aria-label="任务日期" type="date" value={t.date} onChange={e=>{const value=e.currentTarget.value;void update(x=>{if(validDeadline(value))x.tasks.find(y=>y.id===t.id)!.date=value;});}}/>
            {t.time&&<small>{t.time}</small>}
            <button aria-label={`删除任务 ${t.text}`} onClick={()=>void update(x=>{x.tasks=x.tasks.filter(y=>y.id!==t.id);for(const a of x.actions||[])if(a.taskId===t.id){a.taskId=undefined;a.dismissed=true;}})}>×</button>
          </div>)}</div>
          <form className="task-add" onSubmit={e=>{e.preventDefault();if(!task.trim()||!validDeadline(taskDay)){setMessage('请填写任务内容和有效计划日期');return;}void update(x=>{x.tasks.push({id:id(),text:task.trim(),date:taskDay,done:false});});setTask('');}}>
            <label>要做什么<input aria-label="新增任务内容" placeholder="例如：整理报名表" value={task} maxLength={1000} onChange={e=>setTask(e.target.value)}/></label>
            <div className="row">
              <label>计划日期<input aria-label="新增任务日期" type="date" value={taskDay} onChange={e=>setTaskDay(e.target.value)}/></label>
              <button>安排任务</button>
            </div>
          </form>
        </section>

        <section className="panel" id="panel-sources" role="tabpanel" aria-labelledby="tab-sources" hidden={tab!=='sources'}>
          <div className="section-heading"><h2>原文与来源</h2><a href={'#import/'+n.id}>关联更多附件 ↗</a></div>
          {n.sources.map(s=><SourcePanel key={s.id} source={s} noticeId={n.id}/>)}
          <button onClick={()=>void rederive(n.id)}>从已保存正文重新提取候选</button>
          <p className="muted">重提取保留人工标题、已确认/清空的截止日、清单编辑及勾选。</p>
        </section>
      </div>

      <aside className="detail-side">
        <section className="panel">
          <h2>处理记录</h2>
          {jobs.map(j=><div key={j.id} className="job" data-state={j.state}>
            <b>{states[j.state]}</b>
            <p>{j.progress}</p>
            {j.error&&<p className="warning">{j.error}</p>}
            <div className="row">
              {(j.state==='running'||j.state==='waiting')&&<button onClick={()=>cancelJob(j.id)}>取消处理</button>}
              {j.state!=='waiting'&&j.state!=='success'&&<button onClick={()=>void retryJob(j)}>重试 / 继续处理</button>}
            </div>
            {j.state==='running'&&<small>如曾关闭工作台，可点“继续处理”；仍在运行时不会重复识别。</small>}
          </div>)}
          {!jobs.length&&<p className="muted">还没有处理记录。</p>}
        </section>
        <section className="panel quiet">
          <h3>已经收好了</h3>
          <p>原始输入先保存。离开页面后，下次仍能继续核对。</p>
          <small>添加于 {new Date(n.createdAt).toLocaleString('zh-CN')}</small>
        </section>
        <button className="danger wide" onClick={()=>setConfirmDelete(true)}>删除通知与关联文件</button>
        {confirmDelete&&<div role="alert" className="panel">
          <p>删除后会移除这条通知及其所有原件、清单和任务。建议先备份。</p>
          <div className="row">
            <button className="danger" onClick={()=>{jobs.forEach(j=>cancelJob(j.id));void deleteNotice(n.id).then(()=>{location.hash='all';});}}>确认删除</button>
            <button onClick={()=>setConfirmDelete(false)}>保留通知</button>
          </div>
        </div>}
      </aside>
    </div>
    {message&&<p role="status" className="toast">{message}<button onClick={()=>setMessage('')}>关闭</button></p>}
  </>;
}

function SourcePanel({source:s,noticeId}:{source:Source;noticeId:string}) {
  const attachment=useLive(()=>s.attachmentId?db.attachments.get(s.attachmentId):Promise.resolve(undefined),undefined,[s.attachmentId]);
  const url=useBlobURL(attachment?.blob);
  const [pages,setPages]=useState('');
  const [message,setMessage]=useState('');
  const scan=()=>{
    const nums=new Set<number>();
    for(const token of pages.split(/[,，\s]+/).filter(Boolean)){
      const m=token.match(/^(\d+)(?:-(\d+))?$/);
      if(!m){setMessage('页码格式如 1,3-5');return;}
      const a=Number(m[1]),b=Number(m[2]||a);
      if(a<1||b<a||b>100||b-a>10){setMessage('页码超限');return;}
      for(let i=a;i<=b;i++)nums.add(i);
    }
    if(!nums.size||nums.size>10){setMessage('每批请选择 1–10 页');return;}
    void queueSource(noticeId,s.id,[...nums].sort((a,b)=>a-b));
    setMessage('选定页面已排队 OCR，现有其他页正文保留');
  };
  return <details className="source">
    <summary>{s.name} <small>{s.kind.toUpperCase()} {attachment?` · ${(attachment.size/1024).toFixed(1)} KB`:''}</small></summary>
    {s.url&&<a href={s.url} target="_blank" rel="noreferrer">打开原网页 ↗</a>}
    {s.url&&!s.text&&<p className="warning">仅保存了链接，未读取正文。请打开网页点击扩展采集，或在下方粘贴正文。</p>}
    {attachment&&<div className="row">
      <button onClick={()=>download(attachment.blob,attachment.name)}>下载原文件</button>
      <a href={url} target="_blank" rel="noreferrer">打开原文件 ↗</a>
      <button onClick={()=>void queueSource(noticeId,s.id)}>重新读取原文件</button>
    </div>}
    {s.kind==='image'&&url&&<>
      <img className="source-image" style={{transform:`rotate(${s.rotation||0}deg)`}} src={url} alt={s.name}/>
      <div className="row">
        <button onClick={()=>void change(noticeId,n=>{const src=n.sources.find(x=>x.id===s.id)!;src.rotation=((src.rotation||0)+90)%360;})}>旋转 90°</button>
        <small>旋转后点击重新读取原文件，原件始终保留。</small>
      </div>
    </>}
    {s.pages&&<div className="page-states">{s.pages.map(p=><span key={p.page}>第{p.page}页：{p.error?'失败':p.method==='scan'?'待扫描 OCR':p.method==='ocr'?'已 OCR':'文本已读取'}</span>)}</div>}
    {s.kind==='pdf'&&<div className="hint">
      <label>扫描 PDF 选页（如 1,3-5）<input aria-label="PDF OCR 页码" value={pages} onChange={e=>setPages(e.target.value)}/></label>
      <button onClick={scan}>识别选定扫描页</button>
    </div>}
    {s.warnings?.map((w,i)=><p className="warning" key={i}>{w}</p>)}
    <label>已保存正文（可修正）<textarea aria-label={`原文 ${s.name}`} key={s.id+':'+s.editedAt+':'+s.text.length} defaultValue={s.text} maxLength={1_000_000} onBlur={e=>{const text=e.target.value;if(text===s.text)return;void change(noticeId,n=>{const src=n.sources.find(x=>x.id===s.id)!;src.text=text;src.editedAt=Date.now();src.pages=undefined;}).then(()=>rederive(noticeId));}}/></label>
    <details><summary>最初读取的原文</summary><pre>{s.originalText||'图片/附件原件已保留；尚未成功读取正文。'}</pre></details>
    {message&&<p role="status">{message}</p>}
  </details>;
}
