import {LIMITS,type Source} from './model';

export type Separator='divider'|'paragraph'|'line';
export function splitSchedules(text:string,separator:Separator):string[] {
  const pattern=separator==='divider'?/^\s*---+\s*$/m:separator==='paragraph'?/\n[\t ]*\n+/:/\n/;
  return text.replace(/\r\n?/g,'\n').split(pattern).map(s=>s.trim()).filter(Boolean);
}
export function validateImportFiles(files:File[]):{file:File;kind:Source['kind'];name:string}[] {
  if(!files.length)throw Error('请选择文件');
  if(files.length>LIMITS.importItems)throw Error(`每批最多导入 ${LIMITS.importItems} 个文件`);
  return files.map(file=>{
    const ext=file.name.split('.').pop()?.toLowerCase();let kind:Source['kind'];
    if(['png','jpg','jpeg','webp'].includes(ext||''))kind='image';
    else if(ext==='pdf')kind='pdf';
    else if(ext==='docx')kind='docx';
    else if(['txt','md'].includes(ext||''))kind='text';
    else if(ext==='doc')throw Error('不支持旧版 .doc。请在 Word/WPS 另存为 .docx 或 PDF。');
    else throw Error('仅支持 PNG/JPEG/WebP、PDF、DOCX、TXT/Markdown');
    if(file.size>(kind==='image'?LIMITS.imageBytes:LIMITS.fileBytes))throw Error(`${file.name}：${kind==='image'?'图片不能超过 10 MB':'单个附件不能超过 20 MB'}`);
    return {file,kind,name:file.name};
  });
}
