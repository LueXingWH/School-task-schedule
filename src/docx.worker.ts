import mammoth from 'mammoth';
import { inspectZip } from './zip';
import { LIMITS } from './model';
interface DocNode {type:string;value?:string;children?:DocNode[]}
// Preserve table rows/cells from Mammoth's document tree. Never insert its HTML into a DOM.
function plain(node:DocNode):string {
  if(node.type==='text')return node.value||'';
  if(node.type==='tab')return '\t';
  if(node.type==='break')return '\n';
  if(node.type==='tableRow')return (node.children||[]).map(c=>plain(c).trim().replace(/\n+/g,' / ')).join(' | ')+'\n';
  return (node.children||[]).map(plain).join('')+(node.type==='paragraph'?'\n\n':node.type==='table'?'\n':'');
}
self.onmessage=async(e:MessageEvent<ArrayBuffer>)=>{
  try {const bytes=new Uint8Array(e.data);const entries=inspectZip(bytes,LIMITS.unpackBytes);
    if(!entries.has('word/document.xml')||!entries.has('[Content_Types].xml'))throw Error('不是现代 DOCX 文档；请用 Word/WPS 另存为 .docx 或 PDF');
    let body='';
    const result=await mammoth.convertToHtml({arrayBuffer:e.data},{externalFileAccess:false,includeEmbeddedStyleMap:false,transformDocument:doc=>{body=plain(doc as DocNode);return doc;},convertImage:mammoth.images.imgElement(()=>Promise.resolve({src:''}))});
    if(body.length>LIMITS.textChars)throw Error('DOCX 正文超过一百万字符，请分批');
    self.postMessage({text:body,warnings:result.messages.map(m=>m.message)});
  } catch(e){self.postMessage({error:e instanceof Error?e.message:String(e)});}
};
