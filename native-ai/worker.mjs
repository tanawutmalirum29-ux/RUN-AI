import { buildNativeMessages, knowledge, examples } from './rag.mjs';
const BASE_MODEL='@cf/google/gemma-4-26b-a4b-it';
export function allowedOrigin(origin,env) {
  const list=String(env.ALLOWED_ORIGINS||'https://main.d36aqo2v0nijxk.amplifyapp.com')
    .split(',').map(x=>x.trim()).filter(Boolean);
  return Boolean(origin)&&list.includes(origin);
}
function headers(origin){
  return {
    'Access-Control-Allow-Origin':origin,
    'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type',
    'Access-Control-Max-Age':'600',
    'Vary':'Origin',
    'Cache-Control':'no-store',
    'Content-Type':'application/json; charset=utf-8',
    'X-Content-Type-Options':'nosniff',
  };
}
function json(body,status,origin) {
  return new Response(JSON.stringify(body),{status,headers:headers(origin)});
}
export function extractAnswer(response){
  const value=response?.response ?? response?.choices?.[0]?.message?.content
    ?? response?.result?.response ?? response?.result?.choices?.[0]?.message?.content;
  if(typeof value==='string'&&value.trim())return value.trim();
  if(Array.isArray(value)) {
    const joined=value.filter(x=>x?.type==='text').map(x=>x.text||'').join('\n');
    if(joined.trim())return joined.trim();
  }
  throw new Error('Model did not return text');
}
export default {
  async fetch(request,env) {
    const origin=request.headers.get('Origin')||'';
    // CORS restricts browser callers; it is not user authentication.
    if(!allowedOrigin(origin,env))return json({error:'Origin not permitted'},403,'null');
    const path=new URL(request.url).pathname;
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:headers(origin)});
    if(request.method==='GET'&&path==='/health')return json({
      ready:Boolean(env.AI&&env.NATIVE_RATE_LIMITER),
      model:'RUN AI Native',
      technique:'GitHub RAG/Few-shot (not weight fine-tuning)',
      baseModel:BASE_MODEL,
      knowledgeCount:knowledge.length,
      exampleCount:examples.length,
      quota:'Cloudflare Free account allocation; exact remaining not available',
    },200,origin);
    if(request.method!=='POST'||path!=='/chat')return json({error:'Route not found'},404,origin);
    if(!env.AI||!env.NATIVE_RATE_LIMITER)return json({error:'Native AI not configured'},503,origin);
    if(!request.headers.get('content-type')?.toLowerCase().includes('application/json'))
      return json({error:'Expected application/json'},415,origin);
    if(Number(request.headers.get('content-length')||0)>20000)
      return json({error:'Request too large'},413,origin);
    let body;
    try{
      const raw=await request.text();
      if(raw.length>20000)return json({error:'Request too large'},413,origin);
      body=JSON.parse(raw);
    }catch{return json({error:'Invalid JSON'},400,origin);}
    if(!body||Array.isArray(body)||typeof body!=='object'||
       typeof body.prompt!=='string'||!body.prompt.trim()||body.prompt.length>4000||
       (body.history!=null&&!Array.isArray(body.history)))
      return json({error:'Invalid prompt or history'},400,origin);
    // The limiter is approximate and per Cloudflare location; Free Neuron
    // allowance is the provider's final stop, not an unlimited free API.
    const ip=request.headers.get('CF-Connecting-IP')||'unknown-client';
    const {success}=await env.NATIVE_RATE_LIMITER.limit({key:ip});
    if(!success)return json({error:'ส่งคำถามถี่เกินไป กรุณาลองใหม่ภายหลัง'},429,origin);
    const context=buildNativeMessages(body.history,body.prompt);
    try{
      const response=await env.AI.run(BASE_MODEL,{
        messages:context.messages,
        max_tokens:850,temperature:0.6,stream:false,
        chat_template_kwargs:{enable_thinking:false},
      });
      return json({text:extractAnswer(response),model:'RUN AI Native',knowledgeIds:context.knowledgeIds},200,origin);
    }catch(error){
      // Never expose upstream diagnostics or secret provider information.
      const limited=/limit|neuron|quota|capacity|rate/i.test(String(error?.message||''));
      return json({error:limited
        ? 'Cloudflare AI ฟรีเต็มโควตาหรือไม่ว่าง กรุณาลองใหม่ภายหลัง'
        : 'โมเดล Native ตอบไม่สำเร็จ โปรดลองอีกครั้ง'},limited?429:503,origin);
    }
  }
};
