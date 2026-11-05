import {describe,it,expect} from 'vitest';
import {extractActions,confirmSchedule} from '../src/rules/actions';
import {extractDates} from '../src/rules/dates';
import {derive} from '../src/rules';
import {titleFrom} from '../src/rules/title';
import type {Notice,Source} from '../src/model';

const source=(text:string):Source=>({id:'s',kind:'text',name:'通知',text,originalText:text});
const notice=(text:string):Notice=>({id:'n',title:'通知',titleEdited:false,deadlineEdited:false,life:'active',createdAt:1,updatedAt:1,sources:[source(text)],dates:[],materials:[],tasks:[],dismissedMaterials:[]});

describe('待办与对应时间',()=>{
  it('逗号后的事项共用明确时间，句号后不借用',()=>{
    const a=extractActions(source('请于2026年11月9日18:00前，提交报名表，并上传作品。准备答辩材料。'));
    expect(a.map(a=>[a.text,a.time])).toEqual([['提交报名表','2026-11-09T18:00'],['上传作品','2026-11-09T18:00'],['准备答辩材料',undefined]]);
  });
  it('上一句已有事项时，新日期前置子句仍正确关联',()=>{
    const a=extractActions(source('2026年11月8日提交申请。\n请于11月9日18:00前，上传作品。'));
    expect(a.map(a=>a.time)).toEqual(['2026-11-08','2026-11-09T18:00']);
  });
  it('全角日期移除后保留清晰的事项文本',()=>{
    expect(extractActions(source('２０２６年１１月９日１８：３０前提交报名表'))[0]).toMatchObject({text:'提交报名表',time:'2026-11-09T18:30'});
  });
  it('分离多个事项，各自关联日期和时刻',()=>{
    const actions=extractActions(source('校园竞赛通知\n请于2026年11月9日18:30前提交报名表，并于11月12日下午3点参加答辩。\n准备作品演示。'));
    expect(actions.map(a=>[a.text,a.time])).toEqual([['提交报名表','2026-11-09T18:30'],['参加答辩','2026-11-12T15:00'],['准备作品演示',undefined]]);
    expect(extractDates(source('请于2026年11月9日18:30前提交报名表，并于11月12日下午3点参加答辩。')).map(d=>d.role)).toEqual(['deadline','other']);
  });
  it('缺年、相对、暂定和无效日期保留待确认',()=>{
    for(const text of ['11月9日提交报名表','明天提交报名表','暂定2026年11月9日提交报名表','2026年2月30日提交报名表'])expect(extractActions(source(text))[0].time).toBeUndefined();
  });
  it('同一事项有多个日期时不擅选一个',()=>{
    expect(extractActions(source('2026年11月9日至11月12日提交作品'))[0]).toMatchObject({time:undefined,timeNote:'多个时间，待确认'});
  });
  it('不同来源不借用彼此的日期',()=>{
    const n=notice('2026年11月9日提交报名表');n.sources.push({...source('11月10日参加答辩'),id:'s2'});
    expect(derive(n).actions?.map(a=>a.time)).toEqual(['2026-11-09',undefined]);
  });
  it('不将否定要求、通知标题、联系人变成待办',()=>{
    expect(extractActions(source('校园活动报名通知\n无需提交纸质报名表。\n请勿上传个人证件。\n联系人：报名老师'))).toHaveLength(0);
  });
  it('可选事项默认不选中',()=>{
    expect(extractActions(source('2026年11月9日可提交演示视频'))[0]).toMatchObject({optional:true,selected:false});
  });
  it('带截止时间的材料列表继承紧邻的时间标题',()=>{
    const a=extractActions(source('截止时间：2026年11月9日18:00\n提交材料：\n1. 报名表\n2. 作品介绍PPT'));
    expect(a.map(x=>[x.text,x.time])).toEqual([['准备报名表','2026-11-09T18:00'],['准备作品介绍PPT','2026-11-09T18:00']]);
  });
  it('依据精确指向 PDF 页面与原文区间',()=>{
    const s=source('【第1页】\n活动通知\n\n【第2页】\n2026年11月9日提交报名表');s.pages=[{page:1,text:'活动通知',method:'text'},{page:2,text:'2026年11月9日提交报名表',method:'text'}];
    const a=extractActions(s)[0];expect(a.evidence.page).toBe(2);expect(s.text.slice(a.evidence.start,a.evidence.end)).toBe(a.evidence.snippet);
  });
  it('支持中文上午、下午、点半，拒绝无效分钟',()=>{
    expect(extractDates(source('2026年11月9日下午3点半参加答辩'))[0].value).toBe('2026-11-09T15:30');
    expect(extractDates(source('2026年11月9日上午12点签到'))[0].value).toBe('2026-11-09T00:00');
    expect(extractDates(source('2026年11月9日18:99提交报名表'))[0].valid).toBe(false);
  });
});

describe('核对、重提取与日程',()=>{
  it('未确认的待办不会直接生成个人任务',()=>{expect(derive(notice('2026年11月9日提交报名表')).tasks).toEqual([]);});
  it('确认只加入已选且有可靠时间的事项，反复点击不重复',()=>{
    const n=derive(notice('2026年11月9日18:30提交报名表\n准备PPT\n2026年11月12日可提交视频'));
    expect(confirmSchedule(n)).toEqual({added:1,unresolved:1});expect(n.tasks[0]).toMatchObject({text:'提交报名表',date:'2026-11-09',time:'18:30',done:false});
    expect(confirmSchedule(n)).toEqual({added:0,unresolved:1});expect(n.tasks).toHaveLength(1);expect(n.deadline?.confirmed).toBe(true);
  });
  it('重提取保留编辑、忽略、采纳身份和个人任务勾选',()=>{
    let n=derive(notice('2026年11月9日提交报名表\n准备PPT'));const first=n.actions![0].id;
    n.actions![0].text='提交我的报名表';n.actions![0].edited=true;n.actions![1].dismissed=true;confirmSchedule(n);n.tasks[0].done=true;
    n.sources[0].text='补充说明\n'+n.sources[0].text;n=derive(n);
    expect(n.actions![0]).toMatchObject({id:first,text:'提交我的报名表',taskId:n.tasks[0].id});expect(n.actions![1].dismissed).toBe(true);expect(n.tasks[0].done).toBe(true);expect(confirmSchedule(n).added).toBe(0);
  });
  it('同日同名的已有任务可直接关联，不重复添加或覆盖完成状态',()=>{
    const n=derive(notice('2026年11月9日18:00提交报名表'));n.tasks=[{id:'old',text:'提交报名表',date:'2026-11-09',done:true}];
    expect(confirmSchedule(n).added).toBe(0);expect(n.tasks).toHaveLength(1);expect(n.tasks[0].done).toBe(true);expect(n.actions![0].taskId).toBe('old');
  });
  it('标题跳过聊天抬头，优先明确通知标题',()=>{
    expect(titleFrom('微信：项目群\n大家好，转发一份消息\n校园创新作品征集通知\n请提交报名表','截图.png')).toBe('校园创新作品征集通知');
    expect(titleFrom('【第1页】\n校 园 项 目 报 名 通 知\n2026年11月9日截止','x.pdf')).toBe('校园项目报名通知');
  });
});
