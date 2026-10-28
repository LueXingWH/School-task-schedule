import React,{useEffect,useState} from 'react';
import {db,clearData} from '../db';
import {makeBackup,readBackup,restoreBackup,download} from '../backup';
import {useLive} from '../hooks';
import {localDay,overallProgress} from '../schedule';
import {type Settings} from '../model';
import {DEFAULT_SETTINGS as defaults} from '../settings';

export async function loadSettings():Promise<Settings>{
  if(!globalThis.chrome?.storage)return defaults;
  const value=(await chrome.storage.local.get('settings')).settings as Partial<Settings>|undefined;
  return {...defaults,...value};
}

export function SettingsPanel({settings,onSettings}:{settings:Settings;onSettings:(s:Settings)=>void}) {
  const [usage,setUsage]=useState<StorageEstimate>();
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [restore,setRestore]=useState<Awaited<ReturnType<typeof readBackup>>>();
  const [clear,setClear]=useState(false);
  const [phrase,setPhrase]=useState('');
  const notices=useLive(()=>db.notices.toArray(),[]);
  const attachments=useLive(()=>db.attachments.count(),0);

  useEffect(()=>{void navigator.storage.estimate().then(setUsage);},[]);

  const save=async(s:Settings)=>{onSettings(s);if(globalThis.chrome?.storage)await chrome.storage.local.set({settings:s});};
  const backup=async()=>{
    setBusy(true);
    try{download(await makeBackup(),`校事笺备份-${localDay()}.zip`);setMessage('完整备份已导出，含通知、清单、任务、处理记录和原文件。');}
    catch(e){setMessage(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  };
  const inspect=async(file:File)=>{
    setBusy(true);setRestore(undefined);
    try{setRestore(await readBackup(file));setMessage('备份已通过格式、关联关系及附件 SHA-256 校验。请确认合并。');}
    catch(e){setMessage(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  };

  const progress=overallProgress(notices);
  // 配额常以 GB 计，数字和单位之间用不换行空格，避免被折成「10.0 / GB」。
  const size=(bytes:number)=>(bytes>=1024**3?`${(bytes/1024**3).toFixed(1)} GB`:`${(bytes/1024**2).toFixed(1)} MB`).replace(' ','\u00a0');

  return <div className="settings-grid">
    <div className="settings-col">
      <section className="panel">
        <div className="section-heading"><h2>数据与备份</h2><span>本地浏览器数据库</span></div>
        <div className="stat-row">
          <div className="stat"><strong>{notices.length}</strong><small>条通知</small></div>
          <div className="stat"><strong>{attachments}</strong><small>个原件</small></div>
          <div className="stat"><strong>{progress.total?Math.round(progress.ratio*100):0}%</strong><small>材料已备</small></div>
        </div>
        <p className="muted">通知与原文件保存在当前浏览器的扩展数据库。</p>
        <p className="muted">已用约 {size(usage?.usage||0)} · 配额约 {size(usage?.quota||0)}</p>
        <div className="hint">本地保存不等于永久备份。卸载扩展、清理浏览器数据或配置文件损坏可能丢失资料，请定期导出。</div>
        <div className="row">
          <button className="primary" onClick={backup} disabled={busy}>导出完整备份 ZIP</button>
          <label className="file-label">选择备份文件恢复<input aria-label="恢复备份文件" type="file" accept=".zip" disabled={busy} onChange={e=>{if(e.target.files?.[0])void inspect(e.target.files[0]);e.target.value='';}}/></label>
        </div>
        {restore&&<div className="hint">
          <p>即将恢复 {restore.notices.length} 条通知、{restore.attachments.length} 个原文件。</p>
          <p>合并策略：全部作为新副本导入，重新分配 ID；不会覆盖已有数据，重复恢复会产生副本。处理中任务保留为已中断，可手动重试。</p>
          <div className="row">
            <button disabled={busy} onClick={async()=>{setBusy(true);try{const count=await restoreBackup(restore);setRestore(undefined);setMessage(`恢复完成，新增 ${count} 条通知`);}catch(e){setMessage(String(e));}finally{setBusy(false);}}}>确认合并恢复</button>
            <button onClick={()=>setRestore(undefined)}>取消恢复</button>
          </div>
        </div>}
        <p className="muted">备份 ZIP ≤ 100 MB，展开 ≤ 250 MB。备份未加密，请妥善保存。</p>
      </section>

      <section className="panel">
        <div className="section-heading"><h2>清除全部数据</h2><span>不可撤销</span></div>
        <p className="muted">清除全部通知、原件与处理记录。清空后只能通过备份恢复，请先导出。</p>
        {!clear
          ? <button className="danger" onClick={()=>setClear(true)}>清除全部数据…</button>
          : <div role="alert">
              <label>输入“清除校事笺”以确认<input aria-label="清除确认文字" value={phrase} onChange={e=>setPhrase(e.target.value)}/></label>
              <div className="row">
                <button className="danger" disabled={phrase!=='清除校事笺'||busy} onClick={async()=>{await clearData();setClear(false);setPhrase('');setMessage('本地通知和文件已清除');}}>确认清除</button>
                <button onClick={()=>setClear(false)}>取消</button>
              </div>
            </div>}
      </section>
    </div>

    <div className="settings-col">
      <section className="panel">
        <div className="section-heading"><h2>显示与排序</h2><span>立即生效</span></div>
        <label>即将截止的天数<input type="number" min="1" max="90" value={settings.upcomingDays} onChange={e=>void save({...settings,upcomingDays:Math.max(1,Math.min(90,Number(e.target.value)||7))})}/></label>
        <label>默认排序<select value={settings.sort} onChange={e=>void save({...settings,sort:e.target.value as Settings['sort']})}>
          <option value="deadline">截止日由近到远</option>
          <option value="created">最近添加</option>
          <option value="planned">个人计划日期</option>
        </select></label>
        <label className="row"><input type="checkbox" checked={settings.compact} onChange={e=>void save({...settings,compact:e.target.checked})}/>紧凑列表</label>
        <h3 style={{marginTop:20}}>键盘快捷键</h3>
        <div className="keymap">
          <div><span>聚焦搜索</span><kbd>/</kbd></div>
          <div><span>清空搜索并退出</span><kbd>Esc</kbd></div>
          <div><span>收录新通知</span><kbd>N</kbd></div>
        </div>
      </section>

      <section className="panel">
        <h2>支持范围与隐私</h2>
        <p>Windows Microsoft Edge / Google Chrome（MV3），已验证版本见验收记录。图片支持 PNG/JPEG/WebP；附件支持 PDF 与现代 DOCX。</p>
        <div className="check-line">Chrome 与 Edge 分别保存本地数据；切换浏览器可导出完整备份，再在目标浏览器恢复。</div>
        <div className="check-line">本地 Tesseract OCR 使用预训练中英文识别数据。</div>
        <div className="check-line">无大语言模型、云 OCR、账号、服务器、遥测或 API 密钥。</div>
        <p className="muted">候选日期与材料只是辅助线索，提交前请以原通知为准。</p>
      </section>
    </div>

    {message&&<p className="message" role="status">{message}</p>}
    {busy&&<p role="status" className="muted">正在处理，请保留当前页面…</p>}
  </div>;
}
