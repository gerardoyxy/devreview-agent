import test from 'node:test';
import assert from 'node:assert/strict';
import { application } from './application-safe-helpers.js';

const styleProfile = () => ({ id:'style-test',name:'My reading style',direction:'editorial',branch:'reading',tokens:{background:'#faf6ee',surface:'#fffdf8',text:'#34271e',muted:'#74604e',accent:'#963c24',onAccent:'#ffffff',border:'#c9bbaa',bodyFont:'system-ui, sans-serif',headingFont:'Georgia, serif',fontSize:16,spacing:24,radius:4,headingWeight:700},rules:[],notes:'Preserve visible focus states.' });

test('My Style: portable profiles, atomic context defaults, immutable task snapshots and validation', {timeout:30000}, async t => {
  const app=await application();t.after(()=>app.close());
  assert.equal((await fetch(app.address+'/api/my-style')).status,401);
  let library=(await app.api('/api/my-style')).data;assert.equal(library.revision,0);assert.deepEqual(library.suggestions,[]);
  const post=async(action,extra={})=>{const result=await app.api('/api/my-style',{method:'POST',body:JSON.stringify({revision:library.revision,action,...extra})});if(result.status===200)library=result.data;return result;};
  const profile=styleProfile();assert.equal((await post('save',{profile})).status,200);assert.equal(library.profiles[0].version,1);
  assert.deepEqual((await app.api('/api/project-context')).data.items,[],'Saving a style does not activate it');
  assert.match(library.guides[profile.id],/Georgia, serif/);
  assert.equal((await post('activate',{profileId:profile.id})).status,200);
  const context=(await app.api('/api/project-context')).data;assert.equal(context.items[0].default,true);assert.equal(context.items[0].id,'my-style-test');
  const create=async()=>{const result=await app.api('/api/tasks',{method:'POST',body:JSON.stringify({draft:true,kind:'frontend',request:'Apply my style to the settings page.'})});assert.equal(result.status,202);return result.data;};
  const draft=await create();const captured=draft.projectContext;assert.match(captured.items[0].content,/Corner radius in px: 4/);
  profile.tokens.radius=12;assert.equal((await post('save',{profile})).status,200);assert.equal(library.profiles[0].version,2);
  const next=await create();assert.match(next.projectContext.items[0].content,/Corner radius in px: 12/);
  assert.deepEqual((await app.api('/api/tasks/'+draft.id)).data.projectContext,captured,'Historical context must not silently change');
  for(const bad of [
    {...profile,direction:'unknown'}, {...profile,branch:'shape'}, {...profile,tokens:{...profile.tokens,accent:'url(https://example.com)'}},
    {...profile,tokens:{...profile.tokens,bodyFont:'font; background: red'}},
    {...profile,rules:[{scope:'buttons',property:'background-image',value:'url(https://example.com)'}]},
    {...profile,rules:[{scope:'buttons',property:'padding',value:'999999px'}]},
    {...profile,rules:[{scope:'buttons',property:'padding',value:'12px'},{scope:'buttons',property:'padding',value:'16px'}]},
  ]) assert.equal((await post('save',{profile:bad})).status,400);
  assert.equal((await app.api('/api/my-style',{method:'POST',body:JSON.stringify({revision:0,action:'save',profile})})).status,409);
  const imported={...profile,id:'style-import',rules:[{scope:'buttons',property:'border-radius',value:'16px',source:'accepted-pattern',evidence:['QA-999']}]};
  assert.equal((await post('import',{profile:imported})).status,200);
  assert.equal((await post('save',{profileId:profile.id,profile:imported})).status,400,'Mismatched IDs cannot overwrite another profile');
  assert.deepEqual(library.profiles[1].rules[0].evidence,[],'Imported local history is not evidence in this project');
  assert.equal((await post('activate',{profileId:imported.id})).status,200);
  assert.deepEqual((await app.api('/api/project-context')).data.items.filter(i=>i.default).map(i=>i.id),['my-style-import']);
  await app.restart();assert.deepEqual((await app.api('/api/my-style')).data,library);
  assert.equal((await post('delete',{profileId:imported.id})).status,200);assert.equal(library.activeId,null);
  assert.deepEqual((await app.api('/api/tasks/'+draft.id)).data.projectContext,captured);
  assert.equal((await post('accept',{profileId:profile.id,suggestionId:'pattern-invented',scope:'global'})).status,409);
  assert.equal((await app.api('/api/status')).data.executionEnabled,false);
});

test('My Style rolls back activation when Project context is full', {timeout:30000}, async t=>{
  const app=await application();t.after(()=>app.close());
  const context={version:1,revision:0,items:Array.from({length:32},(_,i)=>({id:`ctx-${i}`,kind:'document',title:`Reference ${i}`,content:'Reference text.',source:'',default:false}))};
  const savedContext=await app.api('/api/project-context',{method:'POST',body:JSON.stringify(context)});assert.equal(savedContext.status,200);
  const saved=await app.api('/api/my-style',{method:'POST',body:JSON.stringify({revision:0,action:'save',profile:styleProfile()})});assert.equal(saved.status,200);
  const failed=await app.api('/api/my-style',{method:'POST',body:JSON.stringify({revision:1,action:'activate',profileId:'style-test'})});assert.equal(failed.status,400);
  assert.deepEqual((await app.api('/api/my-style')).data,saved.data);
  assert.deepEqual((await app.api('/api/project-context')).data,savedContext.data);
});
