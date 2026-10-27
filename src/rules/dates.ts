import { id, type DateCandidate, type Source } from '../model';
export function validDay(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y,m,d] = s.split('-').map(Number); const date = new Date(y, m - 1, d);
  return y >= 1900 && y <= 2200 && date.getFullYear() === y && date.getMonth() === m-1 && date.getDate() === d;
}
export function validDeadline(value: string) {
  const [day, time] = value.split('T');
  return validDay(day) && (!time || /^([01]\d|2[0-3]):[0-5]\d$/.test(time));
}
export function extractDates(source: Source): DateCandidate[] {
  const text = source.text; const out: DateCandidate[] = [];
  // A year is inherited only from an explicit full date in this document, never from the computer clock or copyright.
  const reliable = text.split(/[\n；;。]/).filter(x => !/版权|copyright|©/i.test(x)).join('\n');
  const years = [...new Set([...reliable.matchAll(/(20\d{2})\s*(?:年|[-/.])\s*\d{1,2}\s*(?:月|[-/.])\s*\d{1,2}/g)].map(m=>m[1]))];
  const re = /(?:(20\d{2})\s*(?:年|[-/.])\s*)?(\d{1,2})\s*(?:月|[-/.])\s*(\d{1,2})(?:日|号)?(?:\s*([0-2]?\d)\s*[:：时]\s*([0-5]?\d)?\s*分?)?/g;
  for (const m of text.matchAll(re)) {
    const start = m.index!; const end = start + m[0].length;
    const left = Math.max(text.lastIndexOf('\n', start), text.lastIndexOf('；', start), text.lastIndexOf(';', start), text.lastIndexOf('。', start)) + 1;
    const boundaries = ['\n','；',';','。'].map(c=>text.indexOf(c,end)).filter(n=>n>=0);
    const right = boundaries.length ? Math.min(...boundaries) : text.length;
    const segment = text.slice(left, right);
    const local = text.slice(Math.max(left,start-18), Math.min(right,end+20));
    let role: DateCandidate['role'] = /初审|公示|评审|评选|展出|活动时间|开幕|发布|公布|版权|copyright|©/i.test(segment) ? 'other' : /报名|申报|提交|报送|截止|截至|最迟|日前/.test(local) ? 'deadline' : 'unknown';
    if (/\d\s*(?:日|号)?\s*(?:至|到|—|~|～)\s*(?:20\d{2}年)?\d/.test(segment)) role = 'other';
    const year = m[1] || (years.length === 1 && !/版权|copyright|©/i.test(segment) ? years[0] : undefined);
    const day = year ? `${year}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}` : undefined;
    const time = m[4] !== undefined ? `${m[4].padStart(2,'0')}:${(m[5] || '0').padStart(2,'0')}` : '';
    const valid = day ? validDay(day) && (!time || /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) : Number(m[2])>=1 && Number(m[2])<=12 && Number(m[3])>=1 && Number(m[3])<=31;
    const tentative = /暂定|初定|拟定|预计/.test(segment);
    const note = [!year ? '缺少可靠年份，请补全' : !m[1] ? '年份来自同一正文中的完整日期' : '', !valid ? '无效日历日期' : '', /日前/.test(local) ? '“日前”边界请核对原文' : '', tentative ? '暂定时间' : ''].filter(Boolean).join('；');
    out.push({ id:id(), sourceId:source.id, start,end,snippet:segment, raw:m[0], ruleId:'date.calendar-context.v1', value:valid && day ? day+(time?`T${time}`:'') : undefined, precision:day ? time ? 'minute':'day':'unknown',role,tentative,valid,note });
  }
  for (const m of text.matchAll(/(?:[一二三四五六七八九十\d]+天后|明天|后天|本周[一二三四五六日天])[^\n；;。]{0,8}(?:截止|提交)/g)) {
    out.push({id:id(),sourceId:source.id,start:m.index!,end:m.index!+m[0].length,snippet:m[0],raw:m[0],ruleId:'date.relative-unresolved.v1',precision:'unknown',role:'deadline',tentative:false,valid:true,note:'相对日期缺可靠基准，未转换'});
  }
  // Page offsets refer to the exact saved text including page separators.
  if (source.pages) for (const d of out) {
    let offset = 0;
    for (const p of source.pages) { const block = `【第${p.page}页】\n${p.text}`; if(d.start >= offset && d.start < offset + block.length) {d.page=p.page;break;} offset += block.length+2; }
  }
  return out;
}
