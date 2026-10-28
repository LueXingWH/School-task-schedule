import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { z } from 'zod';
import { db } from './db';
import { inspectZip } from './zip';
import { id, LIMITS, safeURL, type Attachment, type Notice, type ParseJob } from './model';
import { validDeadline } from './rules/dates';
const key=z.string().min(1).max(150);const text=z.string().max(LIMITS.textChars);const time=z.number().finite().nonnegative();
const evidence=z.object({sourceId:key,page:z.number().int().positive().max(LIMITS.pdfPages).optional(),start:z.number().int().nonnegative(),end:z.number().int().nonnegative(),snippet:text,ruleId:key});
const source=z.object({id:key,kind:z.enum(['text','web','image','pdf','docx']),name:z.string().max(1000),titleHint:z.string().max(1000).optional(),url:z.string().max(8192).optional(),text,originalText:text,attachmentId:key.optional(),editedAt:time.optional(),rotation:z.number().int().optional(),warnings:z.array(text).max(200).optional(),pages:z.array(z.object({page:z.number().int().positive().max(100),text,method:z.enum(['text','scan','ocr']),error:text.optional()})).max(100).optional()});
const date=evidence.extend({id:key,raw:text,value:z.string().refine(validDeadline).optional(),precision:z.enum(['day','minute','unknown']),role:z.enum(['deadline','other','unknown']),tentative:z.boolean(),valid:z.boolean(),note:text});
const material=z.object({id:key,name:z.string().min(1).max(1000),requirement:z.enum(['required','optional','excluded']),done:z.boolean(),origin:z.enum(['machine','manual']),originKey:text.optional(),edited:z.boolean().optional(),evidence:evidence.optional()});
const action=z.object({id:key,text:z.string().min(1).max(1000),time:z.string().refine(validDeadline).optional(),timeNote:text,optional:z.boolean(),selected:z.boolean(),originKey:text,evidence,edited:z.boolean().optional(),dismissed:z.boolean().optional(),taskId:key.optional()});
const notice=z.object({id:key,title:z.string().max(1000),titleEdited:z.boolean(),life:z.enum(['review','active','done','archived']),deadline:z.object({value:z.string().refine(validDeadline),precision:z.enum(['day','minute']),confirmed:z.boolean(),candidateId:key.optional()}).optional(),deadlineEdited:z.boolean(),createdAt:time,updatedAt:time,sources:z.array(source).max(1000),dates:z.array(date).max(10000),materials:z.array(material).max(10000),actions:z.array(action).max(10000).optional(),tasks:z.array(z.object({id:key,text:z.string().min(1).max(1000),date:z.string().refine(s=>validDeadline(s)&&s.length===10),time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),done:z.boolean()})).max(10000),dismissedMaterials:z.array(text).max(10000)});
const meta=z.object({id:key,noticeId:key,sourceId:key,name:z.string().max(1000),type:z.string().max(200),size:z.number().int().nonnegative().max(LIMITS.fileBytes),sha256:z.string().regex(/^[a-f0-9]{64}$/),path:z.string()});
const job=z.object({id:key,noticeId:key,sourceId:key,state:z.enum(['waiting','running','success','partial','failed','cancelled']),progress:text,updatedAt:time,pages:z.array(z.number().int().positive().max(100)).max(10).optional(),error:text.optional()});
const schema=z.object({format:z.literal('xiaoshijian-backup'),schema:z.literal(1),createdAt:time,notices:z.array(notice).max(10000),attachments:z.array(meta).max(10000),jobs:z.array(job).max(20000)});
const sha=async(data:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(data).buffer)),x=>x.toString(16).padStart(2,'0')).join('');
export async function makeBackup() {
  const snapshot=await db.transaction('r',db.notices,db.attachments,db.jobs,async()=>({notices:await db.notices.toArray(),attachments:await db.attachments.toArray(),jobs:await db.jobs.toArray()}));
  const files:Record<string,Uint8Array>={};let total=0;
  const attachments=[];
  for(const a of snapshot.attachments){total+=a.size;if(total>LIMITS.backupUnpack-10*1024**2)throw Error('完整备份超过本版 250 MB 展开限额，请减少附件后重试');const bytes=new Uint8Array(await a.blob.arrayBuffer());const path=`files/${a.id}`;files[path]=bytes;const {blob,...info}=a;attachments.push({...info,path,sha256:await sha(bytes)});}
  files['data.json']=strToU8(JSON.stringify({format:'xiaoshijian-backup',schema:1,createdAt:Date.now(),notices:snapshot.notices,attachments,jobs:snapshot.jobs}));
  const result=zipSync(files,{level:1});if(result.length>LIMITS.backupBytes)throw Error('备份超过 100 MB 压缩限额，请减少附件');return new Blob([new Uint8Array(result).buffer],{type:'application/zip'});
}
export async function readBackup(file:Blob) {
  if(file.size>LIMITS.backupBytes)throw Error('备份压缩文件不能超过 100 MB');
  const bytes=new Uint8Array(await file.arrayBuffer());const entries=inspectZip(bytes,LIMITS.backupUnpack,11000);
  if(!entries.has('data.json')||entries.get('data.json')!>20*1024**2)throw Error('备份缺少或包含过大的 data.json');
  const files=unzipSync(bytes);const parsed=schema.safeParse(JSON.parse(strFromU8(files['data.json'])));if(!parsed.success)throw Error('备份格式或 schema 版本不合法：'+parsed.error.issues[0]?.message);
  const data=parsed.data;const allIds=new Set<string>();const add=(s:string)=>{if(allIds.has(s))throw Error('备份包含重复 ID');allIds.add(s);};
  const sourceMap=new Map<string,{noticeId:string;text:string;attachmentId?:string}>();
  for(const n of data.notices){add(n.id);for(const s of n.sources){add(s.id);if(s.url&&!safeURL(s.url))throw Error('来源链接不合法');sourceMap.set(s.id,{noticeId:n.id,text:s.text,attachmentId:s.attachmentId});}for(const d of n.dates)add(d.id);for(const m of n.materials)add(m.id);for(const t of n.tasks)add(t.id);for(const a of n.actions||[])add(a.id);}
  const attachments:Attachment[]=[];
  for(const a of data.attachments){add(a.id);const s=sourceMap.get(a.sourceId);const bytes=files[a.path];if(a.path!==`files/${a.id}`||!s||s.noticeId!==a.noticeId||s.attachmentId!==a.id||!bytes||bytes.length!==a.size||await sha(bytes)!==a.sha256)throw Error('备份附件关系、大小或校验值不匹配');attachments.push({id:a.id,noticeId:a.noticeId,sourceId:a.sourceId,name:a.name,type:a.type,size:a.size,blob:new Blob([new Uint8Array(bytes).buffer],{type:a.type})});}
  if(entries.size!==attachments.length+1)throw Error('备份包含未声明文件');
  for(const n of data.notices){for(const s of n.sources)if(s.attachmentId&&!attachments.some(a=>a.id===s.attachmentId))throw Error('缺少源文件');for(const e of [...n.dates,...n.materials.map(m=>m.evidence).filter(Boolean),...(n.actions||[]).map(a=>a.evidence)]){const s=sourceMap.get(e!.sourceId);if(!s||s.noticeId!==n.id||e!.start>e!.end||e!.end>s.text.length)throw Error('候选来源或文本区间不合法');}if(n.deadline?.candidateId&&!n.dates.some(d=>d.id===n.deadline!.candidateId))throw Error('主截止日候选关联不合法');for(const a of n.actions||[])if(!a.originKey.startsWith(a.evidence.sourceId+':')||a.taskId&&!n.tasks.some(t=>t.id===a.taskId))throw Error('待办来源或日程关联不合法');}
  for(const j of data.jobs){add(j.id);if(sourceMap.get(j.sourceId)?.noticeId!==j.noticeId)throw Error('任务来源关系错误');}
  return {notices:data.notices as Notice[],attachments,jobs:data.jobs as ParseJob[]};
}
export async function restoreBackup(data:Awaited<ReturnType<typeof readBackup>>) {
  // Merge as new copies with a fully remapped identity graph; never overwrite existing records.
  const ids=new Map<string,string>();const remap=(s:string)=>{if(!ids.has(s))ids.set(s,id());return ids.get(s)!;};
  const notices=data.notices.map(n=>({...n,id:remap(n.id),sources:n.sources.map(s=>({...s,id:remap(s.id),attachmentId:s.attachmentId?remap(s.attachmentId):undefined})),dates:n.dates.map(d=>({...d,id:remap(d.id),sourceId:remap(d.sourceId)})),materials:n.materials.map(m=>({...m,id:remap(m.id),originKey:m.originKey?remap(m.originKey.slice(0,m.originKey.indexOf(':')))+m.originKey.slice(m.originKey.indexOf(':')):undefined,evidence:m.evidence?{...m.evidence,sourceId:remap(m.evidence.sourceId)}:undefined})),actions:n.actions?.map(a=>({...a,id:remap(a.id),originKey:remap(a.evidence.sourceId)+a.originKey.slice(a.originKey.indexOf(':')),evidence:{...a.evidence,sourceId:remap(a.evidence.sourceId)},taskId:a.taskId?remap(a.taskId):undefined})),tasks:n.tasks.map(t=>({...t,id:remap(t.id)})),deadline:n.deadline?{...n.deadline,candidateId:n.deadline.candidateId?remap(n.deadline.candidateId):undefined}:undefined,dismissedMaterials:n.dismissedMaterials.map(k=>{const i=k.indexOf(':');return remap(k.slice(0,i))+k.slice(i);})}));
  const attachments=data.attachments.map(a=>({...a,id:remap(a.id),noticeId:remap(a.noticeId),sourceId:remap(a.sourceId)}));
  const jobs=data.jobs.map(j=>({...j,id:remap(j.id),noticeId:remap(j.noticeId),sourceId:remap(j.sourceId),state:j.state==='running'||j.state==='waiting'?'cancelled' as const:j.state,progress:j.state==='running'||j.state==='waiting'?'恢复了中断任务，请手动重试':j.progress}));
  await db.transaction('rw',db.notices,db.attachments,db.jobs,async()=>{await db.notices.bulkAdd(notices);await db.attachments.bulkAdd(attachments);await db.jobs.bulkAdd(jobs);});return notices.length;
}
export function download(blob:Blob,name:string){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
