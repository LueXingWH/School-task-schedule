import type {Source} from '../model';

/** An extractive overview: every sentence comes from saved text, never invented requirements. */
export function summaryFrom(sources:Source[],title:string):string {
  const seen=new Set<string>();
  const sentences=sources.flatMap(s=>s.text.split(/\n|(?<=[。！？!?])/)).map(s=>s.trim())
    .filter(s=>s.length>=5&&s.replace(/\s/g,'')!==title.replace(/\s/g,'')&&!/^(?:【第\d+页】|https?:|联系人|联系方式|主办单位|来源[:：]|发布时间|版权所有|copyright|©)/i.test(s))
    .filter(s=>{const key=s.replace(/\s/g,'');if(seen.has(key))return false;seen.add(key);return true;});
  const ranked=sentences.map((text,index)=>({text,index,score:Number(/截止|截至|最迟/.test(text))*3+Number(/提交|报送|报名|申报|参加|领取|需完成|材料/.test(text))*2+Number(index===0)}));
  return ranked.sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,3).sort((a,b)=>a.index-b.index)
    .map(s=>s.text.length>150?s.text.slice(0,149)+'…':s.text).join('\n').slice(0,450);
}
