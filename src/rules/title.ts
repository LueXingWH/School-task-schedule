import {recognitionText} from './text';
export function titleFrom(text: string, fallback: string) {
  const lines=recognitionText(text).split('\n').map(x=>x.trim().replace(/^#{1,6}\s+|^(?:主标题|标题)\s*[:：]\s*/,'').replace(/([\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g,'$1'))
    .filter(x=>x.length>=4&&x.length<=90&&!/^https?:|^【第\d+页】$|^(?:微信|群聊|聊天记录|转发|联系人|发布时间|发布单位|来源|版权所有|©)[:：\s]|^\d{1,2}[:：]\d{2}/.test(x));
  const heading=lines.find(x=>/(?:通知|公告|征集|招募|安排|报名|申报|比赛|竞赛|活动)(?:[】》）)]|\s)*$/.test(x)&&!/[。；;]|^(?:请|需|须|提交|填写|上传)|\d{1,2}月\d{1,2}日/.test(x));
  return (heading||lines.find(x=>! /^(?:请|需|须|提交|填写|上传|\d{4}年)/.test(x)))?.replace(/^【|】$/g,'')||fallback||'未命名通知';
}
