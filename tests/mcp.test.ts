import {describe,it,expect} from 'vitest';
import {addScheduleInput,listSchedulesInput,scheduleNotice,scheduleList,fingerprintText,requestKey} from '../src/mcp/contracts';
import {today} from '../src/schedule';
import {readBackup} from '../src/backup';
import {zipSync,strToU8} from 'fflate';
import tools from '../bridge/tools.json';

const input=()=>addScheduleInput.parse({request_id:'test.001',title:'准备答辩',date:'2026-11-09',time:'15:30',notes:'带上演示材料'});
describe('MCP 参数与日程',()=>{
  it('工具白名单与契约一致',()=>{expect(tools.map(t=>t.name)).toEqual(['add_schedule','list_schedules']);expect(tools[0].inputSchema.required).toEqual(['request_id','title','date']);});
  it('校验日期、时刻、空标题、请求标识及未知字段',()=>{
    for(const patch of [{date:'2026-02-30'},{date:'明天'},{time:'25:00'},{title:'  '},{request_id:'../../path'},{extra:true}])expect(addScheduleInput.safeParse({...input(),...patch}).success).toBe(false);
  });
  it('没有时刻不补零点，默认备注为空',()=>{const x=addScheduleInput.parse({request_id:'a',title:'报名',date:'2026-11-09'});expect(x.time).toBeUndefined();expect(x.notes).toBe('');});
  it('写入个人计划，不将会议时间设为主截止日',()=>{
    const n=scheduleNotice(input(),'client','a'.repeat(64));expect(n.tasks[0]).toMatchObject({date:'2026-11-09',time:'15:30',done:false,agent:{client:'client',requestId:'test.001'}});
    expect(n.deadline).toBeUndefined();expect(n.deadlineEdited).toBe(true);expect(n.life).toBe('active');expect(today(n,new Date(2026,10,9))).toBe(true);
  });
  it('日程来源和备注原文可回看',()=>{
    const n=scheduleNotice(input(),'client','a'.repeat(64));expect(n.sources[0].name).toBe('MCP · client');expect(n.sources[0].originalText).toContain('带上演示材料');
  });
  it('列表按日期时刻排序，过滤完成与归档，正确标记截断',()=>{
    const n=scheduleNotice(input(),'client','a'.repeat(64));n.tasks.push({...n.tasks[0],id:'t2',time:'09:00'});
    const later=scheduleNotice({...input(),date:'2026-11-10'},'client','a'.repeat(64));later.tasks[0].done=true;
    const all=scheduleList([later,n],listSchedulesInput.parse({limit:1}));expect(all.items[0].time).toBe('09:00');expect(all.has_more).toBe(true);expect(all.total).toBe(2);
    expect(scheduleList([later,n],listSchedulesInput.parse({date_from:'2026-11-10',include_done:true})).total).toBe(1);
    n.life='archived';expect(scheduleList([n],listSchedulesInput.parse({})).total).toBe(0);
  });
  it('拒绝过大查询、颠倒范围与非日期',()=>{
    for(const value of [{limit:101},{limit:0},{date_from:'2026-11-10',date_to:'2026-11-01'},{date_to:'2026-02-30'}])expect(listSchedulesInput.safeParse(value).success).toBe(false);
  });
  it('长备注查询保留明确截断标记',()=>{
    const n=scheduleNotice({...input(),notes:'文'.repeat(4000)},'client','a'.repeat(64));const view=scheduleList([n],listSchedulesInput.parse({})).items[0];expect(view.notes?.length).toBe(500);expect(view).toMatchObject({notes_truncated:true});
  });
  it('请求标识按客户端隔离，规范化指纹不受字段顺序影响',()=>{
    expect(requestKey('a','1')).not.toBe(requestKey('b','1'));expect(fingerprintText(input())).toBe(fingerprintText({...input(),title:'准备答辩'}));
  });
  it('MCP 来源随既有备份往返，不包含连接口令',async()=>{
    const n=scheduleNotice(input(),'client','a'.repeat(64));const packed=zipSync({'data.json':strToU8(JSON.stringify({format:'xiaoshijian-backup',schema:1,createdAt:1,notices:[n],attachments:[],jobs:[]}))});
    const restored=await readBackup(new Blob([new Uint8Array(packed).buffer]));expect(restored.notices[0]).toEqual(n);expect(JSON.stringify(restored)).not.toContain('XIAOSHIJIAN_MCP_TOKEN');
  });
});
