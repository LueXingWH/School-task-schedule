import {it,expect} from 'vitest';
import {zipSync,strToU8} from 'fflate';
import {readBackup} from '../src/backup';
import {derive} from '../src/rules';
import {confirmSchedule} from '../src/rules/actions';
import type {Notice} from '../src/model';
const pack=(data:unknown,files:Record<string,Uint8Array>={})=>new Blob([new Uint8Array(zipSync({'data.json':strToU8(JSON.stringify(data)),...files})).buffer]);
const base=()=>({format:'xiaoshijian-backup',schema:1,createdAt:1,notices:[],attachments:[],jobs:[]});
it('读取实际 ZIP 并验证空备份转换',async()=>{expect(await readBackup(pack(base()))).toEqual({notices:[],attachments:[],jobs:[]});});
it('拒绝未知 schema 和非 JSON',async()=>{await expect(readBackup(pack({...base(),schema:99}))).rejects.toThrow(/schema/);await expect(readBackup(new Blob(['broken']))).rejects.toThrow();});
it('拒绝未声明文件和路径穿越',async()=>{await expect(readBackup(pack(base(),{'extra':new Uint8Array([1])}))).rejects.toThrow(/未声明/);await expect(readBackup(pack(base(),{'../outside':new Uint8Array([1])}))).rejects.toThrow(/路径/);});
it('拒绝无关附件、缺失源文件',async()=>{const data={...base(),attachments:[{id:'a',noticeId:'n',sourceId:'s',name:'x',type:'text/plain',size:1,sha256:'0'.repeat(64),path:'files/a'}]};await expect(readBackup(pack(data,{'files/a':new Uint8Array([1])}))).rejects.toThrow(/关系/);});
const withActions=()=>{
  const text='2026年11月9日18:30提交报名表';
  const n:Notice={id:'n',title:'通知',titleEdited:false,life:'active',deadlineEdited:false,createdAt:1,updatedAt:1,sources:[{id:'s',kind:'text',name:'通知',text,originalText:text}],dates:[],materials:[],tasks:[],dismissedMaterials:[]};
  const result=derive(n);confirmSchedule(result);return result;
};
it('新备份保留待办依据、日程关联和具体时刻',async()=>{
  const n=withActions();const restored=await readBackup(pack({...base(),notices:[n]}));expect(restored.notices).toEqual([n]);
});
it('兼容没有待办字段的 1.3.0 备份',async()=>{
  const n=withActions();delete n.actions;delete n.tasks[0].time;expect((await readBackup(pack({...base(),notices:[n]}))).notices[0].tasks).toHaveLength(1);
});
it('旧版四种状态恢复为未完成或完成，保留人工概述',async()=>{
  for(const [old,expected] of [['review','active'],['active','active'],['done','done'],['archived','done']]){
    const n={...withActions(),life:old,summary:'我的安排概述',summaryEdited:true};
    const restored=(await readBackup(pack({...base(),notices:[n]}))).notices[0];
    expect(restored.life).toBe(expected);expect(restored.summary).toBe(n.summary);expect(restored.summaryEdited).toBe(true);
  }
});
it('确认日程后修正文前插内容，保留截止日且备份关联仍有效',async()=>{
  let n=withActions();const value=n.deadline!.value;n.sources[0].text='补充说明\n'+n.sources[0].text;n=derive(n);
  expect(n.deadline).toMatchObject({value,confirmed:true});expect(n.deadline!.candidateId).toBeUndefined();
  expect((await readBackup(pack({...base(),notices:[n]}))).notices[0].tasks[0].time).toBe('18:30');
});
it('拒绝悬空待办日程关联或伪造来源',async()=>{
  const n=withActions();n.actions![0].taskId='missing';await expect(readBackup(pack({...base(),notices:[n]}))).rejects.toThrow(/日程关联/);
  n.actions![0].taskId=n.tasks[0].id;n.actions![0].evidence.sourceId='missing';await expect(readBackup(pack({...base(),notices:[n]}))).rejects.toThrow(/候选来源/);
});
