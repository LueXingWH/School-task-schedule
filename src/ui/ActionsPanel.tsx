import React from 'react';
import {change} from '../db';
import type {ActionCandidate,Notice} from '../model';
import {validDay} from '../rules/dates';

export function ActionsPanel({notice:n}:{notice:Notice}) {
  const actions=(n.actions||[]).filter(a=>!a.dismissed&&!a.taskId);
  const edit=(id:string,patch:Partial<ActionCandidate>)=>change(n.id,x=>{
    const item=x.actions?.find(a=>a.id===id);if(item)Object.assign(item,patch);
  });
  return <section aria-label="自动提取的待办" className="action-section">
    <div className="section-heading"><h2>提取的待办</h2><span>{actions.length} 项待核对</span></div>
    <p className="muted">勾选要安排的事项，核对时间后点右上角“确认日程”。缺少时间的事项会保留待确认。</p>
    <div className="bounded-list action-list">
      {actions.map(a=><article className="action-item" key={a.id}>
        <div className="action-main">
          <input aria-label={`采纳待办 ${a.text}`} type="checkbox" checked={a.selected} onChange={e=>void edit(a.id,{selected:e.currentTarget.checked})}/>
          <input aria-label="待办内容" defaultValue={a.text} maxLength={1000} onBlur={e=>{const value=e.currentTarget.value.trim();if(value)void edit(a.id,{text:value,edited:true});else e.currentTarget.value=a.text;}}/>
          {a.optional&&<span className="status">可选</span>}
          <button className="ghost small" aria-label={`忽略待办 ${a.text}`} onClick={()=>void edit(a.id,{dismissed:true})}>×</button>
        </div>
        <div className="action-time">
          <input aria-label={`待办日期 ${a.text}`} type="date" value={a.time?.slice(0,10)||''} onChange={e=>{const day=e.currentTarget.value;void edit(a.id,{time:validDay(day)?day+(a.time?.includes('T')?'T'+a.time.split('T')[1]:''):undefined,timeNote:'人工修改 · 待核对',edited:true});}}/>
          <input aria-label={`待办时刻 ${a.text}`} type="time" value={a.time?.split('T')[1]||''} disabled={!a.time} onChange={e=>{const clock=e.currentTarget.value;void edit(a.id,{time:a.time!.slice(0,10)+(clock?'T'+clock:''),timeNote:'人工修改 · 待核对',edited:true});}}/>
          <span className={a.time?'muted':'pending-time'}>{a.time||a.timeNote.includes('待确认')?a.timeNote:'待确认 · '+a.timeNote}</span>
        </div>
        <details className="action-evidence"><summary>原文依据 · {n.sources.find(s=>s.id===a.evidence.sourceId)?.name}{a.evidence.page?` · 第 ${a.evidence.page} 页`:''}</summary><blockquote>{a.evidence.snippet}</blockquote></details>
      </article>)}
      {!actions.length&&<p className="muted">{n.actions?.some(a=>a.taskId)?'已核对的待办已加入下方个人任务。':'没有待核对的事项，可在下方手动安排任务。'}</p>}
    </div>
  </section>;
}
