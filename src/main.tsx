import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {db} from './db';
import {useLive} from './hooks';
import {runJob} from './jobs';
import {Dashboard} from './ui/Dashboard';
import './style.css';
function App(){const notices=useLive(()=>db.notices.toArray(),[]);const jobs=useLive(()=>db.jobs.toArray(),[]);const [route,setRoute]=useState(location.hash.slice(1)||'home');const [error,setError]=useState('');
  useEffect(()=>{const fn=()=>setRoute(location.hash.slice(1)||'home');window.addEventListener('hashchange',fn);const fail=(e:PromiseRejectionEvent)=>{setError(e.reason?.name==='QuotaExceededError'?'本机存储空间不足，请先备份并清理附件。原有数据仍保留。':String(e.reason?.message||e.reason));e.preventDefault();};window.addEventListener('unhandledrejection',fail);return()=>{window.removeEventListener('hashchange',fn);window.removeEventListener('unhandledrejection',fail);};},[]);
  useEffect(()=>{const next=jobs.find(j=>j.state==='waiting');if(!next)return;void runJob(next.id).catch(e=>setError(String(e)));const timer=setInterval(()=>void runJob(next.id).catch(e=>setError(String(e))),1500);return()=>clearInterval(timer);},[jobs]);
  return <><Dashboard notices={notices} jobs={jobs} route={route}/>{error&&<div className="toast" role="alert">{error}<button onClick={()=>setError('')}>关闭</button></div>}</>;
}
createRoot(document.getElementById('root')!).render(<App/>);
