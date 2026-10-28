import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createInterface} from 'node:readline';
import path from 'node:path';
const run=promisify(execFile);
export const nativeRegistry=(mode,file)=>run('powershell.exe',['-NoProfile','-NonInteractive','-File',path.resolve('tests/native-registry.ps1'),'-Mode',mode,'-Path',path.resolve(file)],{windowsHide:true,timeout:15000});
export function mcpClient(config,name='xiaoshijian-acceptance'){
  const child=spawn(config.command,config.args,{env:{...process.env,...config.env},windowsHide:true,stdio:['pipe','pipe','pipe']});
  const pending=new Map();let seq=1,closed=false;const stderr=[];
  child.stderr.on('data',b=>stderr.push(String(b)));
  const lines=createInterface({input:child.stdout});
  lines.on('line',line=>{let message;try{message=JSON.parse(line);}catch{for(const entry of pending.values())entry.reject(Error('MCP stdout contained non-JSON'));return;}
    const entry=pending.get(message.id);if(entry){clearTimeout(entry.timer);pending.delete(message.id);entry.resolve(message);}});
  const fail=error=>{closed=true;for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(error);}pending.clear();};
  child.on('error',fail);child.on('exit',()=>fail(Error('MCP process exited')));
  const rpc=(method,params)=>new Promise((resolve,reject)=>{
    if(closed){reject(Error('MCP process closed'));return;}
    const id=seq++;const timer=setTimeout(()=>{pending.delete(id);reject(Error('MCP response timeout'));},30000);
    pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,...(params!==undefined?{params}:{})})+'\n');
  });
  const notify=(method,params)=>child.stdin.write(JSON.stringify({jsonrpc:'2.0',method,...(params?{params}:{})})+'\n');
  return {rpc,notify,stderr,
    async initialize(){const r=await rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name,version:'1.0.0'}});if(r.error)throw Error(r.error.message);notify('notifications/initialized');return r.result;},
    async call(name,args={}){const r=await rpc('tools/call',{name,arguments:args});if(r.error)throw Error(r.error.message);return r.result;},
    async close(){if(!closed){child.stdin.end();await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,2500))]);if(!closed)child.kill();}lines.close();}
  };
}
