import Dexie, { type EntityTable } from 'dexie';
import { id, normalize, normalizeLife, safeURL, type Notice, type Source, type Attachment, type ParseJob, type McpReceipt } from './model';
import { derive } from './rules';
export const db = new Dexie('xiaoshijian') as Dexie & { notices:EntityTable<Notice,'id'>; attachments:EntityTable<Attachment,'id'>; jobs:EntityTable<ParseJob,'id'>; mcpRequests:EntityTable<McpReceipt,'key'> };
db.version(1).stores({notices:'id,life,createdAt,updatedAt',attachments:'id,noticeId,sourceId',jobs:'id,noticeId,sourceId,state'});
db.version(2).stores({mcpRequests:'key,noticeId'});
db.version(3).stores({}).upgrade(tx=>tx.table('notices').toCollection().modify(n=>{n.life=normalizeLife(n.life);}));
export async function change(id:string,fn:(n:Notice)=>Notice|void) {
  await db.transaction('rw',db.notices,async()=>{const n=await db.notices.get(id);if(!n)return;const changed=fn(n)||n;await db.notices.put({...changed,updatedAt:Date.now()});});
}
export interface SourceInput {kind:Source['kind'];name:string;titleHint?:string;text?:string;url?:string;file?:File}
export async function addSource(input:SourceInput & {noticeId?:string}) {
  return (await addSources([input],{noticeId:input.noticeId}))[0];
}
/** Save an entire import in one transaction. Single mode groups sources; batch mode creates one notice per input. */
export async function addSources(inputs:SourceInput[],options:{noticeId?:string;separate?:boolean}={}) {
  if(!inputs.length)throw Error('请选择要导入的内容');
  if(options.noticeId&&options.separate)throw Error('批量导入不能关联到同一日程');
  const now=Date.now();const results:{noticeId:string;jobId:string}[]=[];
  await db.transaction('rw',db.notices,db.attachments,db.jobs,async()=>{
    let n=options.noticeId?await db.notices.get(options.noticeId):undefined;
    if(options.noticeId&&!n)throw Error('关联通知不存在，请重新选择');
    for(const input of inputs){
      if(!n||options.separate)n={id:id(),title:input.name||'未命名通知',titleEdited:false,life:'active',deadlineEdited:false,createdAt:now,updatedAt:now,sources:[],dates:[],materials:[],tasks:[],dismissedMaterials:[]};
      const sourceId=id(),attachmentId=input.file?id():undefined,noticeId=n.id;
      const source:Source={id:sourceId,kind:input.kind,name:input.name,titleHint:input.titleHint,url:safeURL(input.url),text:normalize(input.text||''),originalText:input.text||'',attachmentId};
      const job:ParseJob={id:id(),noticeId,sourceId,state:'waiting',progress:'原始输入已保存，等待处理',updatedAt:now};
      n.sources.push(source);n.updatedAt=now;await db.notices.put(n);
      if(input.file)await db.attachments.put({id:attachmentId!,noticeId,sourceId,name:input.file.name,type:input.file.type,size:input.file.size,blob:input.file});
      await db.jobs.add(job);results.push({noticeId,jobId:job.id});
    }
  });
  return results;
}
export async function rederive(noticeId:string) { await change(noticeId,n=>derive(n)); }
export async function deleteNotice(noticeId:string) {
  await db.transaction('rw',db.notices,db.attachments,db.jobs,async()=>{await db.notices.delete(noticeId);await db.attachments.where('noticeId').equals(noticeId).delete();await db.jobs.where('noticeId').equals(noticeId).delete();});
}
export async function clearData() {await db.transaction('rw',db.notices,db.attachments,db.jobs,db.mcpRequests,async()=>{await db.notices.clear();await db.attachments.clear();await db.jobs.clear();await db.mcpRequests.clear();});}
