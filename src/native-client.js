/**
 * RUN AI Native chat directly calls a Cloudflare Worker; no user GPU,
 * AWS Lambda inference request or secret API key is involved.
 * The endpoint is public, rate-limited and bounded by Cloudflare Free.
 */
const configuredUrl=(import.meta.env.VITE_RUN_AI_NATIVE_URL||'').trim();
const nativeBase=(()=>{
  try {
    const u=new URL(configuredUrl);
    return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash
      ? u.origin : '';
  }catch{return '';}
})();
export const nativeConfigured=Boolean(nativeBase);

async function callNative(path,options={}) {
  if(!nativeConfigured)throw new Error('ยังไม่ตั้งค่า VITE_RUN_AI_NATIVE_URL ใน Amplify');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),45000);
  try{
    const response=await fetch(nativeBase+path,{...options,signal:controller.signal});
    let data;
    try{data=await response.json();}catch{throw new Error('Cloudflare ส่งข้อมูลผิดรูปแบบ');}
    if(!response.ok)throw new Error(data?.error||('Cloudflare HTTP '+response.status));
    return data;
  }catch(error){
    if(error?.name==='AbortError')throw new Error('Cloudflare AI ตอบช้าเกิน 45 วินาที');
    throw error;
  }finally{clearTimeout(timer);}
}
export function nativeStatus(){return callNative('/health');}
export function nativeChat(prompt,history=[]){
  return callNative('/chat',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({prompt,history}),
  });
}
