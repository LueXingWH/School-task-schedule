import { useEffect,useState } from 'react';
import { liveQuery } from 'dexie';
export function useLive<T>(query:()=>Promise<T>,initial:T,deps:unknown[]=[]) {const [value,setValue]=useState(initial);useEffect(()=>{const sub=liveQuery(query).subscribe({next:setValue,error:e=>console.error(e)});return()=>sub.unsubscribe();},deps);return value;}
export function useBlobURL(blob?:Blob){const [url,setURL]=useState('');useEffect(()=>{if(!blob){setURL('');return;}const url=URL.createObjectURL(blob);setURL(url);return()=>URL.revokeObjectURL(url);},[blob]);return url;}
