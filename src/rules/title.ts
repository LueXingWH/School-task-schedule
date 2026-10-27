export function titleFrom(text: string, fallback: string) {
  return text.split('\n').map(x => x.trim()).find(x => x.length >= 4 && x.length <= 90 && !/^https?:|^【第\d+页】$/.test(x))?.replace(/^【|】$/g, '') || fallback || '未命名通知';
}
