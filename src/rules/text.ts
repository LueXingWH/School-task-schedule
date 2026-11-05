/** Keep UTF-16 offsets unchanged so every recognition candidate still points at the saved original. */
export const recognitionText=(text:string)=>text.replace(/[０-９：／．－　]/g,char=>char==='　'?' ':String.fromCharCode(char.charCodeAt(0)-0xfee0));
