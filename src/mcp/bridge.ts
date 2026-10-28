import {callScheduleTool} from './repository';

const HOST='com.xiaoshijian.mcp';
interface Connection {enabled:boolean;instance:string;token:string}
let connection:Connection|undefined,port:chrome.runtime.Port|undefined,command='';
let state='已关闭',error='',starting:Promise<void>|undefined;
let operations:Promise<unknown>=Promise.resolve();
const random=(bytes:number)=>Array.from(crypto.getRandomValues(new Uint8Array(bytes)),x=>x.toString(16).padStart(2,'0')).join('');
const status=()=>({enabled:!!connection?.enabled,state,error,connected:!!command&&!!port});

async function connect(){
  if(port||!connection?.enabled)return;
  const current=connection;state='正在连接本地桥接';error='';command='';
  const native=chrome.runtime.connectNative(HOST);port=native;
  native.onDisconnect.addListener(()=>{
    const reason=chrome.runtime.lastError?.message;
    if(port!==native)return;port=undefined;command='';
    if(connection?.enabled){state='本地桥接未连接';error=reason||'连接已断开，请重新连接';}else state='已关闭';
  });
  native.onMessage.addListener((message:unknown)=>{
    if(!message||typeof message!=='object'||port!==native)return;
    const msg=message as Record<string,unknown>;
    if(msg.type==='ready'&&typeof msg.command==='string'&&/^[A-Za-z]:\\.+\\Xiaoshijian\.Mcp\.exe$/i.test(msg.command)){
      command=msg.command;state='已连接';error='';return;
    }
    if(msg.type!=='call'||typeof msg.id!=='string'||msg.id.length>100)return;
    const requestId=msg.id;
    const reply=(payload:object)=>{if(port===native)native.postMessage({type:'result',id:requestId,...payload});};
    void(async()=>{
      try{
        const saved=(await chrome.storage.local.get('mcpConnection')).mcpConnection as Connection|undefined;
        if(!saved?.enabled||saved.token!==current.token||!connection?.enabled)throw Error('MCP 接入已关闭或连接配置已更换');
        if(typeof msg.tool!=='string'||typeof msg.client!=='string')throw Error('MCP 参数无效');
        const result=await callScheduleTool(msg.tool,msg.args,msg.client);reply({result});
      }catch(e){reply({error:e instanceof Error?e.message.slice(0,1200):'日程调用失败'});}
    })().catch(()=>{});
  });
  native.postMessage({type:'hello',instance:current.instance,token:current.token});
}
export function startMcpBridge(){
  if(starting)return starting;
  starting=(async()=>{
    const saved=(await chrome.storage.local.get('mcpConnection')).mcpConnection as Connection|undefined;
    connection=saved&&/^[a-f0-9]{32}$/.test(saved.instance)&&/^[a-f0-9]{64}$/.test(saved.token)?saved:{enabled:false,instance:random(16),token:random(32)};
    await connect();
  })().catch(e=>{state='本地桥接未连接';error=e instanceof Error?e.message:'连接失败';});
  return starting;
}
export async function bridgeRequest(message:Record<string,unknown>,sender:chrome.runtime.MessageSender){
  const url=sender.url?new URL(sender.url):undefined;
  if(sender.id!==chrome.runtime.id||url?.href.split(/[?#]/)[0]!==chrome.runtime.getURL('dashboard.html'))throw Error('仅允许工作台配置 MCP 接入');
  const operation=operations.then(async()=>{
  await startMcpBridge();
  if(message.type==='mcp-enable'){
    if(typeof message.enabled!=='boolean')throw Error('接入开关无效');
    const enabled=message.enabled;
    const old=port;port=undefined;command='';old?.disconnect();
    connection={enabled,instance:enabled?random(16):connection!.instance,token:enabled?random(32):connection!.token};
    await chrome.storage.local.set({mcpConnection:connection});
    state=enabled?'正在连接本地桥接':'已关闭';error='';await connect();
  }else if(message.type==='mcp-reconnect'){
    const old=port;port=undefined;command='';old?.disconnect();await connect();
  }else if(message.type==='mcp-config'){
    if(!connection?.enabled||!port||!command)throw Error('请先启用并连接本地桥接');
    return {config:JSON.stringify({mcpServers:{xiaoshijian:{command,args:['--mcp','--instance',connection.instance],env:{XIAOSHIJIAN_MCP_TOKEN:connection.token}}}},null,2)};
  }else if(message.type!=='mcp-status')throw Error('未知 MCP 配置操作');
  return status();
  });
  operations=operation.catch(()=>{});return operation;
}
