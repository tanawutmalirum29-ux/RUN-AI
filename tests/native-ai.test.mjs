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

test('AWS Nova Micro Native adapter has valid Bedrock Converse shape and GitHub context',async()=>{
 const {buildNativeBedrockRequest,NATIVE_MODEL_ID,NATIVE_BEDROCK_MODEL}=await import('../shared/native-bedrock.mjs');
 const result=buildNativeBedrockRequest([
  {role:'assistant',text:'Welcome'},
  {role:'user',text:'อยากสอน AI'},
  {role:'assistant',text:'แก้ GitHub ได้'}
 ],'สอน AI ใน GitHub อย่างไร');
 assert.equal(NATIVE_MODEL_ID,'bedrock:run-ai-native');
 assert.equal(NATIVE_BEDROCK_MODEL,'amazon.nova-micro-v1:0');
 assert.equal(result.modelId,NATIVE_BEDROCK_MODEL);
 assert.equal(result.messages[0].role,'user');
 assert.equal(result.messages.at(-1).role,'user');
 assert.ok(result.system[0].text.includes('GitHub'));
 assert.equal(result.inferenceConfig.maxTokens,850);
 assert.ok(result.knowledgeIds.length>=1);
});
test('AWS Native prompt rejects oversized requests before incurring cost',async()=>{
 const {buildNativeBedrockRequest}=await import('../shared/native-bedrock.mjs');
 assert.throws(()=>buildNativeBedrockRequest([], 'x'.repeat(4001)),/4000/);
});

test('GitHub teaching data describes AWS Bedrock as Native default, not required Cloudflare',()=>{
 const native=knowledge.find(x=>x.id==='native');
 const guide=knowledge.find(x=>x.id==='howto');
 assert.match(native.text,/AWS Bedrock/);
 assert.match(guide.text,/Amazon Nova Micro/);
 assert.match(guide.text,/ไม่ต้องมี Cloudflare/);
 assert.equal(instructions.model,'amazon.nova-micro-v1:0');
 assert.ok(examples.some(x=>x.input.includes('Cloudflare') && x.output.includes('ไม่จำเป็น')));
});

test('ordinary greetings, creativity and science do not inject website manual',async()=>{
 const {isSiteQuestion,classifyIntent}=await import('../native-ai/rag.mjs');
 assert.equal(isSiteQuestion('ทำไมท้องฟ้าสีฟ้า'),false);
 assert.equal(classifyIntent('สวัสดี วันนี้เป็นไง'),'greeting');
 for(const question of ['สวัสดีครับ วันนี้เป็นไง','ช่วยแต่งนิยายแฟนตาซี','ทำไมท้องฟ้าสีฟ้า']){
  const result=buildNativeMessages([],question);
  assert.deepEqual(result.knowledgeIds,[]);
  assert.ok(!result.messages[0].content.includes('บริบทเฉพาะ RUN-AI จาก GitHub'));
  assert.ok(result.exampleCount>=1,question);
 }
});
test('topic-specific website questions receive relevant GitHub knowledge',()=>{
 const result=buildNativeMessages([],'RUN AI Native ใช้ AWS เสียเงินไหม');
 assert.ok(result.knowledgeIds.length>0);
 assert.ok(result.knowledgeIds.some(id=>['native','free','aws','howto'].includes(id)));
 assert.ok(result.messages[0].content.includes('บริบทเฉพาะ RUN-AI'));
});
test('site follow-ups inherit context, unrelated new questions do not',()=>{
 const history=[
  {role:'user',text:'RUN AI Native ใช้ AWS หรือ Cloudflare'},
  {role:'assistant',text:'ปัจจุบันใช้ AWS Bedrock เป็นค่าเริ่มต้น'},
 ];
 const followup=buildNativeMessages(history,'แล้วเสียเงินไหม');
 assert.ok(followup.knowledgeIds.length>0);
 assert.deepEqual(buildNativeMessages(history,'อธิบายแรงโน้มถ่วง').knowledgeIds,[]);
});
test('teaching dataset covers diverse situations and maintains natural styles',()=>{
 assert.ok(examples.length>=45);
 const categories=new Set(examples.map(x=>x.category));
 for(const category of ['greeting','emotional','learning','coding','creative','writing','planning','comparison','reasoning','context']){
  assert.ok(categories.has(category),category);
 }
 assert.ok(retrieveExamples('สวัสดี วันนี้สบายดีไหม').some(x=>x.category==='greeting'));
 assert.ok(retrieveExamples('ช่วยเขียนโค้ด JavaScript').some(x=>x.category==='coding'));
 assert.ok(retrieveExamples('ช่วยแต่งนิยายลึกลับ').some(x=>x.category==='creative'));
});
test('system remains bounded and history keeps valid alternating roles',()=>{
 const output=buildNativeMessages([
  {role:'assistant',text:'Welcome'},
  {role:'user',text:'ช่วยเขียนโค้ด'},
  {role:'assistant',text:'ได้เลย'}
 ],'แก้บั๊ก JavaScript ได้ไหม');
 assert.ok(output.messages[0].content.length<=8500);
 assert.equal(output.messages[1].role,'user');
 assert.equal(output.messages.at(-1).role,'user');
 assert.deepEqual(output.knowledgeIds,[]);
});
test('AWS Native allows richer answers while preserving bounded cost',async()=>{
 const {buildNativeBedrockRequest}=await import('../shared/native-bedrock.mjs');
 const request=buildNativeBedrockRequest([],'ช่วยแต่งเรื่องสั้นแฟนตาซี');
 assert.equal(request.inferenceConfig.maxTokens,850);
 assert.deepEqual(request.knowledgeIds,[]);
});
test('invalid categories and duplicate training questions fail validation',()=>{
 const duplicate=[...examples,{...examples[0]}];
 const invalid=[...examples,{input:'คำถามตัวอย่างใหม่',output:'คำตอบตัวอย่างนี้เขียนไว้ทดสอบการตรวจหมวด',tags:['ตัวอย่าง'],category:'wrong'}];
 assert.ok(validateTrainingData({instructions,knowledge,examples:duplicate}).some(e=>e.includes('duplicate input')));
 assert.ok(validateTrainingData({instructions,knowledge,examples:invalid}).some(e=>e.includes('invalid')));
});

test('an unrelated new user topic breaks stale RUN-AI RAG history',()=>{
 const history=[
  {role:'user',text:'RUN AI Native ทำงานผ่าน AWS ไหม'},
  {role:'assistant',text:'ใช่'},
  {role:'user',text:'อธิบายเรื่องแรงโน้มถ่วง'},
  {role:'assistant',text:'เป็นแรงดึงดูด'},
 ];
 const next=buildNativeMessages(history,'แล้วมันเสียเงินไหม');
 assert.deepEqual(next.knowledgeIds,[]);
});
