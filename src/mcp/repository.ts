import {db} from '../db';
import {addScheduleInput,clientName,fingerprintText,listSchedulesInput,requestKey,scheduleList,scheduleNotice,scheduleView} from './contracts';

export async function callScheduleTool(tool:string,args:unknown,caller:string){
  const client=clientName.parse(caller);
  if(tool==='list_schedules')return {...scheduleList(await db.notices.toArray(),listSchedulesInput.parse(args)),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone};
  if(tool!=='add_schedule')throw Error('未知日程工具');
  const input=addScheduleInput.parse(args),key=requestKey(client,input.request_id);
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(fingerprintText(input)));
  const fingerprint=Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
  const result=await db.transaction('rw',db.notices,db.mcpRequests,async()=>{
    const old=await db.mcpRequests.get(key);
    if(old){
      if(old.fingerprint!==fingerprint)throw Error('该 request_id 已用于不同内容，请为新日程使用新 ID');
      const n=await db.notices.get(old.noticeId),task=n?.tasks.find(t=>t.id===old.taskId);
      if(!n||!task)throw Error('该请求创建的日程已删除；如需重新创建，请使用新 request_id');
      return {schedule:scheduleView(n,task),created:false};
    }
    // Restore retains task provenance, allowing safe retries even after a backup migration.
    for(const n of await db.notices.toArray()){
      const t=n.tasks.find(t=>t.agent?.client===client&&t.agent.requestId===input.request_id);
      if(t){if(t.agent!.fingerprint!==fingerprint)throw Error('备份中相同 request_id 的内容不同，请使用新 ID');
        await db.mcpRequests.add({key,fingerprint,noticeId:n.id,taskId:t.id});return {schedule:scheduleView(n,t),created:false};}
    }
    const n=scheduleNotice(input,client,fingerprint),t=n.tasks[0];await db.notices.add(n);
    await db.mcpRequests.add({key,fingerprint,noticeId:n.id,taskId:t.id});
    return {schedule:scheduleView(n,t),created:true};
  });
  return {...result,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone};
}
