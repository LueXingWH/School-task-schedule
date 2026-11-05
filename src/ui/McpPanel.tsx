import React,{useEffect,useState} from 'react';
import {download} from '../backup';

interface Status {enabled:boolean;connected:boolean;state:string;error?:string}
export function McpPanel(){
  const [status,setStatus]=useState<Status>({enabled:false,connected:false,state:'正在读取接入状态'});
  const [config,setConfig]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const request=async(type:string,extra:object={})=>{
    if(!globalThis.chrome?.runtime?.sendMessage)throw Error('请在已安装的校事笺扩展中使用 MCP 接入');
    return chrome.runtime.sendMessage({type,...extra});
  };
  useEffect(()=>{
    let active=true;
    const refresh=()=>{void request('mcp-status').then(value=>{if(active){if(value.state){setStatus(value);if(!value.enabled)setConfig('');}else if(value.error)setMessage(value.error);}},()=>{if(active)setMessage('请在已安装的扩展中使用 MCP 接入');});};
    refresh();const timer=setInterval(refresh,2000);return()=>{active=false;clearInterval(timer);};
  },[]);
  const action=async(type:string,extra:object={})=>{
    setBusy(true);setMessage('');setConfig('');
    try{const value=await request(type,extra);if(value.state)setStatus(value);else if(value.error)throw Error(value.error);}catch(e){setMessage(e instanceof Error?e.message:'连接失败');}finally{setBusy(false);}
  };
  const showConfig=async()=>{
    try{const value=await request('mcp-config');if(value.error)throw Error(value.error);setConfig(value.config);setMessage('将下方配置加入你的 MCP 客户端。关闭后重新启用会使旧配置失效。');}catch(e){setMessage(e instanceof Error?e.message:'配置生成失败');}
  };
  return <section className="panel mcp-panel" aria-label="MCP 接入">
    <div className="section-heading"><h2>MCP 接入</h2><span className={`status ${status.connected?'status-active':''}`}>{status.state}</span></div>
    <p>让支持本地 MCP 的 agent 添加和查询个人日程。开启后，工具调用会直接保存到当前浏览器；日期和时刻按当前本地时区解释。</p>
    <label className="row"><input aria-label="启用 MCP 接入" type="checkbox" checked={status.enabled} disabled={busy} onChange={e=>void action('mcp-enable',{enabled:e.currentTarget.checked})}/>启用本地 MCP</label>
    {status.enabled&&<div className="row"><button disabled={busy} onClick={()=>void action('mcp-reconnect')}>重新连接 MCP</button><button disabled={!status.connected} onClick={()=>void showConfig()}>生成 MCP 配置</button></div>}
    {status.enabled&&!status.connected&&<p className="hint">请先运行随包的安装助手以安装本地桥接，再点击重新连接。通过 ZIP 安装时，桥接目录中的程序支持手动注册，步骤见使用指南。</p>}
    {status.error&&status.enabled&&<p className="warning">{status.error}</p>}
    {config&&<>
      <label>MCP 客户端配置<textarea aria-label="MCP 客户端配置" readOnly value={config}/></label>
      <div className="row"><button onClick={()=>void navigator.clipboard.writeText(config).then(()=>setMessage('MCP 配置已复制'),()=>setMessage('复制失败，请选中配置后按 Ctrl+C'))}>复制 MCP 配置</button><button onClick={()=>download(new Blob([config],{type:'application/json'}),'xiaoshijian-mcp.json')}>下载 MCP 配置</button></div>
      <p className="muted">配置包含当前浏览器的连接口令，请只交给你选择的本机 agent 客户端。浏览器需保持运行，工作台可以关闭。</p>
    </>}
    {message&&<p role="status" className="muted">{message}</p>}
  </section>;
}
