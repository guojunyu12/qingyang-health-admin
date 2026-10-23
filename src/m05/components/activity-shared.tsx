'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {api,ApiError} from '../lib/api';
export type User={id:string;nickname:string;roles:string[];csrfToken:string;identityMode:string};
export type Slot={id:string;activityId:string;startAt:string;endAt:string;bookingOpenAt:string;bookingCloseAt:string;cancelBeforeAt:string;capacity:number;bookedCount:number;remainingSeats:number;status:string;version:number};
export type Activity={coverAssetId?:string|null;coverUrl?:string|null;id:string;title:string;category:string;description:string;locationName:string;address:string;latitude:number|null;longitude:number|null;visibility:string;status:string;version:number;nextSlot?:Slot|null;slots?:Slot[];serverNow?:string};
export type Booking={id:string;activityId:string;activityTitle:string;slotId:string;slot:Slot;status:string;participantVisibility:string;version:number;bookedAt:string;canceledAt:string|null;cancelReason:string|null;nickname?:string;userId?:string;activitySnapshot:Activity;slotSnapshot:Slot;events?:{id:string;action:string;occurredAt:string;reason:string|null}[]};
export const categories:Record<string,string>={walking:'轻松散步',yoga:'舒展瑜伽',running:'活力慢跑',workshop:'生活课堂',other:'其他活动'};
export const states:Record<string,string>={draft:'草稿',published:'已发布',archived:'已归档',open:'开放中',canceled:'已取消',completed:'已结束',confirmed:'待参加',attended:'已签到',no_show:'未到场',pending:'待处理',resolved:'已处理'};
export const time=(s?:string)=>s?new Date(s).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'—';
export const day=(n=0)=>new Date(Date.now()+n*86400000+8*3600000).toISOString().slice(0,10);
export const localTime=(s:string)=>new Date(Date.parse(s)+8*3600000).toISOString().slice(0,16);
export const utc=(s:string)=>new Date(s+':00+08:00').toISOString();
export const params=(data:Record<string,string>)=>new URLSearchParams(Object.entries(data).filter(([,v])=>v)).toString();
export function useRead<T>(path:string|null,revision=0){const [data,setData]=useState<T|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);useEffect(()=>{let live=true;setError('');if(!path){setData(null);return;}setLoading(true);api<T>(path).then(d=>{if(live)setData(d);}).catch(e=>{if(live){setError(e.message);setData(null);}}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[path,revision]);return {data,error,loading};}
export function usePages<T>(path:string,revision=0){const [data,setData]=useState<{items:T[];nextCursor:string|null}>({items:[],nextCursor:null}),[error,setError]=useState(''),[loading,setLoading]=useState(false),seq=useRef(0);async function load(cursor?:string){const n=++seq.current;setLoading(true);setError('');try{const r=await api<typeof data>(path+(path.includes('?')?'&':'?')+'limit=12'+(cursor?'&cursor='+encodeURIComponent(cursor):''));if(n===seq.current)setData(old=>({...r,items:cursor?[...old.items,...r.items]:r.items}));}catch(e){if(n===seq.current)setError((e as Error).message);}finally{if(n===seq.current)setLoading(false);}}useEffect(()=>{setData({items:[],nextCursor:null});void load();return()=>{seq.current++;};},[path,revision]);return {...data,error,loading,more:()=>load(data.nextCursor!)};}
export function useAction(user: User | null) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [revision, setRevision] = useState(0);
  const pending = useRef<{ signature: string; key: string } | null>(null);
  const running = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    return () => { generation.current++; };
  }, [user?.id]);
  async function run<T>(
    path: string, method: string, body: object, message: string,
    onSuccess?: (result: T) => void,
  ) {
    if (running.current) return;
    if (!user) { setError("请先登录"); return; }
    const current = generation.current;
    running.current = true;
    setBusy(true); setError(""); setErrorCode(""); setNotice("");
    const signature = JSON.stringify({ path, method, body });
    if (pending.current?.signature !== signature) {
      pending.current = { signature, key: crypto.randomUUID() };
    }
    try {
      const result = await api<T>(path, {
        method, body: JSON.stringify(body),
        headers: { "X-CSRF-Token": user.csrfToken, "Idempotency-Key": pending.current.key },
      });
      if (current !== generation.current) return;
      pending.current = null;
      setNotice(message); setRevision(value => value + 1);
      onSuccess?.(result);
      return result;
    } catch (cause) {
      if (current !== generation.current) return;
      if (cause instanceof ApiError && cause.status < 500 && cause.code !== "REQUEST_IN_PROGRESS") {
        pending.current = null;
      }
      setError((cause as Error).message);
      setErrorCode(cause instanceof ApiError ? cause.code : "NETWORK_ERROR");
      if (cause instanceof ApiError && cause.code === "VERSION_CONFLICT") {
        setRevision(value => value + 1);
      }
    } finally {
      running.current = false;
      if (current === generation.current) setBusy(false);
    }
  }
  return { busy, error, errorCode, notice, revision, run };
}
export function ConflictRecovery({ code, reload }: { code: string; reload: () => void }) {
  if (code !== "VERSION_CONFLICT") return null;
  return <div className="notice">
    <p>内容已被其他管理员修改。请重新读取最新版本后再编辑。</p>
    <button type="button" className="button secondary" onClick={reload}>
      关闭并刷新最新版本（放弃本次编辑）
    </button>
  </div>;
}
export function Feedback({error,notice}:{error?:string;notice?:string}){return <>{error&&<p role="alert" className="alert">{error}</p>}{notice&&<p role="status" className="notice">{notice}</p>}</>;}
export function More({page}:{page:{nextCursor:string|null;more:()=>void;loading:boolean;error:string;items:unknown[]}}){return <><Feedback error={page.error}/>{!page.items.length&&<p className="ledger-empty">{page.loading?'正在读取…':'暂无符合条件的记录'}</p>}{page.nextCursor&&<button type="button" className="button secondary full" disabled={page.loading} onClick={()=>void page.more()}>加载更多</button>}</>;}
export function Field({label,value,onChange,type='text',maxLength,required=false}:{label:string;value:string;onChange:(v:string)=>void;type?:string;maxLength?:number;required?:boolean}){return <label className="field">{label}{type==='textarea'?<textarea aria-label={label} maxLength={maxLength} value={value} required={required} onChange={e=>onChange(e.target.value)}/>:<input aria-label={label} type={type} maxLength={maxLength} value={value} required={required} onInput={e=>{if(type==='date'||type==='datetime-local')onChange(e.currentTarget.value);}} onChange={e=>onChange(e.target.value)}/>}</label>;}
export function Select({label,value,onChange,options,all}:{label:string;value:string;onChange:(v:string)=>void;options:Record<string,string>;all?:string}){return <label className="field">{label}<select aria-label={label} value={value} onChange={e=>onChange(e.target.value)}>{all!==undefined&&<option value="">{all}</option>}{Object.entries(options).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>;}
export function Modal({title,children,close,busy}:{title:string;children:ReactNode;close:()=>void;busy?:boolean}){return <div className="modal-backdrop"><section className="modal card" role="dialog" aria-modal="true" aria-label={title}><button className="close-button" disabled={busy} onClick={close} aria-label="关闭">×</button><h2>{title}</h2>{children}</section></div>;}
export function Status({value}:{value:string}){return <span className={'pill '+(['published','confirmed','attended','open'].includes(value)?'success':'muted')}>{states[value]||value}</span>;}
