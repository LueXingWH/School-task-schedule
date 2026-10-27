// Read the ZIP directory before decompression: bounded memory, no traversal, no ZIP64/encryption.
export function inspectZip(bytes:Uint8Array,maxBytes:number,maxEntries=2000) {
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let eocd=-1;
  for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(v.getUint32(p,true)===0x06054b50){eocd=p;break;}
  if(eocd<0)throw Error('不是有效 ZIP/DOCX 文件');
  if(v.getUint16(eocd+4,true)||v.getUint16(eocd+6,true))throw Error('不支持分卷 ZIP');
  const count=v.getUint16(eocd+10,true);let p=v.getUint32(eocd+16,true);const result=new Map<string,number>();let total=0;
  if(count===65535||count>maxEntries)throw Error('压缩包文件数量超限或使用 ZIP64');
  for(let i=0;i<count;i++) {
    if(p+46>bytes.length||v.getUint32(p,true)!==0x02014b50)throw Error('压缩包目录损坏');
    const flags=v.getUint16(p+8,true),size=v.getUint32(p+24,true),nl=v.getUint16(p+28,true),el=v.getUint16(p+30,true),cl=v.getUint16(p+32,true);
    const name=new TextDecoder().decode(bytes.subarray(p+46,p+46+nl));
    if(flags&1||size===0xffffffff)throw Error('不支持加密或 ZIP64 文件');
    if(!name||name.includes('\\')||name.startsWith('/')||name.includes(':')||name.split('/').some(x=>x==='..'||x==='.')||result.has(name))throw Error('压缩包路径或重复条目不合法');
    total+=size;if(total>maxBytes)throw Error('压缩包展开后过大，请分批导入');result.set(name,size);p+=46+nl+el+cl;
  }
  return result;
}
