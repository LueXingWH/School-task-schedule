import React,{useEffect,useRef,useState} from 'react';
import {version as appVersion} from '../../package.json';
import {change} from '../db';
import {type Notice,type ParseJob,type Settings} from '../model';
import {actionable,localDay,overallProgress,overdue,sortNotices,today,upcoming} from '../schedule';
import {Detail} from './Detail';
import {WelcomePanel} from './WelcomePanel';
import {ImportPanel} from './ImportPanel';
import {SettingsPanel,loadSettings} from './SettingsPanel';
import {NoticeCard} from './NoticeCard';

const TITLES:Record<string,string>={
  welcome:'校事笺已准备好',
  home:'今天，从容一点',
  all:'所有通知',
  review:'待核对',
  done:'完成与归档',
  import:'收进校事笺',
  settings:'设置与数据',
};

export function Dashboard({notices,jobs,route}:{notices:Notice[];jobs:ParseJob[];route:string}) {
  const [query,setQuery]=useState('');
  const [sort,setSort]=useState('deadline');
  const [filter,setFilter]=useState('all');
  const [now,setNow]=useState(new Date());
  const [settings,setSettings]=useState<Settings>({upcomingDays:7,sort:'deadline',compact:false});
  const searchRef=useRef<HTMLInputElement>(null);

  useEffect(()=>{void loadSettings().then(s=>{setSettings(s);setSort(s.sort);});const t=setInterval(()=>setNow(new Date()),30000);return()=>clearInterval(t);},[]);

  // 键盘路径：/ 聚焦搜索，Esc 清空并退出，n 直接进入收录。
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      const el=e.target as HTMLElement|null;
      const typing=!!el&&(/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)||el.isContentEditable);
      if(e.key==='/'&&!typing){e.preventDefault();searchRef.current?.focus();searchRef.current?.select();}
      else if(e.key==='Escape'){setQuery('');searchRef.current?.blur();}
      else if((e.key==='n'||e.key==='N')&&!typing&&!e.ctrlKey&&!e.metaKey&&!e.altKey){location.hash='import';}
    };
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[]);

  const review=notices.filter(n=>n.life==='review');
  const done=notices.filter(n=>n.life==='done'||n.life==='archived');
  const active=notices.filter(actionable);
  const todayItems=active.filter(n=>today(n,now));
  const late=active.filter(n=>overdue(n,now));
  const soon=active.filter(n=>upcoming(n,settings.upcomingDays,now));
  const progress=overallProgress(active);

  const view=route.split('/')[0];
  const selected=view==='notice'?notices.find(n=>n.id===route.split('/')[1]):undefined;
  const title=selected?selected.title:(TITLES[view]||'通知详情');

  const nav=[
    {key:'home',icon:'◷',name:'我的首页',alert:late.length},
    {key:'all',icon:'▤',name:'所有通知',count:active.length},
    {key:'review',icon:'◇',name:'待核对',count:review.length},
    {key:'done',icon:'✓',name:'完成与归档',count:done.length},
  ];

  let list=view==='review'?review:view==='done'?done:active;
  if(query){
    const needle=query.toLowerCase();
    list=list.filter(n=>(n.title+' '+n.sources.map(s=>s.text).join(' ')+' '+n.materials.map(m=>m.name).join(' ')).toLowerCase().includes(needle));
  }
  const matchesFilter=(n:Notice)=>{
    if(filter==='nodate')return !n.deadline;
    if(filter==='today')return today(n,now);
    if(filter==='late')return overdue(n,now);
    if(filter==='upcoming')return upcoming(n,settings.upcomingDays,now);
    return true;
  };
  list=list.filter(matchesFilter);
  list=sortNotices(list,sort,now);

  const hasCondition=!!query||filter!=='all';
  const clearFilters=()=>{setQuery('');setFilter('all');};

  const completeTask=(noticeId:string,taskId:string)=>void change(noticeId,n=>{
    const task=n.tasks.find(t=>t.id===taskId);if(task)task.done=true;
  });

  return <div className={`shell ${settings.compact?'compact':''}`}>
    <aside className="sidebar">
      <a href="#home" className="brand"><img src="icons/48.png" alt=""/><div>校事笺<small>把通知，变成有序的行动</small></div></a>
      <a href="#import" className="primary new-import">＋ 收录新通知</a>
      <nav>
        {nav.map(item=><a key={item.key} href={`#${item.key}`} className={view===item.key?'selected':''}>
          <span>{item.icon}</span>{item.name}
          {item.alert?<b className="alert" title="已逾期">{item.alert}</b>:item.count!==undefined?<b>{item.count}</b>:null}
        </a>)}
      </nav>
      <div className="side-note"><span className="online-dot"/>数据留在本机<p>不必记住所有事，<br/>只需记得打开校事笺。</p></div>
      <a className={`settings-link ${view==='settings'?'selected':''}`} href="#settings">⚙ 设置与备份</a>
      <small className="version">校事笺 {appVersion} · 本地试用版</small>
    </aside>

    <main className="workspace">
      <header className="page-header">
        <div>
          <p className="eyebrow">{now.toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'long'})}</p>
          <h1>{title}</h1>
        </div>
        <span className="local-badge">本地工作台</span>
      </header>

      {view==='welcome'?<WelcomePanel/>:selected?<Detail key={selected.id} notice={selected} jobs={jobs.filter(j=>j.noticeId===selected.id)}/>:view==='notice'?<div className="empty"><span>▧</span><h2>通知已删除或正在载入</h2><p>它可能已在另一个窗口被删除。</p><a href="#all">返回列表</a></div>:view==='import'?<ImportPanel notices={notices} initialNoticeId={route.split('/')[1]}/>:view==='settings'?<SettingsPanel settings={settings} onSettings={s=>{setSettings(s);setSort(s.sort);}}/>:<>
        {view==='home'&&<>
          <div className="intro-banner">
            <div>
              <h2>让重要的事，按时发生。</h2>
              <p>收好每一份通知，确认时间，一项一项准备材料。</p>
            </div>
            <div className="hero-side">
              <div className="hero-stats">
                <div className="hero-stat"><strong>{todayItems.length}</strong><small>今日要办</small></div>
                <div className="hero-stat"><strong>{progress.done}<span>/{progress.total}</span></strong><small>材料已备</small></div>
                <div className="hero-stat"><strong>{review.length}</strong><small>等你核对</small></div>
              </div>
              <a href="#import">收录一份通知 ↗</a>
            </div>
          </div>

          <div className="metrics">
            <button onClick={()=>setFilter('today')}>
              <span className="metric-icon">☀</span>
              <span className="metric-body"><strong>{todayItems.length}<span>件</span></strong><small>今日要办</small></span>
            </button>
            <button onClick={()=>setFilter('upcoming')}>
              <span className="metric-icon amber">◔</span>
              <span className="metric-body"><strong>{soon.length}<span>件</span></strong><small>未来 {settings.upcomingDays} 天截止</small></span>
            </button>
            <a href="#review">
              <span className="metric-icon violet">◇</span>
              <span className="metric-body"><strong>{review.length}<span>件</span></strong><small>等你核对</small></span>
            </a>
            <button onClick={()=>setFilter('late')} className={late.length?'warn':''}>
              <span className={`metric-icon ${late.length?'red':''}`}>!</span>
              <span className="metric-body"><strong>{late.length}<span>件</span></strong><small>已逾期</small></span>
            </button>
          </div>

          <section className="today-panel">
            <div className="section-heading"><h2>今日清单</h2><span>已确认截止日与个人计划</span></div>
            {todayItems.length
              ? <ul className="today-list">
                  {todayItems.map(n=><li key={n.id}>
                    <a href={`#notice/${n.id}`}>{n.title}</a>
                    {n.tasks.filter(t=>!t.done&&t.date===localDay(now)).map(t=><React.Fragment key={t.id}>
                      <span className="task-chip">{t.text}</span>
                      <button className="chip-done" onClick={()=>completeTask(n.id,t.id)} aria-label={`完成任务 ${t.text}`} title="标记完成">✓</button>
                    </React.Fragment>)}
                    {n.deadline?.confirmed&&n.deadline.value.slice(0,10)===localDay(now)&&<span className="task-chip amber">今天截止</span>}
                  </li>)}
                </ul>
              : <p className="today-empty"><span>今天没有已确认的待办，去通知详情里安排准备日期。</span><a href="#review">去核对日期 →</a></p>}
            {active.filter(n=>!n.deadline?.confirmed&&n.deadline?.value.slice(0,10)===localDay(now)).map(n=>
              <p key={n.id} className="warning">可能今日截止 / 待核对：<a href={`#notice/${n.id}`}>{n.title}</a></p>)}
          </section>
        </>}

        <div className="section-heading">
          <h2>{view==='home'?'通知收件箱':title}</h2>
          <span>{list.length} 条</span>
        </div>

        <div className="toolbar">
          <span className="search">
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M10.4 10.4L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            <input ref={searchRef} aria-label="搜索通知" placeholder="搜索标题、正文或材料…" value={query} onChange={e=>setQuery(e.target.value)}/>
            <kbd>/</kbd>
          </span>
          <select aria-label="筛选通知" value={filter} onChange={e=>setFilter(e.target.value)}>
            <option value="all">全部</option>
            <option value="today">今日要办</option>
            <option value="upcoming">即将截止</option>
            <option value="late">已逾期</option>
            <option value="nodate">无日期</option>
          </select>
          <select aria-label="排序" value={sort} onChange={e=>setSort(e.target.value)}>
            <option value="deadline">截止日由近到远</option>
            <option value="created">最近添加</option>
            <option value="planned">个人计划日期</option>
          </select>
        </div>

        <div className="notice-list">
          {list.filter(n=>!!n.deadline).map(n=><NoticeCard key={n.id} notice={n} now={now} jobs={jobs}/>)}
          {list.some(n=>!n.deadline)&&<h3 className="group-label">无日期 · 随时可以补充</h3>}
          {list.filter(n=>!n.deadline).map(n=><NoticeCard key={n.id} notice={n} now={now} jobs={jobs}/>)}
        </div>

        {!list.length&&<div className="empty">
          <span>▧</span>
          <h2>{hasCondition?'没有符合条件的通知':'这里等着你的第一份通知'}</h2>
          <p>{hasCondition?'换个关键词或放宽筛选条件试试。':'粘贴群消息，收录网页，或导入截图与附件。'}</p>
          {hasCondition?<button onClick={clearFilters}>清除筛选条件</button>:<a href="#import" className="primary">＋ 收录通知</a>}
        </div>}
      </>}

      <footer>校事笺 · 候选提取仅供辅助，请以原通知为准。定期备份，安心整理。</footer>
    </main>
  </div>;
}
