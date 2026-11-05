import { createWorker, OEM, type Worker as OCRWorker } from 'tesseract.js';
import * as pdfjs from 'pdfjs-dist';
import DocxWorker from './docx.worker?worker';
import { LIMITS, normalize, type PageText, type Source } from './model';
const asset=(p:string)=>new URL(`vendor/${p}`,location.href).href;
pdfjs.GlobalWorkerOptions.workerSrc = asset('pdf/pdf.worker.min.mjs');
const check=(signal:AbortSignal)=>{if(signal.aborted)throw new DOMException('已取消','AbortError');};
export function docxText(blob:Blob,signal:AbortSignal):Promise<{text:string;warnings:string[]}> {
  return new Promise((resolve,reject)=>{const w=new DocxWorker();const abort=()=>{w.terminate();reject(new DOMException('已取消','AbortError'));};signal.addEventListener('abort',abort,{once:true});
    w.onmessage=e=>{w.terminate();signal.removeEventListener('abort',abort);e.data.error?reject(Error(e.data.error)):resolve(e.data);};
    w.onerror=()=>{w.terminate();signal.removeEventListener('abort',abort);reject(Error('DOCX 解析器失败，请检查文件是否损坏'));};
    blob.arrayBuffer().then(b=>{check(signal);w.postMessage(b,[b]);}).catch(reject);
  });
}
export async function imageCanvas(blob:Blob,rotation=0) {
  const image=await createImageBitmap(blob);try {
    if(image.width*image.height>LIMITS.pixels)throw Error('图片超过 2500 万像素，请缩小后再试');
    const canvas=document.createElement('canvas');const flip=Math.abs(rotation)%180===90;
    const width=flip?image.height:image.width,height=flip?image.width:image.height;
    const scale=Math.max(1,Math.min(2,1400/width,Math.sqrt(LIMITS.pixels/(width*height))));
    canvas.width=Math.floor(width*scale);canvas.height=Math.floor(height*scale);
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.translate(canvas.width/2,canvas.height/2);ctx.scale(scale,scale);ctx.rotate(rotation*Math.PI/180);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,-image.width/2,-image.height/2);return canvas;
  }finally{image.close();}
}
export async function ocrImage(image:HTMLCanvasElement,signal:AbortSignal,progress:(s:string)=>void) {
  check(signal);let worker:OCRWorker|undefined;
  const aborted=new Promise<never>((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('已取消','AbortError')),{once:true}));
  const init=createWorker(['chi_sim','eng'],OEM.LSTM_ONLY,{workerPath:asset('ocr/worker.min.js'),corePath:asset('ocr/core'),langPath:asset('ocr/lang'),workerBlobURL:false,cacheMethod:'none',gzip:true,logger:m=>progress(`本地识别 · ${m.status} ${Math.round((m.progress||0)*100)}%`)});
  // If initialization completes after cancellation, still release its worker.
  init.then(w=>{if(signal.aborted)void w.terminate();}).catch(()=>{});
  try {worker=await Promise.race([init,aborted]);check(signal);const result=await Promise.race([worker.recognize(image),aborted]);return normalize(result.data.text);}
  finally{if(worker)await worker.terminate();}
}
export function pdfLines(items:unknown[]):string {
  const lines:{y:number;x:number;text:string}[]=[];
  for(const raw of items) {const t=raw as {str?:string;transform?:number[];hasEOL?:boolean};if(!t.str||!t.transform)continue;const x=t.transform[4],y=t.transform[5];let line=lines.find(l=>Math.abs(l.y-y)<3);if(!line){line={x,y,text:''};lines.push(line);}const join=/[\u4e00-\u9fff，。；：、（【]$/.test(line.text)||/^[\u4e00-\u9fff，。；：、）】]/.test(t.str);line.text+=(line.text&&!join?' ':'')+t.str;}
  return lines.sort((a,b)=>b.y-a.y||a.x-b.x).map(l=>l.text.trim()).join('\n');
}
export async function pdfText(blob:Blob,source:Source,selected:number[]|undefined,signal:AbortSignal,progress:(s:string)=>void,onPages:(pages:PageText[])=>Promise<void>) {
  const data=new Uint8Array(await blob.arrayBuffer());check(signal);
  const loading=pdfjs.getDocument({data, cMapUrl:asset('pdf/cmaps/'),cMapPacked:true,standardFontDataUrl:asset('pdf/standard_fonts/'),wasmUrl:asset('pdf/wasm/'),iccUrl:asset('pdf/iccs/'),useWorkerFetch:true,stopAtErrors:true,maxImageSize:LIMITS.pixels,canvasMaxAreaInBytes:LIMITS.pixels*4});
  const abort=()=>{void loading.destroy();};signal.addEventListener('abort',abort,{once:true});
  try {
    const pdf=await loading.promise;check(signal);
    if(pdf.numPages>LIMITS.pdfPages)throw Error(`PDF 共 ${pdf.numPages} 页，超过本版 100 页限额，请拆分后导入`);
    if(selected&&(selected.length>LIMITS.ocrPages||selected.some(n=>!Number.isInteger(n)||n<1||n>pdf.numPages)))throw Error('OCR 页码无效或单批超过 10 页');
    const pages:PageText[]=source.pages?structuredClone(source.pages):[];
    const targets=selected||Array.from({length:pdf.numPages},(_,i)=>i+1);
    let autoOCR=0;
    for(const number of targets) {
      check(signal);progress(`${selected?'扫描 OCR':'读取 PDF'} · 第 ${number}/${pdf.numPages} 页`);
      const page=await pdf.getPage(number);let item:PageText={page:number,text:'',method:'scan'};
      try {
        if(!selected) {
          const content=await page.getTextContent();const text=normalize(pdfLines(content.items));
          item={page:number,text,method:text.replace(/\s/g,'').length>=3?'text':'scan'};
          const previous=pages.find(p=>p.page===number&&p.method==='ocr'&&p.text.trim()&&!p.error);
          if(item.method==='scan'&&previous)item={...previous};
        }
        if(selected||item.method==='scan'&&autoOCR<LIMITS.ocrPages) {
          if(!selected)autoOCR++;
          progress(`扫描 OCR · 第 ${number}/${pdf.numPages} 页`);
          let viewport=page.getViewport({scale:2});if(viewport.width*viewport.height>LIMITS.pixels)throw Error('渲染页尺寸过大，请缩小原 PDF');
          const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
          try {await page.render({canvas,viewport}).promise;const text=await ocrImage(canvas,signal,s=>progress(`第 ${number} 页 · ${s}`));item={page:number,text,method:'ocr',...(!text?{error:'未识别出正文，请核对原件或换清晰文件'}:{})};}finally{canvas.width=canvas.height=0;}
        }
      }catch(e){check(signal);item.error=e instanceof Error?e.message:String(e);}finally{page.cleanup();}
      const i=pages.findIndex(p=>p.page===number);if(i>=0)pages[i]=item;else pages.push(item);pages.sort((a,b)=>a.page-b.page);
      if(pages.reduce((len,p)=>len+p.text.length,0)>LIMITS.textChars)throw Error('PDF 正文过长，请拆分');
      await onPages(pages);
    }
    return {text:joinPages(pages),pages,warnings:pages.filter(p=>p.method==='scan'||p.error).map(p=>`第 ${p.page} 页${p.error?'读取失败：'+p.error:'未识别：自动 OCR 每批最多 10 页，请选择剩余扫描页继续'}`)};
  }finally{signal.removeEventListener('abort',abort);await loading.destroy();}
}
export const joinPages=(pages:PageText[])=>pages.map(p=>`【第${p.page}页】\n${p.text}`).join('\n\n');
