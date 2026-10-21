import {NextRequest,NextResponse} from 'next/server';
export function proxyFor(audience:'h5'|'admin') {
  return async(req:NextRequest)=>{
    const upstream=audience==='h5'?(process.env.H5_API_PORT||'3100'):(process.env.ADMIN_API_PORT||'3101');
    const expectedOrigin=process.env[audience==='h5'?'H5_ORIGIN':'ADMIN_ORIGIN']||(audience==='h5'?'http://127.0.0.1:3001':'http://127.0.0.1:3002');
    const path=req.nextUrl.pathname;
    const fail=(status:number,code:string,message:string)=>NextResponse.json({error:{code,message},meta:{requestId:crypto.randomUUID(),serverTime:new Date().toISOString()}},{status,headers:{'Cache-Control':'no-store'}});
    if(!['GET','HEAD'].includes(req.method) && req.headers.get('origin')!==expectedOrigin)return fail(403,'ORIGIN_FORBIDDEN','请求来源不匹配');
    const headers=new Headers({'accept':'application/json','x-client-platform':'h5'});
    for(const name of ['content-type','x-csrf-token','idempotency-key','origin']){const value=req.headers.get(name);if(value)headers.set(name,value);}
    const cookieName=`m05_${audience}_session`;
    const cookie=req.cookies.get(cookieName);if(cookie)headers.set('cookie',`${cookieName}=${cookie.value}`);
    if(path.startsWith('/api/dev/')){
      if(process.env.IDENTITY_MODE!=='development'||process.env.APP_ENV==='production')return fail(404,'NOT_FOUND','接口不存在');
      headers.set('x-dev-token',process.env.DEV_ACCESS_TOKEN||'');
      if(['GET','HEAD'].includes(req.method))headers.set('origin',expectedOrigin);
    }
    try{
      let body:Uint8Array|undefined;
      if(!['GET','HEAD'].includes(req.method)){
        const limit=5*1024*1024;
        if(Number(req.headers.get('content-length'))>limit)return fail(413,'UPLOAD_TOO_LARGE','Request exceeds size limit');
        const reader=req.body?.getReader(),chunks:Uint8Array[]=[];let total=0;
        if(reader){while(true){const next=await reader.read();if(next.done)break;total+=next.value.length;if(total>limit){await reader.cancel();return fail(413,'UPLOAD_TOO_LARGE','Request exceeds size limit');}chunks.push(next.value);}}
        body=new Uint8Array(total);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}
      }
      const upstreamResponse=await fetch(`http://127.0.0.1:${upstream}${path}${req.nextUrl.search}`,{method:req.method,headers,body:body as BodyInit|undefined,cache:'no-store',signal:AbortSignal.timeout(10000),redirect:'manual'});
      const out=new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      for(const name of ['content-type','x-request-id']){const v=upstreamResponse.headers.get(name);if(v)out.set(name,v);}
      for(const c of upstreamResponse.headers.getSetCookie()){if(c.startsWith(cookieName+'='))out.append('set-cookie',c);}
      return new NextResponse(upstreamResponse.status===204?null:await upstreamResponse.arrayBuffer(),{status:upstreamResponse.status,headers:out});
    }catch{return fail(503,'API_UNAVAILABLE','后端尚未连接，请检查 API 服务');}
  };
}
