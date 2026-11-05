import {describe,it,expect} from 'vitest';
import {splitSchedules,validateImportFiles} from '../src/importing';
import {summaryFrom} from '../src/rules/summary';
import {derive} from '../src/rules';
import type {Notice,Source} from '../src/model';
const source=(text:string):Source=>({id:'s',kind:'text',name:'通知',text,originalText:text});

describe('单项与批量导入边界',()=>{
  it('分隔线模式保留每项内部的段落并忽略空项',()=>{
    expect(splitSchedules('第一项\r\n正文\r\n\r\n补充\r\n---\r\n第二项\n---\n','divider')).toEqual(['第一项\n正文\n\n补充','第二项']);
  });
  it('可按空行或每行拆分，而分隔线模式不会擅自拆段',()=>{
    expect(splitSchedules('一\n二\n\n三','paragraph')).toEqual(['一\n二','三']);
    expect(splitSchedules('一\n二\n\n三','line')).toEqual(['一','二','三']);
    expect(splitSchedules('一\n二\n\n三','divider')).toHaveLength(1);
  });
  it('多文件先完整校验，包含旧 DOC 时整批拒绝',()=>{
    expect(()=>validateImportFiles([new File(['内容'],'valid.txt'),new File(['old'],'invalid.doc')])).toThrow(/旧版/);
    expect(validateImportFiles([new File(['a'],'a.pdf'),new File(['b'],'b.PNG')]).map(f=>f.kind)).toEqual(['pdf','image']);
  });
});

describe('内容概述',()=>{
  it('抽取原文关键信息，排除页码、标题与联系信息',()=>{
    const text='【第1页】\n校园竞赛通知\n报名截止：2026年11月9日。\n提交材料：报名表、作品介绍PPT。\n联系人：张老师';
    const summary=summaryFrom([source(text)],'校园竞赛通知');
    expect(summary).toContain('2026年11月9日');expect(summary).toContain('作品介绍PPT');expect(summary).not.toMatch(/校园竞赛通知|第1页|张老师/);
    for(const sentence of summary.split('\n'))expect(text).toContain(sentence);
  });
  it('重新识别更新机器概述，人工概述保留',()=>{
    let n:Notice={id:'n',title:'校园通知',titleEdited:true,life:'active',deadlineEdited:false,createdAt:1,updatedAt:1,sources:[source('2026年11月9日提交报名表')],dates:[],materials:[],tasks:[],dismissedMaterials:[]};
    n=derive(n);expect(n.summary).toContain('提交报名表');n.summary='按我的安排办理';n.summaryEdited=true;n.sources[0].text='2026年11月12日提交作品';
    expect(derive(n).summary).toBe('按我的安排办理');
  });
});
