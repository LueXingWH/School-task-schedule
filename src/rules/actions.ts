import {id,type ActionCandidate,type DateCandidate,type Notice,type Source} from '../model';
import {extractDates,validDeadline} from './dates';

const verb=/(?:提交|报送|填写|上传|报名|申报|注册|缴纳|缴费|签到|参加|完成|准备|领取|确认|发送|打印|签字|盖章|下载|交回|交齐|递交)/;
const compact=(text:string)=>text.replace(/([\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g,'$1');

export function extractActions(source:Source,dates:DateCandidate[]=extractDates(source)):ActionCandidate[] {
  const out:ActionCandidate[]=[];const seen=new Set<string>();
  let section=false;let dateHeading:DateCandidate[]=[];
  for(const match of source.text.matchAll(/[^\n；;。！？!?，,]+/g)) {
    const raw=match[0],start=match.index!,end=start+raw.length;
    const content=compact(raw).trim().replace(/^(?:[（(]?[一二三四五六七八九十\d]+[）)、.．]|[-•●])\s*/, '');
    if(/^【第\d+页】$/.test(content)){section=false;dateHeading=[];continue;}
    if(/^(?:待办事项|办理事项|任务清单|需完成事项|提交材料|报名材料|申报材料)\s*[:：]?$/.test(content)){section=true;continue;}
    if(/^(?:联系人|联系方式|注意事项|主办单位|版权所有|copyright|©)/i.test(content)){section=false;dateHeading=[];continue;}
    if(/^(?:材料名称|序号|项目名称)\s*\|/.test(content))continue;
    const localDates=dates.filter(d=>d.start>=start&&d.end<=end);
    if(/^(?:截止时间|截止日期|报名时间|提交时间)\s*[:：]/.test(content)&&localDates.length===1&&!verb.test(content.replace(/^(?:截止时间|截止日期|报名时间|提交时间)/,''))){dateHeading=localDates;continue;}
    const action=verb.exec(content);
    if(!action&&!section){dateHeading=[];continue;}
    // Titles, announcements and explicit prohibitions are not tasks.
    if(/无需|无须|不需|不必|不用|禁止|切勿|请勿|不要|免交/.test(content)||/通知\s*$/.test(content)||/^(?:发布|公布|公示|初审结果|评审结果)/.test(content)){dateHeading=[];continue;}
    if(!action&&!/表|书|PPT|视频|材料|证明|清单/i.test(content)){dateHeading=[];continue;}
    let text=content;
    for(const d of [...localDates].reverse())text=text.replace(compact(d.raw).trim(),'');
    text=text.replace(/^(?:请|务必|需要|须|需|应|可选|自愿|可|于|在|最迟|截至|截止|时间|日期|前|之前|之前完成|[:：\s])+/,'').trim();
    const verbAt=verb.exec(text);
    if(/^(?:报名表|申报表|申请表)/.test(text))text='准备'+text;
    else if(verbAt)text=text.slice(verbAt.index);
    else text='准备'+text;
    text=text.replace(/(?:截止|截至)\s*[:：]?\s*$/,'').replace(/[:：\s]+$/,'').trim();
    if(text==='报名'||text==='申报')text='完成'+text;
    if(text.length<3||text.length>1000)continue;
    const originKey=source.id+':'+content.replace(/\s/g,'');
    if(seen.has(originKey))continue;seen.add(originKey);
    const candidates=localDates.length?localDates:dateHeading;
    const known=candidates.length===1&&candidates[0].valid&&!candidates[0].tentative?candidates[0].value:undefined;
    const timeNote=known?'原文时间 · 待核对':candidates.length>1?'多个时间，待确认':candidates[0]?.tentative?'暂定时间，待确认':candidates[0]?.note||'未找到对应时间，待确认';
    let page:number|undefined;let cursor=0;
    for(const p of source.pages||[]){const length=`【第${p.page}页】\n${p.text}`.length;if(start>=cursor&&start<cursor+length){page=p.page;break;}cursor+=length+2;}
    const optional=/可选|自愿|选交|非必交|可提交|可参加/.test(content);
    out.push({id:id(),text,time:known,timeNote,optional,selected:!optional,originKey,evidence:{sourceId:source.id,start,end,snippet:raw,ruleId:'action.explicit-clause.v1',page}});
    // A date heading applies to the following list until another heading or blank paragraph.
    const next=source.text.slice(end).match(/^[\s\n]*/)?.[0]||'';
    if(next.includes('\n\n')){section=false;dateHeading=[];}
  }
  return out;
}

export function mergeActions(n:Notice,dates:DateCandidate[]):ActionCandidate[] {
  const old=n.actions||[];
  return n.sources.flatMap(s=>extractActions(s,dates.filter(d=>d.sourceId===s.id))).map(action=>{
    const previous=old.find(a=>a.originKey===action.originKey);
    return previous?{...action,...previous,evidence:action.evidence}:action;
  });
}

/** Only this explicit user action promotes suggestions into the personal schedule. */
export function confirmSchedule(n:Notice):{added:number;unresolved:number} {
  let added=0,unresolved=0;
  for(const a of n.actions||[]) {
    if(a.dismissed||!a.selected||a.taskId&&n.tasks.some(t=>t.id===a.taskId))continue;
    if(!a.time||!validDeadline(a.time)){unresolved++;continue;}
    const date=a.time.slice(0,10),time=a.time.split('T')[1];
    const existing=n.tasks.find(t=>t.text.trim()===a.text.trim()&&t.date===date&&(!t.time||t.time===time));
    if(existing){a.taskId=existing.id;continue;}
    const taskId=id();n.tasks.push({id:taskId,text:a.text,date,time,done:false});a.taskId=taskId;added++;
  }
  if(n.deadline&&!n.deadline.confirmed){n.deadline.confirmed=true;n.deadlineEdited=true;}
  return {added,unresolved};
}
