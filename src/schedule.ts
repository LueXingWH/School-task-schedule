import type { Notice } from './model';
export const localDay = (d=new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const actionable = (n:Notice)=>n.life!=='done';
export function overdue(n:Notice,now=new Date()) { const d=n.deadline; return actionable(n)&&!!d?.confirmed&&(d.precision==='day'?d.value<localDay(now):new Date(d.value).getTime()<now.getTime()); }
export function today(n:Notice,now=new Date()) { return actionable(n)&&(n.tasks.some(t=>!t.done&&t.date===localDay(now))||!!n.deadline?.confirmed&&n.deadline.value.slice(0,10)===localDay(now)); }
export function upcoming(n:Notice,days:number,now=new Date()) { const day=n.deadline?.value.slice(0,10); const until=new Date(now);until.setDate(until.getDate()+days);return actionable(n)&&!!day&&day>=localDay(now)&&day<=localDay(until); }

// 日期一律按本地时区构造，避免 new Date('YYYY-MM-DD') 被当成 UTC 造成差一天。
const parseDay = (day:string) => { const [y,m,d]=day.split('-').map(Number); return new Date(y,(m||1)-1,d||1); };
/** 距截止日的整天数：0 为今天，负数表示已逾期。无截止日返回 null。 */
export function daysUntil(n:Notice,now=new Date()):number|null {
  const day=n.deadline?.value.slice(0,10); if(!day)return null;
  const target=parseDay(day),base=parseDay(localDay(now));
  return Math.round((target.getTime()-base.getTime())/86_400_000);
}
export type DeadlineTone = 'late'|'today'|'soon'|'later'|'none';
/** 卡片/详情共用的语气分级：逾期 > 今天 > 三天内 > 以后 > 无日期。 */
export function deadlineTone(n:Notice,now=new Date()):DeadlineTone {
  if(overdue(n,now))return 'late';
  const left=daysUntil(n,now);
  if(left===null)return 'none';
  if(left<=0)return 'today';
  if(left<=3)return 'soon';
  return 'later';
}
/** 剩余天数的中文短标签，例如「今天」「明天」「5 天后」「逾期 2 天」。 */
export function daysLabel(n:Notice,now=new Date()) {
  const tone=deadlineTone(n,now),left=daysUntil(n,now);
  if(tone==='none')return null;
  if(tone==='late')return `逾期 ${Math.abs(left??0)} 天`;
  if(left===0)return '今天截止';
  if(left===1)return '明天截止';
  return `${left} 天后`;
}
/** 材料准备度：排除「无需提交」项，避免分母虚高。 */
export function materialStats(n:Notice) {
  const items=n.materials.filter(m=>m.requirement!=='excluded');
  const done=items.filter(m=>m.done).length;
  return {done,total:items.length,ratio:items.length?done/items.length:0,left:items.length-done};
}
/** 首页总体准备度：只统计仍有截止日且未完成的通知里的必交材料。 */
export function overallProgress(notices:Notice[]) {
  let done=0,total=0;
  for(const n of notices) { if(!actionable(n))continue; const s=materialStats(n); done+=s.done; total+=s.total; }
  return {done,total,ratio:total?done/total:0};
}
export function sortNotices(list:Notice[],sort='deadline',now=new Date()) {
  return [...list].sort((a,b)=> {
    if(sort==='created')return b.createdAt-a.createdAt||a.id.localeCompare(b.id);
    if(sort==='planned') {const get=(n:Notice)=>n.tasks.filter(t=>!t.done&&t.date).map(t=>t.date).sort()[0]||'9999';return get(a).localeCompare(get(b))||a.createdAt-b.createdAt||a.id.localeCompare(b.id);}
    return Number(overdue(b,now))-Number(overdue(a,now))||(a.deadline?.value||'9999').localeCompare(b.deadline?.value||'9999')||a.createdAt-b.createdAt||a.id.localeCompare(b.id);
  });
}
