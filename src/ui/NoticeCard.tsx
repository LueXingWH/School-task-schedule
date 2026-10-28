import React from 'react';
import {type Notice,type ParseJob} from '../model';
import {deadlineTone,daysLabel,materialStats} from '../schedule';

const lifeText={review:'待核对',active:'进行中',done:'已完成',archived:'已归档'};

/** 通知卡片：左侧状态色条 + 材料进度 + 右侧剩余天数胶囊。 */
export function NoticeCard({notice:n,now,jobs}:{notice:Notice;now:Date;jobs:ParseJob[]}) {
  const tone=deadlineTone(n,now);
  const left=daysLabel(n,now);
  const mats=materialStats(n);
  const busy=jobs.some(j=>j.noticeId===n.id&&(j.state==='running'||j.state==='waiting'));
  const dateText=n.deadline?.value.replace('T',' ')||'';
  const accent=tone==='late'?'late':tone==='soon'||tone==='today'?'soon':'';
  const pct=Math.round(mats.ratio*100);
  return <a className={`notice-card ${accent}`} href={`#notice/${n.id}`} aria-label={n.title}>
    <div className="card-main">
      <div className="card-tags">
        <span className={'status status-'+n.life}>{lifeText[n.life]}</span>
        {busy&&<span className="task-chip amber">处理中</span>}
      </div>
      <h3>{n.title}</h3>
      <div className="card-meta">
        <span>{n.sources.length} 个来源</span>
        {mats.total>0
          ? <><span className="dot"/><span className="card-progress"><span className={`progress ${tone==='late'?'late':''} ${pct===100?'full':''}`}><i style={{width:pct+'%'}}/></span><small>{mats.done}/{mats.total} 材料</small></span></>
          : <><span className="dot"/><span>暂无材料要求</span></>}
      </div>
    </div>
    <div className="card-date">
      {dateText
        ? <><strong>{dateText}</strong>{left&&<span className={'left '+accent}>{left}</span>}
            {n.deadline&&!n.deadline.confirmed&&<small>机器候选 · 待核对</small>}</>
        : <><strong className="empty">暂无截止日</strong><small>可以稍后补充</small></>}
    </div>
    <span className="arrow" aria-hidden="true">↗</span>
  </a>;
}
