import { id, type Material, type Source } from '../model';
export const materialKey = (sourceId: string, name: string) => sourceId + ':' + name.replace(/\s/g,'').toLowerCase();
export function extractMaterials(source: Source): Material[] {
  const result: Material[] = []; const seen = new Set<string>();
  const names = /(?:[\u4e00-\u9fffA-Za-z]{0,8})?(?:报名表|汇总表|申请表|申报表|承诺书|作品说明|作品介绍PPT|PPT|演示视频|介绍视频|身份证复印件|成绩单|证明材料)/gi;
  let inSection = false; let offset = 0;
  for (const line of source.text.split('\n')) {
    if (/提交材料|报名材料|申报材料|需提交|须提交|报送材料|附件/.test(line)) inSection=true;
    else if (/联系人|联系方式|评审安排|初审安排|注意事项|活动时间/.test(line)) inSection=false;
    if (inSection || /提交|报送|提供|无需|非必交|可选/.test(line)) {
      for (const m of line.matchAll(names)) {
        let name = m[0].replace(/^(?:需|须|请|要|可|应|另|并|同时|提交|报送|提供|无需|纸质|电子版|可选|非必交)+/g,'').trim();
        if(!name || seen.has(name.toLowerCase())) continue;
        const clauseStart = Math.max(line.lastIndexOf('，',m.index!),line.lastIndexOf(',',m.index!),line.lastIndexOf('；',m.index!)) + 1;
        const ends=['，',',','；',';'].map(c=>line.indexOf(c,m.index!+m[0].length)).filter(i=>i>=0);
        const context = line.slice(clauseStart,ends.length?Math.min(...ends):line.length);
        const requirement = /无需|不需|不用|免交/.test(context) ? 'excluded' : /可选|非必交|可提交|自愿|选交/.test(context) ? 'optional' : 'required';
        seen.add(name.toLowerCase());
        const start=offset+m.index!; let page: number | undefined;
        if(source.pages) { let cursor=0; for(const p of source.pages) { const len=`【第${p.page}页】\n${p.text}`.length; if(start>=cursor&&start<cursor+len){page=p.page;break;}cursor+=len+2;} }
        result.push({id:id(),name,requirement,done:false,origin:'machine',originKey:materialKey(source.id,name),evidence:{sourceId:source.id,start,end:start+m[0].length,snippet:line,ruleId:'material.explicit-list.v1',page}});
      }
    }
    offset += line.length+1;
  }
  return result;
}
