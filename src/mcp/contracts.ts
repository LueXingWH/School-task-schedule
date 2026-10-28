import {z} from 'zod';
import {validDay} from '../rules/dates';
import {id,type Notice,type PersonalTask} from '../model';

const day=z.string().refine(validDay,'日期必须为有效的 YYYY-MM-DD');
export const addScheduleInput=z.strictObject({
  request_id:z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
  title:z.string().trim().min(1).max(200),date:day,
  time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  notes:z.string().max(4000).default('')
});
export const listSchedulesInput=z.strictObject({date_from:day.optional(),date_to:day.optional(),include_done:z.boolean().default(false),limit:z.number().int().min(1).max(100).default(50)})
  .refine(x=>!x.date_from||!x.date_to||x.date_from<=x.date_to,'起始日期不能晚于结束日期');
export const clientName=z.string().trim().min(1).max(100);
export type ScheduleInput=z.infer<typeof addScheduleInput>;
export const requestKey=(client:string,requestId:string)=>JSON.stringify([client,requestId]);
export const fingerprintText=(input:ScheduleInput)=>JSON.stringify([input.title,input.date,input.time||'',input.notes]);

export function scheduleNotice(input:ScheduleInput,client:string,fingerprint:string):Notice {
  const now=Date.now(),noticeId=id();
  const text=`标题：${input.title}\n计划日期：${input.date}${input.time?' '+input.time:''}\n备注：${input.notes}`;
  return {id:noticeId,title:input.title,titleEdited:true,life:'active',deadlineEdited:true,createdAt:now,updatedAt:now,
    sources:[{id:id(),kind:'text',name:`MCP · ${client}`,text,originalText:text}],dates:[],materials:[],actions:[],dismissedMaterials:[],
    tasks:[{id:id(),text:input.title,date:input.date,time:input.time,done:false,agent:{client,requestId:input.request_id,fingerprint,notes:input.notes}}]};
}
export function scheduleView(n:Notice,t:PersonalTask){
  return {id:t.id,noticeId:n.id,title:t.text,date:t.date,...(t.time?{time:t.time}:{}),done:t.done,noticeState:n.life,
    source:t.agent?`MCP · ${t.agent.client}`:'个人任务',...(t.agent?{notes:t.agent.notes}:{} )};
}
export function scheduleList(notices:Notice[],input:z.infer<typeof listSchedulesInput>){
  const list=notices.filter(n=>input.include_done||n.life!=='done'&&n.life!=='archived').flatMap(n=>n.tasks.filter(t=>
    (input.include_done||!t.done)&&(!input.date_from||t.date>=input.date_from)&&(!input.date_to||t.date<=input.date_to)).map(t=>{
      const view=scheduleView(n,t);return view.notes&&view.notes.length>500?{...view,notes:view.notes.slice(0,500),notes_truncated:true}:view;
    }))
    .sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'99:99').localeCompare(b.time||'99:99')||a.id.localeCompare(b.id));
  return {items:list.slice(0,input.limit),has_more:list.length>input.limit,total:list.length};
}
