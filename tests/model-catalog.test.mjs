import test from 'node:test';
import assert from 'node:assert/strict';
import { CLOUD_MODELS, LOCAL_MODELS, getLocalModel, selectCloudModel, cloudModelAvailable } from '../shared/model-catalog.mjs';
import { createBrowserModelRuntime } from '../src/browser-engine.mjs';

test('finite local and cloud model lists have distinct IDs', () => {
  assert.ok(LOCAL_MODELS.length >= 7);
  assert.ok(CLOUD_MODELS.length >= 5);
  const ids = [...LOCAL_MODELS, ...CLOUD_MODELS].map(x => x.id);
  assert.equal(new Set(ids).size, ids.length);
});
test('every cloud model has restricted provider, model ID and image support', () => {
  for (const model of CLOUD_MODELS) {
    assert.ok(['bedrock', 'openrouter'].includes(model.provider));
    assert.ok(typeof model.modelId === 'string' && model.modelId.length > 6);
    assert.equal(typeof model.supportsImage, 'boolean');
    assert.equal(selectCloudModel(model.id).modelId, model.modelId);
  }
  assert.equal(CLOUD_MODELS.find(x=>x.style==='Uncensored').supportsImage, false);
});
test('tampered cloud model names cannot route to arbitrary paid APIs', () => {
  for (const id of ['not-a-model','https://malicious.example','bedrock:aws-iam','openrouter:unlisted','']) {
    if (id === '') assert.throws(() => selectCloudModel(id));
    else assert.throws(() => selectCloudModel(id));
  }
});
test('Dolphin is an actual listed API model, not a pretend local model', () => {
  const dolphin = selectCloudModel('openrouter:dolphin-uncensored');
  assert.equal(dolphin.modelId, 'cognitivecomputations/dolphin-mistral-24b-venice-edition');
  assert.equal(dolphin.provider, 'openrouter');
});
test('OpenRouter requires backend enablement, local mode never consumes cloud quota', () => {
  const openrouter = selectCloudModel('openrouter:qwen3-32b');
  assert.equal(cloudModelAvailable(openrouter,{configured:true,openrouterEnabled:false}),false);
  assert.equal(cloudModelAvailable(openrouter,{configured:true,openrouterEnabled:true}),true);
  assert.equal(cloudModelAvailable(selectCloudModel(),{configured:true,openrouterEnabled:false}),true);
  assert.equal(cloudModelAvailable(selectCloudModel(),{configured:false,openrouterEnabled:false}),false);
});
test('browser models include low-resource and open-tuned variants', () => {
  assert.ok(getLocalModel('Qwen2.5-0.5B-Instruct-q4f16_1-MLC'));
  assert.ok(LOCAL_MODELS.some(x=>x.style==='เปิดกว้าง'));
  assert.ok(LOCAL_MODELS.some(x=>x.vramMB > 4000));
});
test('model change actually releases the previous WebLLM engine', async()=>{
  const unloaded=[];
  const loaded=[];
  const fake = {
    prebuiltAppConfig: { model_list: LOCAL_MODELS.map(x=>({model_id:x.id})) },
    CreateMLCEngine: async id => {
      loaded.push(id);
      return { unload: async()=>unloaded.push(id), chat:{completions:{create:async()=>({choices:[{message:{content:'ok'}}]})}} };
    },
  };
  const runtime=createBrowserModelRuntime(async()=>fake);
  const a=LOCAL_MODELS[0].id,b=LOCAL_MODELS[1].id;
  await runtime.load(a);
  assert.equal(runtime.activeModelId,a);
  await runtime.load(a);
  assert.equal(loaded.length,1);
  await runtime.load(b);
  assert.deepEqual(loaded,[a,b]);
  assert.deepEqual(unloaded,[a]);
  assert.equal(runtime.activeModelId,b);
});
test('unsupported or corrupt model does not incorrectly display loaded status',async()=>{
  const runtime=createBrowserModelRuntime(async()=>({
    prebuiltAppConfig: { model_list: [{model_id:LOCAL_MODELS[0].id}] },
    CreateMLCEngine: async()=>{throw new Error('no GPU memory');}
  }));
  await assert.rejects(runtime.load(LOCAL_MODELS[0].id),/no GPU memory/);
  assert.equal(runtime.activeModelId,null);
  await assert.rejects(runtime.load('bad-model'),/ไม่อยู่ในรายการ/);
  await assert.rejects(runtime.load(LOCAL_MODELS[1].id),/ยังไม่มีโมเดล/);
});
test('simultaneous model loads serialize safely', async()=>{
  const events=[];
  const fake={
    prebuiltAppConfig:{model_list:LOCAL_MODELS.slice(0,2).map(x=>({model_id:x.id}))},
    CreateMLCEngine:async id=>{
      events.push('load:'+id);
      return {unload:async()=>events.push('unload:'+id)};
    },
  };
  const runtime=createBrowserModelRuntime(async()=>fake);
  const [a,b]=LOCAL_MODELS;
  await Promise.all([runtime.load(a.id),runtime.load(b.id)]);
  assert.equal(runtime.activeModelId,b.id);
  assert.deepEqual(events,['load:'+a.id,'unload:'+a.id,'load:'+b.id]);
});

test('frontier catalog contains verified major API families and uses OpenRouter only', () => {
  const expected = ["openrouter:gpt-6-luna","openrouter:gpt-6.1-terra","openrouter:gpt-6.1-sol","openrouter:gpt-6-astra","openrouter:claude-sonnet-5.5","openrouter:claude-opus-5.5","openrouter:claude-fable-5.1","openrouter:gemini-4-argon","openrouter:grok-4.7"];
  for (const id of expected) {
    const model = selectCloudModel(id);
    assert.equal(model.provider, 'openrouter');
    assert.equal(model.tier, 'frontier');
    assert.equal(model.supportsImage, true);
    assert.ok(model.modelId.includes('/'));
    assert.equal(cloudModelAvailable(model,{configured:true,openrouterEnabled:false}),false);
  }
  assert.equal(CLOUD_MODELS.filter(m=>m.tier==='frontier').length,expected.length);
});
