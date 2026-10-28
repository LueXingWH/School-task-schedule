import { db, change } from './db';
import { derive } from './rules';
import { docxText, imageCanvas, ocrImage, pdfText, joinPages } from './parsers';
import { LIMITS,normalize,type ParseJob } from './model';
import { liveQuery } from 'dexie';
const running=new Map<string,AbortController>();
export function cancelJob(id:string){running.get(id)?.abort();void db.jobs.update(id,{state:'cancelled',progress:'已取消，原始输入仍保留',updatedAt:Date.now()});}
export async function runJob(jobId:string) {
  // Web Locks serialize heavy parsing across every open dashboard and prevent duplicate work.
  return navigator.locks.request('xiaoshijian.parse',{ifAvailable:true},async lock=>{
    if(!lock)return;
    const job=await db.jobs.get(jobId);if(!job||job.state==='success'||job.state==='cancelled')return;
    const n=await db.notices.get(job.noticeId),source=n?.sources.find(s=>s.id===job.sourceId);if(!source)return;
    const ctl=new AbortController();running.set(job.id,ctl);
    const update=(patch:Partial<ParseJob>)=>db.jobs.update(job.id,{...patch,updatedAt:Date.now()});
    let last=0;const progress=(s:string)=>{if(Date.now()-last>250){last=Date.now();void update({progress:s});}};
    await update({state:'running',error:undefined,progress:'已保存，正在本地处理'});
    const subscription=liveQuery(()=>db.jobs.get(job.id)).subscribe(j=>{if(!j||j.state==='cancelled')ctl.abort();});
    try {
      const attachment=source.attachmentId?await db.attachments.get(source.attachmentId):undefined;
      let result:{text:string;warnings?:string[];pages?:typeof source.pages}={text:source.text};
      if(attachment) {
        if(source.kind==='text') {result.text=normalize(await attachment.blob.text());if(result.text.includes('\uFFFD'))throw Error('文字编码无法识别，请另存为 UTF-8 后重试');if(result.text.length>LIMITS.textChars)throw Error('文字超过一百万字符，请分批导入');}
        if(source.kind==='image') {const canvas=await imageCanvas(attachment.blob,source.rotation);try{result.text=await ocrImage(canvas,ctl.signal,progress);}finally{canvas.width=canvas.height=0;}}
        else if(source.kind==='docx'){progress('读取 DOCX 段落与表格');result=await docxText(attachment.blob,ctl.signal);}
        else if(source.kind==='pdf')result=await pdfText(attachment.blob,source,job.pages,ctl.signal,progress,async pages=>{
          await change(job.noticeId,n=>{const s=n.sources.find(s=>s.id===source.id);if(s&&s.editedAt===source.editedAt){s.pages=structuredClone(pages);s.text=joinPages(pages);}});
        });
      }
      if(ctl.signal.aborted)throw new DOMException('已取消','AbortError');
      await change(job.noticeId,n=>{const s=n.sources.find(s=>s.id===source.id);if(s&&s.editedAt===source.editedAt){s.text=result.text;if(!s.originalText)s.originalText=result.text;s.pages=result.pages||s.pages;s.warnings=result.warnings;if(source.kind==='image'&&!result.text)s.warnings=['未识别出正文，请手动填写或换清晰图片'];}return derive(n);});
      const partial=!!result.warnings?.length||!result.text;
      await update({state:partial?'partial':'success',progress:partial?'部分完成，请检查正文及扫描页':'处理完成，候选仍需核对'});
    }catch(e){const cancelled=ctl.signal.aborted;await update({state:cancelled?'cancelled':'failed',progress:cancelled?'已取消，原始文件保留':'解析失败，原始输入保留，可编辑或重试',error:cancelled?undefined:(e instanceof Error?e.message:String(e))});}
    finally{subscription.unsubscribe();running.delete(job.id);}
  });
}
export async function queueSource(noticeId:string,sourceId:string,pages?:number[]){const job:ParseJob={id:crypto.randomUUID(),noticeId,sourceId,pages,state:'waiting',progress:'已排队',updatedAt:Date.now()};await db.jobs.add(job);return job.id;}
export async function retryJob(job:ParseJob){await db.jobs.update(job.id,{state:'waiting',error:undefined});}
