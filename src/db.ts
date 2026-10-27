import Dexie, { type EntityTable } from 'dexie';
import { id, normalize, safeURL, type Notice, type Source, type Attachment, type ParseJob } from './model';
import { derive } from './rules';
export const db = new Dexie('xiaoshijian') as Dexie & { notices:EntityTable<Notice,'id'>; attachments:EntityTable<Attachment,'id'>; jobs:EntityTable<ParseJob,'id'> };
db.version(1).stores({notices:'id,life,createdAt,updatedAt',attachments:'id,noticeId,sourceId',jobs:'id,noticeId,sourceId,state'});
export async function change(id:string,fn:(n:Notice)=>Notice|void) {
  await db.transaction('rw',db.notices,async()=>{const n=await db.notices.get(id);if(!n)return;const changed=fn(n)||n;await db.notices.put({...changed,updatedAt:Date.now()});});
}
export async function addSource(input: {kind:Source['kind'];name:string;titleHint?:string;text?:string;url?:string;file?:File;noticeId?:string}) {
  const now=Date.now();const sourceId=id();const attachmentId=input.file?id():undefined;
  const source:Source={id:sourceId,kind:input.kind,name:input.name,titleHint:input.titleHint,url:safeURL(input.url),text:normalize(input.text||''),originalText:input.text||'',attachmentId};
  let noticeId=input.noticeId||id(); const job:ParseJob={id:id(),noticeId,sourceId,state:'waiting',progress:'原始输入已保存，等待处理',updatedAt:now};
  await db.transaction('rw',db.notices,db.attachments,db.jobs,async()=>{
    let n=input.noticeId?await db.notices.get(input.noticeId):undefined;
    if(input.noticeId&&!n)throw Error('关联通知不存在，请重新选择');
    if(!n)n={id:noticeId,title:input.name||'未命名通知',titleEdited:false,life:'review',deadlineEdited:false,createdAt:now,updatedAt:now,sources:[],dates:[],materials:[],tasks:[],dismissedMaterials:[]};
    n.sources.push(source);n.updatedAt=now;await db.notices.put(n);
    if(input.file)await db.attachments.put({id:attachmentId!,noticeId,sourceId,name:input.file.name,type:input.file.type,size:input.file.size,blob:input.file});
    await db.jobs.add(job);
  });
  return {noticeId,jobId:job.id};
}
export async function rederive(noticeId:string) { await change(noticeId,n=>derive(n)); }
export async function deleteNotice(noticeId:string) {
  await db.transaction('rw',db.notices,db.attachments,db.jobs,async()=>{await db.notices.delete(noticeId);await db.attachments.where('noticeId').equals(noticeId).delete();await db.jobs.where('noticeId').equals(noticeId).delete();});
}
export async function clearData() {await db.transaction('rw',db.notices,db.attachments,db.jobs,async()=>{await db.notices.clear();await db.attachments.clear();await db.jobs.clear();});}
