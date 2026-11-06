import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {zipSync,unzipSync,strFromU8} from 'fflate';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const delivery=path.join(root,'成果交付'),bundleName='参赛包_校事笺_2026',current=path.join(delivery,bundleName);
const {version}=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const dateParts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
const date=`${dateParts.year}-${dateParts.month}-${dateParts.day}`,stamp=`${date.replaceAll('-','')}-${Date.now()}`;
const privateRoot=path.join(delivery,'.competition-build'),stage=path.join(privateRoot,`refresh-${stamp}`);
const draft=path.join(stage,bundleName),backup=path.join(privateRoot,`replaced-${stamp}`);
const presentationWork=path.join(privateRoot,`update-${version}`);
const presentation=path.join(presentationWork,`output/校事笺_${version}_作品介绍_已核验.pptx`);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const readJSON=async file=>JSON.parse(await fs.readFile(file,'utf8'));
function assertInside(parent,target){
  const resolved=path.resolve(target),relative=path.relative(path.resolve(parent),resolved);
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('路径超出预定目录：'+resolved);
  return resolved;
}
async function walk(folder){
  const files=[];
  for(const entry of await fs.readdir(folder,{withFileTypes:true})){
    const file=assertInside(folder,path.join(folder,entry.name));
    if(entry.isSymbolicLink())throw Error('参赛包中不接受符号链接：'+file);
    if(entry.isDirectory())files.push(...await walk(file));else files.push(file);
  }
  return files;
}
async function copy(source,target){await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(source,target);}
async function write(relative,text){const file=assertInside(draft,path.join(draft,relative));await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,(relative==='SHA256SUMS.txt'||relative.endsWith('.json')?'':'\uFEFF')+text,'utf8');}
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const reports={};
for(const browser of ['chrome','edge']){
  reports[browser]={};
  for(const [kind,name,minimum] of [['core','browser-results.json',15],['workflow','workflow/results.json',8],['recognition','recognition/results.json',8],['mcp','mcp/results.json',11],['install','install-results.json',browser==='edge'?6:5]]){
    const report=await readJSON(path.join(root,'test-results',browser,name));
    const count=kind==='install'?report.results.length:report.results.filter(r=>r.status==='PASS').length;
    assert(report.extensionVersion===version&&count>=minimum&&!report.results.some(r=>r.status==='FAIL'||typeof r==='string'&&r.startsWith('FAIL'))&&!report.errors?.length&&!report.offlineHTTPRequests?.length,`${browser} ${kind} 缺少当前版本通过记录`);
    reports[browser][kind]={file:name,count,date:report.date};
  }
}
const unit=await readJSON(path.join(root,'test-results/unit-results.json'));
assert(unit.success&&!unit.numFailedTests,'单元测试尚未通过');
const appFile=path.join(root,`release/xiaoshijian-${version}-edge.zip`),appBytes=await fs.readFile(appFile);
assert(sha(appBytes)===sha(await fs.readFile(path.join(root,`release/xiaoshijian-${version}-chrome.zip`))),'两个浏览器发布 ZIP 内容不同');
assert(JSON.parse(strFromU8(unzipSync(appBytes)['manifest.json'])).version===version,'应用 ZIP 版本错误');
const pptBytes=await fs.readFile(presentation);let pptValidation;
for(const name of await fs.readdir(presentationWork))if(/^validation(?:-r\d+)?\.json$/.test(name)){
  const record=await readJSON(path.join(presentationWork,name));if(record.finalSha256===sha(pptBytes))pptValidation=record;
}
assert(pptValidation,'未找到与当前 PPT 一致的验证记录');
assert(pptValidation.finalSha256===sha(pptBytes)&&pptValidation.packageIntegrity?.status==='pass'&&pptValidation.firstPartyImport?.passed&&pptValidation.firstPartyImport.slideCount===10,'PPT 缺少对应文件的10页通过记录');
const pptEntries=unzipSync(pptBytes),slideTexts=Object.entries(pptEntries).filter(([name])=>/^ppt\/slides\/slide\d+\.xml$/.test(name)).map(([,bytes])=>strFromU8(bytes)).join('\n');
assert(!slideTexts.includes('1.5.0')&&slideTexts.includes(version)&&slideTexts.includes(String(unit.numPassedTests)),'PPT 尚未同步版本或测试数');
const oldPpt=path.join(current,'01_提交材料/自主研发应用_校事笺_作品介绍.pptx'),oldPptHash=sha(await fs.readFile(oldPpt));
assert(!pptValidation.fontSelection?.referenceSha256||[pptValidation.fontSelection.referenceSha256,sha(pptBytes)].includes(oldPptHash),'原 PPT 在核验后发生变化，请先合并修改');
const preserved=(await walk(current)).filter(f=>/01_提交材料/.test(f)&&!/\.pptx$/i.test(f)||f.endsWith('赛事通知截图.jpg'));
const preservedHashes=new Map(await Promise.all(preserved.map(async file=>[path.relative(current,file),sha(await fs.readFile(file))])));
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if(process.argv.includes('--dry-run')){console.log(JSON.stringify({version,date,commit,bundle:current,presentation,preservedFiles:[...preservedHashes.keys()],unitTests:unit.numPassedTests,reports},null,2));process.exit(0);}

await fs.mkdir(stage,{recursive:true});await fs.cp(current,draft,{recursive:true,errorOnExist:true,force:false});
const appDir=path.join(draft,'02_应用安装'),sourceDir=path.join(draft,'03_源码');
for(const dir of [appDir,sourceDir])for(const file of await fs.readdir(dir))if(/\.zip$/i.test(file))await fs.unlink(assertInside(draft,path.join(dir,file)));
await copy(appFile,path.join(appDir,`校事笺_${version}_Edge与Chrome.zip`));
const sourceBytes=execFileSync('git',['archive','--format=zip','--prefix=source/','HEAD'],{cwd:root,maxBuffer:100*1024**2});
const sourceEntries=unzipSync(sourceBytes);
assert(JSON.parse(strFromU8(sourceEntries['source/package.json'])).version===version,'源码版本错误');
assert(!Object.keys(sourceEntries).some(name=>/(^|\/)(?:node_modules|成果交付|\.workbuddy|test-results|dist)\//.test(name)),'源码中混入本地产物');
await fs.writeFile(path.join(sourceDir,`校事笺_${version}_源码.zip`),sourceBytes);
await fs.writeFile(path.join(root,`release/xiaoshijian-${version}-source.zip`),sourceBytes);
await copy(presentation,path.join(draft,'01_提交材料/自主研发应用_校事笺_作品介绍.pptx'));
for(const name of await fs.readdir(path.join(root,'docs')))if(name.endsWith('.md'))await copy(path.join(root,'docs',name),path.join(draft,'04_使用与演示',name));
await copy(path.join(root,'README.md'),path.join(draft,'04_使用与演示/README.md'));
const evidence=path.join(draft,'05_实测证据');
// Build a fresh evidence directory; the old reports remain in the retained package backup.
await fs.rename(assertInside(draft,evidence),assertInside(stage,path.join(stage,'previous-evidence')));
await fs.mkdir(evidence,{recursive:true});
await copy(path.join(root,'test-results/unit-results.json'),path.join(evidence,'unit-results.json'));
const summary=path.join(stage,'验证摘要');await fs.mkdir(summary,{recursive:true});
await copy(path.join(root,'test-results/unit-results.json'),path.join(summary,'unit-results.json'));
for(const browser of ['chrome','edge']){
  const base=path.join(root,'test-results',browser);
  for(const [key,meta] of Object.entries(reports[browser])){
    const name=`${browser}_${key==='core'?'browser-results':key==='install'?'install-results':key+'_results'}.json`;
    await copy(path.join(base,meta.file),path.join(evidence,name));await copy(path.join(base,meta.file),path.join(summary,name));
  }
  for(const name of ['ocr-result.png','ocr-actual.txt','pdf-text-actual.txt','pdf-scan-actual.txt','docx-actual.txt'])await copy(path.join(base,name),path.join(evidence,browser,name));
  for(const sub of ['workflow','recognition'])for(const name of await fs.readdir(path.join(base,sub)))if(/\.png$|^small-ocr-actual\.txt$/.test(name)&&!name.startsWith('failure'))await copy(path.join(base,sub,name),path.join(evidence,browser,sub,name));
  for(const name of ['connected.png','schedule-added.png'])await copy(path.join(base,'mcp',name),path.join(evidence,browser,'mcp',name));
}
await write('05_实测证据/证据说明.txt',`本目录为 ${version} 的实际测试证据。业务测试日期以各 JSON 中的 date 字段为准。\n${unit.numPassedTests} 条单元测试通过；Chrome/Edge 各15组核心、8组交互、8组识别、11组 MCP 检查通过；ZIP安装恢复分别5/6项通过。\nPPT与界面截图已同步到 ${version}。所有图片使用生成测试样例，不代表实际用户规模或普遍识别准确率。\n本轮未重新进行全新目录依赖安装验证和安装助手全部 WinForms 按钮验收，不将旧版 clean-build 或 setup 报告当作本版结果。\n源码提交：${commit}\n`);
await write('05_实测证据/版本核对.json',JSON.stringify({version,packagedAt:new Date().toISOString(),sourceCommit:commit,unitTests:unit.numPassedTests,reports,applicationSHA256:sha(appBytes),presentationSHA256:sha(pptBytes),sourceSHA256:sha(sourceBytes)},null,2)+'\n');
let readme=await fs.readFile(path.join(current,'README_请先阅读.txt'),'utf8');
readme=readme.replaceAll('1.5.0',version).replace(/整理日期：\d{4}-\d{2}-\d{2}/,`整理日期：${date}`)
  .replace(/05_实测证据：[^\n]*/,`05_实测证据：${version} 实际测试报告、真实识别文本与当前截图；业务验证日期以各报告为准。`)
  .replace(/本包未放入安装助手EXE：[^\n]*/,'本包继续提供已验证的通用扩展ZIP；安装助手未重新执行全部 WinForms 按钮验收，因此参赛包中不附EXE。');
readme=readme.replace(/校事笺 [^\n]+参赛材料包/,`校事笺 ${version} 参赛材料包\n本次更新：截止日直接修改；单项/批量导入；未完成/完成两种状态；主标题、概述、原文；识别改进；左侧MCP配置。`);
await write('README_请先阅读.txt',readme.replace(/^\uFEFF/,''));
let checklist=await fs.readFile(path.join(current,'00_赛事要求与待补材料/要求核对与待补清单.md'),'utf8');
checklist=checklist.replace(/整理日期：2026年11月1日。/,`材料版本更新：${date}。原规则整理日期为2026年11月1日。`)
  .replace('本作品有2026年10月27—28日研发及1.5.0更新记录','本作品有2026年10月27日起的研发记录，2026年11月5日完成1.6.0重大更新及验证');
await write('00_赛事要求与待补材料/要求核对与待补清单.md',checklist.replace(/^\uFEFF/,''));
for(const [relative,hash] of preservedHashes){assert(sha(await fs.readFile(path.join(draft,relative)))===hash,'已填材料被改动：'+relative);assert(sha(await fs.readFile(path.join(current,relative)))===hash,'原材料在整理期间发生变化：'+relative);}
const bundleFiles=(await walk(draft)).filter(file=>path.relative(draft,file)!=='SHA256SUMS.txt').sort();
await write('SHA256SUMS.txt',(await Promise.all(bundleFiles.map(async file=>`${sha(await fs.readFile(file))}  ${path.relative(draft,file).replaceAll('\\','/')}`))).join('\n')+'\n');
const archiveFiles={};for(const file of await walk(draft))archiveFiles[`${bundleName}/${path.relative(draft,file).replaceAll('\\','/')}`]=new Uint8Array(await fs.readFile(file));
const archiveName=`自主研发应用_校事笺_参赛包_${date.replaceAll('-','')}.zip`,archiveBytes=zipSync(archiveFiles,{level:6});
const reopened=unzipSync(archiveBytes);
for(const [name,bytes] of Object.entries(archiveFiles))assert(reopened[name]&&sha(reopened[name])===sha(bytes),'外层ZIP核对失败：'+name);
await fs.writeFile(path.join(stage,archiveName),archiveBytes);
const docsStage=path.join(stage,'说明文档');await fs.mkdir(docsStage,{recursive:true});
for(const name of await fs.readdir(path.join(root,'docs')))if(name.endsWith('.md'))await copy(path.join(root,'docs',name),path.join(docsStage,name));
await copy(path.join(root,'README.md'),path.join(docsStage,'README.md'));
await fs.writeFile(path.join(stage,'成果说明.md'),`# 校事笺 ${version} 成果包\n\n已同步应用、源码、10页可编辑PPT、使用说明和实际测试证据。参赛材料中已填写的信息保持原样；未知个人信息仍待补齐。\n\n当前版本：${version}，源码提交 ${commit}。单元测试 ${unit.numPassedTests} 条通过；双浏览器各15组核心、8组交互、8组识别与11组MCP检查通过，ZIP安装恢复分别5/6项通过。旧版验证记录保留在本地替换备份中，不作为本版验收。\n\n参赛包提供已验证的通用扩展ZIP；本目录单独保留新版安装助手和浏览器ZIP，安装助手未复验全部WinForms按钮。\n\n参赛包：${archiveName}。SHA256SUMS.txt核对发布文件和参赛压缩包；包内另有完整逐文件清单。\n`,'utf8');
const released=[];
for(const kind of ['edge.zip','chrome.zip','setup.exe']){const name=`xiaoshijian-${version}-${kind}`;await copy(path.join(root,'release',name),path.join(stage,name));released.push(name);}
await fs.writeFile(path.join(stage,'SHA256SUMS.txt'),(await Promise.all([...released,archiveName].map(async name=>`${sha(await fs.readFile(path.join(stage,name)))}  ${name}`))).join('\n')+'\n','utf8');
await fs.mkdir(backup,{recursive:true});const actions=[];
async function publish(name){
  const source=assertInside(stage,path.join(stage,name)),target=assertInside(delivery,path.join(delivery,name)),saved=assertInside(backup,path.join(backup,name));
  let existed=false;try{await fs.lstat(target);existed=true;}catch(error){if(error.code!=='ENOENT')throw error;}
  if(existed)await fs.rename(target,saved);
  try{await fs.rename(source,target);}catch(error){if(existed)await fs.rename(saved,target);throw error;}
  actions.push({target,saved,existed,source});
}
try{
  for(const name of [bundleName,archiveName,'说明文档','验证摘要','成果说明.md',...released,'SHA256SUMS.txt'])await publish(name);
  for(const name of await fs.readdir(delivery))if((/^xiaoshijian-\d+\.\d+\.\d+-(?:edge|chrome)\.zip$|^xiaoshijian-\d+\.\d+\.\d+-setup\.exe$/.test(name)&&!released.includes(name))||(/^自主研发应用_校事笺_参赛包_\d+\.zip$/.test(name)&&name!==archiveName)){
    const old=assertInside(delivery,path.join(delivery,name)),saved=assertInside(backup,path.join(backup,name));await fs.rename(old,saved);actions.push({target:old,saved,existed:true});
  }
}catch(error){
  for(const action of actions.reverse()){if(action.source)await fs.rename(action.target,action.source);if(action.existed)await fs.rename(action.saved,action.target);}
  throw error;
}
console.log(JSON.stringify({version,commit,archive:path.join(delivery,archiveName),size:archiveBytes.length,files:Object.keys(archiveFiles).length,sha256:sha(archiveBytes),preservedFiles:preservedHashes.size,backup},null,2));
