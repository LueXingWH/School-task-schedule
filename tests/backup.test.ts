import {it,expect} from 'vitest';
import {zipSync,strToU8} from 'fflate';
import {readBackup} from '../src/backup';
const pack=(data:unknown,files:Record<string,Uint8Array>={})=>new Blob([new Uint8Array(zipSync({'data.json':strToU8(JSON.stringify(data)),...files})).buffer]);
const base=()=>({format:'xiaoshijian-backup',schema:1,createdAt:1,notices:[],attachments:[],jobs:[]});
it('读取实际 ZIP 并验证空备份转换',async()=>{expect(await readBackup(pack(base()))).toEqual({notices:[],attachments:[],jobs:[]});});
it('拒绝未知 schema 和非 JSON',async()=>{await expect(readBackup(pack({...base(),schema:99}))).rejects.toThrow(/schema/);await expect(readBackup(new Blob(['broken']))).rejects.toThrow();});
it('拒绝未声明文件和路径穿越',async()=>{await expect(readBackup(pack(base(),{'extra':new Uint8Array([1])}))).rejects.toThrow(/未声明/);await expect(readBackup(pack(base(),{'../outside':new Uint8Array([1])}))).rejects.toThrow(/路径/);});
it('拒绝无关附件、缺失源文件',async()=>{const data={...base(),attachments:[{id:'a',noticeId:'n',sourceId:'s',name:'x',type:'text/plain',size:1,sha256:'0'.repeat(64),path:'files/a'}]};await expect(readBackup(pack(data,{'files/a':new Uint8Array([1])}))).rejects.toThrow(/关系/);});
