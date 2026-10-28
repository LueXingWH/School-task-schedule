// UI 截图工具：加载真实 dist 扩展，导入样例通知后按页面/视口批量截图。
// 用途：改版前后对比、人工复查排版，不参与产品运行。
// 用法：node scripts/ui-shot.mjs [输出目录]（默认 test-results/ui-shots-<时间戳>）
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {launchBrowser,loadExtension} from '../tests/browser-support.mjs';

const out=path.resolve(process.argv[2]||`test-results/ui-shots-${Date.now()}`);
await mkdir(out,{recursive:true});
const profile=path.resolve(`.test-profile-ui-${Date.now()}`);

// 样例数据：覆盖有截止日/无截止日、材料齐全度、待核对等卡片状态。
const samples=[
  '关于2026年秋季学生社团活动立项申报的通知\n各学院：\n申报截止时间：2026年11月6日 17:00，逾期不再受理。\n提交材料：项目申报书、经费预算表、指导教师意见书。\n请各社团按要求准备。',
  '图书馆研讨间预约规则调整说明\n自2026年11月1日起执行新的预约规则，单次最长预约4小时。\n本通知无需提交材料。',
  '实验室安全准入培训与考核安排\n请于2026年10月30日前完成线上学习，考核时间：2026年11月12日 14:30。\n需提交：安全承诺书、考核截图。',
  '校运会志愿者招募\n报名截止：2026年11月20日。\n提交材料：报名表、课表截图。\n欢迎同学积极参加。'
];

// 无头模式避免屏幕外窗口不产帧导致的截图挂起。
const context=await launchBrowser(profile);
const shots=[];
try {
  const runtime=await loadExtension(context,path.resolve('dist'));
  const page=await context.newPage();
  await page.setViewportSize({width:1440,height:900});
  await page.goto(runtime.base+'/dashboard.html');
  await page.getByText('这里等着你的第一份通知').waitFor({timeout:20000});
  for(const text of samples){
    await page.goto(runtime.base+'/dashboard.html#import');
    await page.getByLabel('通知正文',{exact:true}).fill(text);
    await page.getByRole('button',{name:'保存原文并整理'}).click();
    await page.waitForURL(/#notice\//);
    await page.waitForTimeout(900);
  }
  const noticeIds=await page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('xiaoshijian');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    return await new Promise(resolve=>{const tx=db.transaction('notices','readonly');const all=tx.objectStore('notices').getAll();all.onsuccess=()=>resolve(all.result.map(n=>n.id));});
  });

  const capture=async(name,hash,width=1440,height=900)=>{
    await page.setViewportSize({width,height});
    await page.goto(runtime.base+'/dashboard.html'+hash);
    await page.waitForTimeout(600);
    const file=path.join(out,name+'.png');
    await page.screenshot({path:file});
    shots.push(file);
  };
  await capture('01-home','#home');
  await capture('02-all','#all');
  await capture('03-import','#import');
  await capture('04-settings','#settings');
  if(noticeIds[0])await capture('05-detail','#notice/'+noticeIds[0]);
  await capture('06-home-mobile','#home',390,844);
  await capture('07-detail-mobile',noticeIds[0]?'#notice/'+noticeIds[0]:'#home',390,844);
  await page.setViewportSize({width:380,height:600});
  await page.goto(runtime.base+'/popup.html');
  await page.waitForTimeout(700);
  const popupFile=path.join(out,'08-popup.png');
  await page.screenshot({path:popupFile});shots.push(popupFile);
  await writeFile(path.join(out,'index.json'),JSON.stringify({runtime:runtime.base,shots,noticeIds},null,2));
  console.log(shots.join('\n'));
} finally {
  await context.close();
}
