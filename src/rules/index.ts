import { type Notice } from '../model';
import { extractDates } from './dates';
import { extractMaterials, materialKey } from './materials';
import { titleFrom } from './title';
import { mergeActions } from './actions';
export function derive(n: Notice): Notice {
  const dates = n.sources.flatMap(extractDates);
  // Preserve candidate identity when the same evidence is encountered again.
  for(const d of dates) { const old=n.dates.find(o=>o.sourceId===d.sourceId&&o.raw===d.raw&&o.start===d.start); if(old)d.id=old.id; }
  const proposed=n.sources.flatMap(extractMaterials);
  const materials = proposed.filter(m=>!n.dismissedMaterials.includes(materialKey(m.evidence!.sourceId,m.name))).map(m=> {
    const old=n.materials.find(o=>o.origin==='machine'&&o.evidence?.sourceId===m.evidence?.sourceId && (o.originKey===m.originKey || o.name===m.name));
    return old ? {...m,...old,evidence:m.evidence} : m;
  });
  for(const old of n.materials) if(old.origin==='manual'||old.edited||old.done) { if(!materials.some(m=>m.id===old.id))materials.push(old); }
  let deadline=n.deadline;
  if(!n.deadlineEdited && !deadline?.confirmed) { const first=dates.find(d=>d.role==='deadline'&&d.value&&d.valid&&!d.tentative); deadline=first ? {value:first.value!,precision:first.precision as 'day'|'minute',confirmed:false,candidateId:first.id} : undefined; }
  // A corrected source may move or remove the original candidate. Keep the confirmed
  // deadline while dropping a reference that would make a later backup invalid.
  if(deadline?.candidateId){const candidateId=deadline.candidateId;if(!dates.some(d=>d.id===candidateId))deadline={...deadline,candidateId:undefined};}
  return {...n, title:n.titleEdited ? n.title : n.sources.find(s=>s.titleHint)?.titleHint||titleFrom(n.sources.map(s=>s.text).join('\n'),n.title),dates,materials,actions:mergeActions(n,dates),deadline,updatedAt:Date.now()};
}
