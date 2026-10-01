import test from 'node:test';
import assert from 'node:assert/strict';
import { batchSize, validateBatch, recentWords } from '../app/js/vocabulary-protocol.js';
import { loadVocabulary, vocabularyProblem } from '../app/js/vocabulary.js';
import { createWorker, GenerationQuota } from '../worker/index.js';
// Synthetic fixtures only, never used as game vocabulary.
const questions=n=>Array.from({length:n},(_,i)=>({word:String.fromCharCode(0xac00+i*28),meaning:'正解',distractors:['誤答一','誤答二','誤答三'],context:''}));
const req=(body,password='password',origin='https://test.github.io')=>new Request('https://worker/questions',{method:'POST',headers:{Origin:origin,Authorization:`Bearer ${password}`},body:JSON.stringify(body)});
const env=(status=204)=>({OPENAI_API_KEY:'server-only-key',APP_PASSWORD:'password',ALLOWED_ORIGINS:'https://test.github.io',GENERATION_QUOTA:{idFromName:x=>x,get:()=>({fetch:async()=>new Response(null,{status})})}});
const body={basicCount:10,extraMs:90000,recent:[]};
test('batch covers fastest 90-second extra, every problem has one answer step and four choices',()=>{
 for(const basic of [6,10,14]) {
  const n=batchSize(basic,90000);assert.ok(n-basic>(90900/520));
  for(const q of validateBatch({questions:questions(n)},n)){
   const p=vocabularyProblem(q);assert.equal(p.steps.length,1);assert.equal(p.steps[0].digit,q.meaning);assert.equal(new Set(p.choices).size,4);assert.equal(p.cells.find(c=>c.kind==='input').cs,q.meaning.length);
  }
 }
 assert.throws(()=>batchSize(10,Infinity));
});
test('reject missing questions, duplicated words, choices, unsafe strings and invalid Hangul',()=>{
 assert.throws(()=>validateBatch({questions:questions(1)},2));
 const dup=questions(2);dup[1].word=dup[0].word;assert.throws(()=>validateBatch({questions:dup},2));
 for(const edit of [q=>q.distractors[0]=q.meaning,q=>q.word='hello',q=>q.meaning='<script>',q=>q.context='a'.repeat(81)]){
  const qs=questions(1);edit(qs[0]);assert.throws(()=>validateBatch({questions:qs},1));
 }
 assert.equal(recentWords(questions(120).map(q=>q.word)).length,100);
});
test('browser requests exactly one batch, authenticates to Worker and handles rejection',async()=>{
 let calls=0;
 const result=await loadVocabulary({...body,password:'personal',endpoint:'https://worker/questions',fetchImpl:async(url,opts)=>{
  calls++;assert.equal(opts.headers.Authorization,'Bearer personal');assert.deepEqual(JSON.parse(opts.body),body);
  return Response.json({questions:questions(batchSize(10,90000))});
 }});assert.equal(calls,1);assert.equal(result.length,batchSize(10,90000));
 await assert.rejects(loadVocabulary({...body,password:'x',endpoint:'https://worker/questions',fetchImpl:async()=>Response.json({error:'password error'},{status:401})}),/password error/);
});
test('origin, password, quota and counts checked before AI invocation; preflight works',async()=>{
 let calls=0;const worker=createWorker(async()=>{calls++;throw Error();});
 for(const [r,e,status] of [[req(body,'wrong'),env(),401],[req(body,'password','https://evil.example'),env(),403],[req(body),env(429),429],[req({...body,basicCount:10000}),env(),400]])assert.equal((await worker.fetch(r,e)).status,status);
 assert.equal(calls,0);
 assert.equal((await worker.fetch(new Request('https://worker/questions',{method:'OPTIONS',headers:{Origin:'https://test.github.io'}}),env())).status,204);
});
test('Worker makes one AI call with strict schema, returns validated questions without secret',async()=>{
 let calls=0;const n=batchSize(10,90000);const worker=createWorker(async(url,opts)=>{
  calls++;assert.equal(url,'https://api.openai.com/v1/chat/completions');assert.equal(opts.headers.Authorization,'Bearer server-only-key');
  const payload=JSON.parse(opts.body);assert.equal(payload.response_format.json_schema.strict,true);assert.equal(payload.response_format.json_schema.schema.properties.questions.minItems,n);
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({questions:questions(n)})}}]});
 });
 const response=await worker.fetch(req(body),env());assert.equal(response.status,200);
 const text=await response.text();assert.ok(!text.includes('server-only-key'));assert.equal(JSON.parse(text).questions.length,n);assert.equal(calls,1);
});
test('invalid and incomplete AI outputs fail without retry or fixed fallback',async()=>{
 for(const output of [{choices:[{finish_reason:'length',message:{content:'{}'}}]},{choices:[{finish_reason:'stop',message:{content:JSON.stringify({questions:questions(1)})}}]}]){
  let calls=0;const worker=createWorker(async()=>{calls++;return Response.json(output);});
  assert.equal((await worker.fetch(req(body),env())).status,502);assert.equal(calls,1);
 }
});
test('quota persists between object instances and immediate repeats are refused',async()=>{
 const map=new Map();const tx={get:async k=>map.get(k),put:async(k,v)=>map.set(k,v)};const state={storage:{transaction:async fn=>fn(tx)}};
 assert.equal((await new GenerationQuota(state,{DAILY_GENERATION_LIMIT:'1'}).fetch()).status,204);
 assert.equal((await new GenerationQuota(state,{DAILY_GENERATION_LIMIT:'1'}).fetch()).status,429);
});

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
function gameHarness(load) {
 const code=readFileSync(new URL('../app/js/main.js',import.meta.url),'utf8');
 const nodes=new Map();const $=selector=>{
  if(!nodes.has(selector))nodes.set(selector,{hidden:true,textContent:'',dataset:{count:'10'},innerHTML:'',classList:{add(){},remove(){},toggle(){}},addEventListener(event,fn){this[event]=fn;},focus(){},appendChild(){}});
  return nodes.get(selector);
 };
 let clockStarts=0;const S={run:0};const state={};
 const ctx=vm.createContext({S,$,store:{load:()=>state},AI_ENDPOINT:'https://worker/questions',AbortController,AbortSignal,loadVocabulary:load,pickedCount:()=>10,EXTRA_MS:90000,recentWords,window:{prompt:()=> 'personal-password'},audio:{unlock(){},startMusic(){},jingle(){}},makeRng:()=>()=>.5,params:new URLSearchParams(),progress:()=>({}),makePlan:(kind,arg)=>({mode:'grade',grade:arg,vocabulary:arg===2}),applyLook(){},playLook(){},planCapsule(){},showCombo(){},fmtTime:()=>'',updateTally(){},showScreen:screen=>{S.screen=screen;},now:()=>{clockStarts++;return 1000;},setupProblem(){},document:{createElement:()=>({className:''})}});
 vm.runInContext(code.slice(code.indexOf('let vocabularyLoading = null;'),code.indexOf('\nfunction updateTally()')),ctx);
 return {ctx,S,$,get clockStarts(){return clockStarts;}};
}
test('real game start waits for generation; duplicate starts and cancellation do not start timers',async()=>{
 let resolve,calls=0;const h=gameHarness(async()=>{calls++;return new Promise(r=>resolve=r);});
 const first=h.ctx.startGame('grade',2);await h.ctx.startGame('grade',2);
 assert.equal(calls,1);assert.equal(h.clockStarts,0);assert.notEqual(h.S.screen,'play');
 resolve(questions(batchSize(10,90000)));await first;
 assert.equal(h.S.screen,'play');assert.equal(h.S.N,10);assert.equal(h.S.plan.vocabulary,true);assert.equal(h.S.startT,1000);
 const c=gameHarness(async()=>new Promise(r=>resolve=r));const pending=c.ctx.startGame('grade',2);
 c.$('#ai-cancel').click();resolve(questions(batchSize(10,90000)));await pending;
 assert.equal(c.clockStarts,0);assert.notEqual(c.S.screen,'play');
});
test('real game start handles generation failure without starting scoring or clocks',async()=>{
 const h=gameHarness(async()=>{throw Error('生成失敗');});await h.ctx.startGame('grade',2);
 assert.equal(h.clockStarts,0);assert.notEqual(h.S.screen,'play');assert.equal(h.$('#ai-status').textContent,'生成失敗');
});
