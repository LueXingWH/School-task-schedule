import type { Notice } from './model';
export const localDay = (d=new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const actionable = (n:Notice)=>n.life!=='done'&&n.life!=='archived';
export function overdue(n:Notice,now=new Date()) { const d=n.deadline; return actionable(n)&&!!d?.confirmed&&(d.precision==='day'?d.value<localDay(now):new Date(d.value).getTime()<now.getTime()); }
export function today(n:Notice,now=new Date()) { return actionable(n)&&(n.tasks.some(t=>!t.done&&t.date===localDay(now))||!!n.deadline?.confirmed&&n.deadline.value.slice(0,10)===localDay(now)); }
export function upcoming(n:Notice,days:number,now=new Date()) { const day=n.deadline?.value.slice(0,10); const until=new Date(now);until.setDate(until.getDate()+days);return actionable(n)&&!!day&&day>=localDay(now)&&day<=localDay(until); }
export function sortNotices(list:Notice[],sort='deadline',now=new Date()) {
  return [...list].sort((a,b)=> {
    if(sort==='created')return b.createdAt-a.createdAt||a.id.localeCompare(b.id);
    if(sort==='planned') {const get=(n:Notice)=>n.tasks.filter(t=>!t.done&&t.date).map(t=>t.date).sort()[0]||'9999';return get(a).localeCompare(get(b))||a.createdAt-b.createdAt||a.id.localeCompare(b.id);}
    return Number(overdue(b,now))-Number(overdue(a,now))||(a.deadline?.value||'9999').localeCompare(b.deadline?.value||'9999')||a.createdAt-b.createdAt||a.id.localeCompare(b.id);
  });
}
