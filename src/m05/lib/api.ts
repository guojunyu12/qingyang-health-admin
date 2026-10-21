export class ApiError extends Error {constructor(public status:number,public code:string,message:string){super(message);}}
export async function api<T>(path:string,init:RequestInit={}):Promise<T>{
  const r=await fetch(path,{...init,cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Client-Platform':'h5',...init.headers}});
  if(r.status===204)return undefined as T;
  const value=await r.json();if(!r.ok)throw new ApiError(r.status,value.error?.code||'API_ERROR',value.error?.message||'请求失败');return value.data;
}
