import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNativeMessages,retrieveKnowledge,retrieveExamples,validateTrainingData,knowledge,examples,instructions} from '../native-ai/rag.mjs';
import worker,{allowedOrigin,extractAnswer} from '../native-ai/worker.mjs';

const ORIGIN='https://main.d36aqo2v0nijxk.amplifyapp.com';
const stub=(answer={response:'ทดสอบสำเร็จ'},limited=false)=>{
 const events={calls:0,limits:0,messages:null};
 return {events,env:{
   ALLOWED_ORIGINS:ORIGIN,
   AI:{run:async(model,input)=>{events.calls++;events.messages=input.messages;return answer;}},
   NATIVE_RATE_LIMITER:{limit:async({key})=>{events.limits++;assert.ok(key);return {success:!limited};}},
 }};
};
const chat=(body,origin=ORIGIN)=>new Request('https://native.example/chat',{
 method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body),
});

test('training data are complete and valid',()=>{
 assert.deepEqual(validateTrainingData(),[]);
 assert.ok(knowledge.length>=8);
 assert.ok(examples.length>=6);
 assert.ok(instructions.rules.length>=4);
});
test('bad document IDs and duplicate IDs fail validation',()=>{
 const broken=[...knowledge,{...knowledge[0]}];
 assert.ok(validateTrainingData({instructions,knowledge:broken,examples}).some(x=>x.includes('duplicate')));
});
test('retrieval selects the correct GitHub-based native instructions',()=>{
 assert.ok(retrieveKnowledge('GitHub สอน Native AI ได้อย่างไร').some(x=>['training','native'].includes(x.id)));
 assert.ok(retrieveExamples('อยากสอน AI ของเว็บเอง').some(x=>x.input.includes('สอน')));
});
test('model context contains GitHub lessons but not bad history bubbles',()=>{
 const out=buildNativeMessages([{role:'assistant',text:'welcome'},{role:'user',text:'old'},{role:'assistant',text:'ok'},{role:'assistant',text:'failed',error:true}],'เทรน AI ผ่าน GitHub');
 assert.equal(out.messages[0].role,'system');
 assert.equal(out.messages.at(-1).role,'user');
 assert.ok(out.knowledgeIds.length>0);
 assert.ok(!out.messages.some(x=>x.content.includes('failed')));
});
test('message builder bounds input prompt',()=>{
 assert.throws(()=>buildNativeMessages([],'x'.repeat(4001)),/4000/);
});
test('cross-origin requests are rejected',async()=>{
 const {env,events}=stub();
 assert.equal(allowedOrigin(ORIGIN,env),true);
 assert.equal(allowedOrigin('https://evil.example',env),false);
 const response=await worker.fetch(chat({prompt:'Hello'},'https://evil.example'),env);
 assert.equal(response.status,403);
 assert.equal(events.calls,0);
});
test('health checks do not invoke AI',async()=>{
 const {env,events}=stub();
 const response=await worker.fetch(new Request('https://native.example/health',{headers:{Origin:ORIGIN}}),env);
 const result=await response.json();
 assert.equal(response.status,200);
 assert.equal(result.knowledgeCount,knowledge.length);
 assert.equal(events.calls,0);
});
test('OPTIONS preflight permits the exact production origin',async()=>{
 const {env}=stub();
 const response=await worker.fetch(new Request('https://native.example/chat',{method:'OPTIONS',headers:{Origin:ORIGIN}}),env);
 assert.equal(response.status,204);
 assert.equal(response.headers.get('access-control-allow-origin'),ORIGIN);
});
test('chat reaches remote AI with GitHub context',async()=>{
 const {env,events}=stub();
 const response=await worker.fetch(chat({prompt:'RUN AI Native สอนผ่าน GitHub อย่างไร?',history:[]}),env);
 assert.equal(response.status,200);
 assert.equal((await response.json()).text,'ทดสอบสำเร็จ');
 assert.equal(events.calls,1);
 assert.equal(events.limits,1);
 assert.equal(events.messages[0].role,'system');
});
test('invalid input fails before spending Cloudflare inference',async()=>{
 const {env,events}=stub();
 const response=await worker.fetch(chat({prompt:'x'.repeat(4400)}),env);
 assert.equal(response.status,400);
 assert.equal(events.calls,0);
});
test('per-location rate limiter blocks inference',async()=>{
 const {env,events}=stub({response:'hi'},true);
 const response=await worker.fetch(chat({prompt:'ทดสอบ'}),env);
 assert.equal(response.status,429);
 assert.equal(events.calls,0);
});
test('provider errors never reveal sensitive upstream trace',async()=>{
 const {env}=stub();
 env.AI.run=async()=>{throw new Error('Neurons quota exceeded secret-internal-trace')};
 const response=await worker.fetch(chat({prompt:'ทดสอบ'}),env);
 assert.equal(response.status,429);
 assert.ok(!(await response.text()).includes('secret-internal-trace'));
});
test('response adapters support Workers AI shapes',()=>{
 assert.equal(extractAnswer({response:'สวัสดี'}),'สวัสดี');
 assert.equal(extractAnswer({choices:[{message:{content:'Hello'}}]}),'Hello');
 assert.throws(()=>extractAnswer({foo:'bar'}),/did not return text/);
});
