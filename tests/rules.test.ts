import { describe,it,expect } from 'vitest';
import {extractDates,validDay} from '../src/rules/dates';
import {extractMaterials} from '../src/rules/materials';
import {derive} from '../src/rules';
import {today,overdue,sortNotices,localDay} from '../src/schedule';
import {inspectZip} from '../src/zip';
import {zipSync,strToU8} from 'fflate';
import type {Notice,Source} from '../src/model';
import {titleFrom} from '../src/rules/title';
const source=(text:string):Source=>({id:'s',kind:'text',name:'通知',text,originalText:text});
const notice=(text='',extra:Partial<Notice>={}):Notice=>({id:'n',title:'原题',titleEdited:false,life:'review',deadlineEdited:false,createdAt:1,updatedAt:1,sources:[source(text)],dates:[],materials:[],tasks:[],dismissedMaterials:[],...extra});
describe('日期及角色',()=>{
  it('区分截止、初审与暂定评选，继承正文年份',()=>{const d=extractDates(source('2026年11月9日报名截止；11月10日前初审；初定11月12日评选'));expect(d.map(x=>[x.value,x.role,x.tentative])).toEqual([['2026-11-09','deadline',false],['2026-11-10','other',false],['2026-11-12','other',true]]);});
  it('缺年不补本机年份',()=>{expect(extractDates(source('11月9日截止'))[0]).toMatchObject({value:undefined,precision:'unknown'});});
  it('不使用版权年份',()=>{expect(extractDates(source('11月9日截止\n版权所有 © 2026'))[0].value).toBeUndefined();});
  it('无时刻保留日精度',()=>{expect(extractDates(source('2026年11月9日截止'))[0]).toMatchObject({value:'2026-11-09',precision:'day'});});
  it('无效日期不能选入主截止',()=>{expect(validDay('2026-02-30')).toBe(false);expect(derive(notice('2026年2月30日截止')).deadline).toBeUndefined();});
  it('展出区间不当报名截止',()=>{expect(extractDates(source('2026年11月9日至11月12日展出')).every(d=>d.role==='other')).toBe(true);});
  it('相对日期无基准不强转',()=>{const d=extractDates(source('三天后截止'))[0];expect(d.value).toBeUndefined();expect(d.ruleId).toBe('date.relative-unresolved.v1');});
  it('保留时刻并校验',()=>{expect(extractDates(source('2026-11-09 18:30 提交截止'))[0].value).toBe('2026-11-09T18:30');expect(extractDates(source('2026年11月9日29:00截止'))[0].valid).toBe(false);});
  it('全部候选都关联保存正文中的实际区间',()=>{const s=source('活动通知\n2026年11月9日截止\n提交材料：报名表、作品介绍PPT');for(const d of extractDates(s))expect(s.text.slice(d.start,d.end)).toBe(d.raw);for(const m of extractMaterials(s))expect(s.text.slice(m.evidence!.start,m.evidence!.end).length).toBeGreaterThan(0);});
});
describe('材料与重解析',()=>{
  it('PDF 页码标签不作为标题',()=>{expect(titleFrom('【第1页】\n校园项目报名通知','x.pdf')).toBe('校园项目报名通知');});
  it('DOCX 表格行保留可选性质',()=>{expect(extractMaterials(source('提交材料：\n演示视频 | 可选'))[0].requirement).toBe('optional');});
  it('改名后正文前插文字，重解析材料仍保持身份',()=>{let n=derive(notice('提交材料：报名表'));const original=n.materials[0].id;n.materials[0].name='我的报名表';n.materials[0].edited=true;n.sources[0].text='补充说明\n提交材料：报名表';n=derive(n);expect(n.materials).toHaveLength(1);expect(n.materials[0]).toMatchObject({id:original,name:'我的报名表'});});
  it('可选和否定不当必交',()=>{const m=extractMaterials(source('可提交演示视频，无需纸质报名表'));expect(m.map(x=>[x.name,x.requirement])).toEqual([['演示视频','optional'],['报名表','excluded']]);});
  it('拆分清单并排除联系人',()=>{const m=extractMaterials(source('提交材料：报名表、汇总表、作品介绍PPT\n联系人：张老师\n初审安排：11月10日'));expect(m.map(x=>x.name)).toEqual(['报名表','汇总表','作品介绍PPT']);});
  it('重解析保留人工修正和勾选',()=>{let n=derive(notice('2026年11月9日截止\n提交材料：报名表'));n.title='我改的标题';n.titleEdited=true;n.deadline={value:'2026-11-08',precision:'day',confirmed:true};n.deadlineEdited=true;n.materials[0].done=true;const key=n.materials[0].id;n=derive(n);expect(n.title).toBe('我改的标题');expect(n.deadline?.value).toBe('2026-11-08');expect(n.materials[0]).toMatchObject({id:key,done:true});});
  it('多个来源截止候选均保留',()=>{const n=notice('2026年11月9日截止');n.sources.push({...source('2026年11月10日截止'),id:'s2'});expect(derive(n).dates).toHaveLength(2);});
});
describe('今日、逾期与稳定排序',()=>{
  const now=new Date(2026,9,27,18,30);
  it('到天日期当天不逾期',()=>{const n=notice('',{deadline:{value:'2026-10-27',precision:'day',confirmed:true}});expect(overdue(n,now)).toBe(false);expect(today(n,now)).toBe(true);});
  it('未确认与已完成不进入正式今日',()=>{const n=notice('',{deadline:{value:'2026-10-27',precision:'day',confirmed:false}});expect(today(n,now)).toBe(false);n.deadline!.confirmed=true;n.life='done';expect(today(n,now)).toBe(false);});
  it('个人计划进入今日且跨自然日重算',()=>{const n=notice('',{tasks:[{id:'t',text:'准备 PPT',date:localDay(now),done:false}]});expect(today(n,now)).toBe(true);expect(today(n,new Date(2026,9,28))).toBe(false);});
  it('逾期置前、日期升序、无日期最后、同日稳定',()=>{const a=notice('',{id:'a',createdAt:3,deadline:{value:'2026-11-09',precision:'day',confirmed:true}}),b=notice('',{id:'b',createdAt:2,deadline:{value:'2026-10-26',precision:'day',confirmed:true}}),c=notice('',{id:'c'}),d={...a,id:'d',createdAt:1};expect(sortNotices([a,c,b,d],'deadline',now).map(x=>x.id)).toEqual(['b','d','a','c']);});
});
describe('解包保护',()=>{
  it('读取 ZIP 真实目录并拒绝展开超限',()=>{const zip=zipSync({'a.txt':strToU8('hello')});expect(inspectZip(zip,10).get('a.txt')).toBe(5);expect(()=>inspectZip(zip,3)).toThrow(/过大/);});
  it('拒绝路径穿越和损坏包',()=>{expect(()=>inspectZip(zipSync({'../evil':strToU8('x')}),100)).toThrow(/路径/);expect(()=>inspectZip(new Uint8Array([0]),100)).toThrow();});
});
