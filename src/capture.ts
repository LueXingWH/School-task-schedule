// This function is serialized into the active tab. It must not reference module variables.
export function captureVisiblePage() {
  const excluded='nav,header,footer,aside,form,input,textarea,select,button,script,style,noscript,[contenteditable="true"],[hidden],[aria-hidden="true"]';
  const selection=window.getSelection();const anchor=selection?.anchorNode?.parentElement;
  let selected=anchor&&!anchor.closest(excluded)?selection?.toString().trim()||'':'';
  const root=document.querySelector('article')||document.querySelector('[role="main"],.v_news_content,.TRS_Editor,.article-content,.wp_articlecontent')||document.querySelector('main')||document.body;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const lines:string[]=[];let size=0;
  while(walker.nextNode()) {const el=walker.currentNode.parentElement;if(!el||el.closest(excluded))continue;const style=getComputedStyle(el);if(style.display==='none'||style.visibility==='hidden'||!el.getClientRects().length)continue;const t=walker.currentNode.textContent?.trim();if(t){lines.push(t);size+=t.length;if(size>1_000_000)throw Error('网页正文超过一百万字符，请选取需要的部分');}}
  const heading=document.querySelector('.arti_title,.article-title,.content-title,.news_title')||root.querySelector('h1,h2');
  const title=selected?selected.split('\n').find(s=>s.trim())?.trim().slice(0,90)||document.title:(heading?.textContent?.trim()||document.title);
  const text=selected||lines.join('\n');return {title,url:location.href,text,selected:!!selected};
}
