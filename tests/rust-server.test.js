import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, access, mkdir, readdir, symlink } from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { fixture,start,input,finished,action,git,until,configure,command,binary } from './helpers.js';
const setup=async(t,options)=>start(t,await fixture(t),options);
const submit=app=>app.api('/api/tasks',input);
const checkGreen=`"${process.execPath}" -e "process.exit(require('fs').readFileSync('button.css','utf8').includes('green')?0:1)"`;

test('Rust server isolates, validates and applies a reviewed patch without committing',async t=>{
 const app=await setup(t,{commands:[checkGreen]});const task=await submit(app);const ready=await finished(app,task.id);
 assert.equal(ready.status,'ready',ready.error);assert.equal(ready.validation[0].passed,true);assert.match(ready.diff,/green/);
 assert.match(await readFile(path.join(app.root,'button.css'),'utf8'),/red/);const head=await git(app.root,'rev-parse','HEAD');
 await action(app,task.id,'apply',{attempt:1});assert.match(await readFile(path.join(app.root,'button.css'),'utf8'),/green/);assert.equal(await git(app.root,'rev-parse','HEAD'),head);
 await assert.rejects(access(app.worktree(task.id)));assert.equal((await app.api(`/api/tasks/${task.id}`)).status,'applied');
});
test('follow-up retains edits, messages and immutable earlier diffs; stale actions fail',async t=>{
 const app=await setup(t,{agents:[{id:'conversation',flavor:'conversation'}]});const task=await submit(app);const first=await finished(app,task.id);
 await action(app,task.id,'messages',{content:'Also round the corners',attempt:1});const next=await finished(app,task.id);
 assert.equal(next.status,'ready',next.error);assert.equal(next.attempt,2);assert.match(next.diff,/border-radius: 14px/);assert.equal(next.messages.length,4);assert.equal(next.revisions.length,2);
 assert.equal((await app.api(`/api/tasks/${task.id}/revisions/1`)).diff,first.diff);
 await assert.rejects(action(app,task.id,'apply',{attempt:1}),/newer version/);await assert.rejects(action(app,task.id,'messages',{content:'stale',attempt:1}),/newer version/);
 for(const content of ['', ' ', 123, 'x'.repeat(8001)])assert.equal((await app.raw(`/api/tasks/${task.id}/messages`,{content})).status,400);
 await action(app,task.id,'apply',{attempt:2});assert.equal((await app.api(`/api/tasks/${task.id}/revisions/2`)).status,'applied');
 await assert.rejects(action(app,task.id,'messages',{content:'Next'}),/Commit or stash/);await git(app.root,'add','.');await git(app.root,'commit','-m','Apply reviewed change');
 await action(app,task.id,'messages',{content:'Also round the corners'});assert.equal((await finished(app,task.id)).attempt,3);
});
test('question-only reply waits for feedback, then produces a patch',async t=>{
 const app=await setup(t,{agents:[{id:'question',flavor:'question'}]});const task=await submit(app);assert.equal((await finished(app,task.id)).status,'awaiting_feedback');
 await assert.rejects(action(app,task.id,'apply'),/Only ready/);await action(app,task.id,'messages',{content:'Green, please'});assert.equal((await finished(app,task.id)).status,'ready');
});
test('streamed response arrives while working; cancellation kills descendants',async t=>{
 const app=await setup(t,{agents:[{id:'wait',flavor:'wait'}]});const task=await submit(app);
 await until(async()=>{const t=await app.api(`/api/tasks/${task.id}`);return t.status==='working'&&t.messages.length===2;});
 await assert.rejects(action(app,task.id,'messages',{content:'Overlap'}),/Wait for the agent/);await action(app,task.id,'cancel');assert.equal((await app.api(`/api/tasks/${task.id}`)).status,'cancelled');assert.equal((await app.api(`/api/tasks/${task.id}`)).history.filter(e=>e.action==='cancelled').length,1);
 await new Promise(r=>setTimeout(r,1700));await assert.rejects(access(path.join(app.worktree(task.id),'escaped-child.txt')));await assert.rejects(action(app,task.id,'apply'),/Only ready/);
});
test('local edits survive conflicts, retry uses current committed HEAD',async t=>{
 const app=await setup(t);const task=await submit(app);await finished(app,task.id);await writeFile(path.join(app.root,'button.css'),'.button { color: blue; }\n');
 await assert.rejects(action(app,task.id,'apply'),/local edits/);assert.equal((await app.api(`/api/tasks/${task.id}`)).status,'conflict');
 await git(app.root,'add','.');await git(app.root,'commit','-m','Developer edit');await action(app,task.id,'retry');const retry=await finished(app,task.id);assert.equal(retry.attempt,2);assert.match(retry.diff,/-\.button \{ color: blue/);
});
test('unrelated commits and edits survive an apply',async t=>{
 const app=await setup(t);const task=await submit(app);await finished(app,task.id);await writeFile(path.join(app.root,'other.txt'),'committed\n');await git(app.root,'add','.');await git(app.root,'commit','-m','Unrelated');await writeFile(path.join(app.root,'other.txt'),'keep this\n');
 await action(app,task.id,'apply');assert.equal(await readFile(path.join(app.root,'other.txt'),'utf8'),'keep this\n');
});
test('branch changes and overlapping committed edits become conflicts',async t=>{
 const app=await setup(t);const task=await submit(app);await finished(app,task.id);await git(app.root,'switch','-c','other');await assert.rejects(action(app,task.id,'apply'),/branch changed/);
 await git(app.root,'switch','main');await action(app,task.id,'retry');await finished(app,task.id);await writeFile(path.join(app.root,'button.css'),'different\n');await git(app.root,'add','.');await git(app.root,'commit','-m','Overlap');await assert.rejects(action(app,task.id,'apply'),/patch/);assert.equal(await readFile(path.join(app.root,'button.css'),'utf8'),'different\n');
});
test('concurrent worktrees are isolated and applies serialize',async t=>{
 const app=await setup(t);const [a,b]=await Promise.all([submit(app),submit(app)]);await Promise.all([finished(app,a.id),finished(app,b.id)]);await access(app.worktree(a.id));await access(app.worktree(b.id));
 const results=await Promise.allSettled([action(app,a.id,'apply'),action(app,b.id,'apply')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.deepEqual(new Set((await app.api('/api/tasks')).map(t=>t.status)),new Set(['applied','conflict']));
});
test('validation failures, timeouts and source mutations block apply',async t=>{
 for(const command of [`"${process.execPath}" -e "console.error('broken test');process.exit(1)"`,`"${process.execPath}" -e "setInterval(()=>{},1000)"`,`"${process.execPath}" -e "require('fs').writeFileSync('other.txt','mutated')"`]){
  const app=await setup(t,{commands:[command],validationTimeout:500});const task=await submit(app);const failed=await finished(app,task.id);assert.equal(failed.status,'failed');await assert.rejects(action(app,task.id,'apply'),/Only ready/);await access(app.worktree(task.id));await action(app,task.id,'reject');await assert.rejects(access(app.worktree(task.id)));await app.stop();
 }
});
test('binary additions and deletions are included in the patch',async t=>{
 const app=await setup(t,{agents:[{id:'binary',flavor:'binary'}]});const task=await submit(app);const ready=await finished(app,task.id);assert.equal(ready.status,'ready',ready.error);assert.deepEqual(ready.files.sort(),['asset.bin','other.txt']);await action(app,task.id,'apply');assert.deepEqual(await readFile(path.join(app.root,'asset.bin')),Buffer.from([0,2,255,4,0,6]));await assert.rejects(access(path.join(app.root,'other.txt')));
});
test('secret and symlink patches cannot become ready',async t=>{
 for(const flavor of process.platform==='win32'?['secret']:['secret','symlink']){const app=await setup(t,{agents:[{id:flavor,flavor}]});const task=await submit(app);const failed=await finished(app,task.id);assert.equal(failed.status,'failed');assert.match(failed.error,/Protected|Symlink/);await app.stop();}
});
test('dirty snapshots and unconfigured agent IDs are rejected before creating tasks',async t=>{
 const app=await setup(t);await assert.rejects(app.api('/api/tasks',{...input,agent:'unknown',command:'ignored'}),/not configured/);assert.equal((await app.api('/api/tasks')).length,0);
 await writeFile(path.join(app.root,'new.txt'),'uncommitted');await assert.rejects(submit(app),/Commit or stash/);assert.equal((await app.api('/api/tasks')).length,0);
});
test('Host, Origin, bearer token, content type, bounded payload and input allowlist',async t=>{
 const app=await setup(t);assert.equal((await fetch(app.url+'/api/tasks')).status,401);
 for(const Origin of ['https://evil.example','null'])assert.equal((await app.raw('/api/tasks',undefined,{headers:{...app.headers,Origin}})).status,403);
 const preflight=await fetch(app.url+'/api/tasks',{method:'OPTIONS',headers:{Origin:'http://localhost:3000'}});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),'http://localhost:3000');
 const badHost=await new Promise(resolve=>http.get(app.url+'/api/tasks',{headers:{...app.headers,Host:'evil.example'}},r=>{r.resume();resolve(r.statusCode);}));assert.equal(badHost,403);
 assert.equal((await app.raw('/api/tasks',{}, {body:'{'})).status,400);assert.equal((await app.raw('/api/tasks',input,{headers:{...app.headers,'Content-Type':'text/plain'}})).status,415);
 assert.equal((await app.raw('/api/tasks',{...input,request:'x'.repeat(40000)})).status,413);
 const created=await app.api('/api/tasks',{...input,command:'ignored',context:{...input.context,password:'secret',url:'http://user:pass@localhost:3000/settings?token=secret#private'}});
 assert.equal(created.context.url,'http://localhost:3000/settings');assert.equal(created.command,undefined);assert.equal(created.context.password,undefined);await finished(app,created.id);
 assert.equal((await app.raw(`/api/tasks/${created.id}/apply`)).status,404);assert.equal((await app.raw(`/api/tasks/${created.id}/revisions/999`)).status,404);
 for(const asset of ['/','/app.js','/style.css','/overlay.js','/review.js','/playground','/playground.js']){const response=await fetch(app.url+asset);assert.equal(response.status,200,asset);assert.ok((await response.text()).length);}
});
test('header-authenticated SSE sends task changes and appearance changes',async t=>{
 const app=await setup(t);const controller=new AbortController();t.cleanups.push(()=>controller.abort());const response=await app.raw('/api/events',undefined,{signal:controller.signal});assert.match(response.headers.get('content-type'),/text\/event-stream/);const reader=response.body.getReader();await reader.read();const task=await submit(app);const event=new TextDecoder().decode((await reader.read()).value);assert.match(event,/event: task/);assert.match(event,new RegExp(task.id));controller.abort();await finished(app,task.id);
});
test('tasks, tokens, conversation and revisions survive restart with an exclusive lock',async t=>{
 const root=await fixture(t);let app=await start(t,root);const task=await submit(app);await finished(app,task.id);await action(app,task.id,'messages',{content:'Keep it green'});await finished(app,task.id);
 const duplicate=await command(binary,['--root',root,'start']);assert.notEqual(duplicate.code,0);assert.match(duplicate.stderr,/server lock/);const token=app.token;await app.stop();app=await start(t,root,false);assert.equal(app.token,token);const saved=await app.api(`/api/tasks/${task.id}`);assert.equal(saved.messages.length,4);assert.equal(saved.revisions.length,2);
});
test('legacy SQLite is backed up, migrated once, and interrupted tasks recover as failed',async t=>{
 const root=await fixture(t);await configure(root);await mkdir(path.join(root,'.devreview'));const file=path.join(root,'.devreview','tasks.sqlite');const db=new DatabaseSync(file);db.exec('CREATE TABLE tasks(id INTEGER PRIMARY KEY AUTOINCREMENT,data TEXT NOT NULL)');
 const legacy={...input,attempt:1,status:'ready',diff:'original patch',files:['button.css'],validation:[],baseCommit:'abc',baseBranch:'main',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
 db.prepare('INSERT INTO tasks(data) VALUES(?)').run(JSON.stringify(legacy));db.prepare('INSERT INTO tasks(data) VALUES(?)').run(JSON.stringify({...legacy,status:'working'}));db.close();
 let app=await start(t,root,false);assert.equal((await app.api('/api/tasks/QA-1')).messages[0].content,input.request);assert.equal((await app.api('/api/tasks/QA-1/revisions/1')).diff,'original patch');assert.equal((await app.api('/api/tasks/QA-2')).status,'failed');await app.stop();
 assert.equal((await readdir(path.join(root,'.devreview'))).filter(f=>f.startsWith('tasks.before-rust-')).length,1);app=await start(t,root,false);assert.equal((await app.api('/api/tasks/QA-1')).messages.length,1);await app.stop();assert.equal((await readdir(path.join(root,'.devreview'))).filter(f=>f.startsWith('tasks.before-rust-')).length,1);
});
test('reject/retry preserve earlier versions; delete removes messages and keeps audit',async t=>{
 const app=await setup(t);const task=await submit(app);const ready=await finished(app,task.id);await action(app,task.id,'retry');await finished(app,task.id);await action(app,task.id,'reject');assert.equal((await app.api(`/api/tasks/${task.id}/revisions/1`)).diff,ready.diff);assert.equal((await app.api(`/api/tasks/${task.id}/revisions/2`)).status,'rejected');
 await app.api(`/api/tasks/${task.id}`,undefined,{method:'DELETE'});assert.equal((await app.raw(`/api/tasks/${task.id}`)).status,404);await app.stop();const db=new DatabaseSync(path.join(app.root,'.devreview','tasks.sqlite'));assert.equal(db.prepare('SELECT COUNT(*) n FROM messages').get().n,0);assert.equal(db.prepare("SELECT COUNT(*) n FROM audit WHERE action='deleted'").get().n,1);db.close();
});
test('credentials require ignored state, and state symlinks are refused',async t=>{
 const root=await fixture(t);await configure(root);await writeFile(path.join(root,'.gitignore'),'');const result=await command(binary,['--root',root,'start']);assert.notEqual(result.code,0);assert.match(result.stderr,/Ignore .devreview/);await assert.rejects(access(path.join(root,'.devreview','token')));
 if(process.platform!=='win32'){await writeFile(path.join(root,'.gitignore'),'.devreview/\n');await symlink(path.join(root,'other.txt'),path.join(root,'.devreview','token'));const r=await command(binary,['--root',root,'start']);assert.match(r.stderr,/symlinks/);assert.equal(await readFile(path.join(root,'other.txt'),'utf8'),'unchanged\n');}
});
test('legacy executable configuration and external origins are explicitly refused',async t=>{
 const root=await fixture(t);await writeFile(path.join(root,'devreview.config.mjs'),'throw new Error("must not execute")');let r=await command(binary,['--root',root,'start']);assert.match(r.stderr,/Legacy devreview.config.mjs/);await writeFile(path.join(root,'devreview.toml'),'[server]\nallowedOrigins=["https://example.com"]\n');r=await command(binary,['--root',root,'start']);assert.match(r.stderr,/loopback origins/);
});
test('agent selection uses registered IDs, and public capabilities do not expose executables',async t=>{
 const app=await setup(t,{agents:[{id:'first',flavor:'question'},{id:'second',flavor:'edit'}]});const status=await app.api('/api/status');assert.equal(status.runtime,'rust');assert.deepEqual(status.agents.map(a=>a.id),['first','second']);assert.equal(status.agents[0].command,undefined);assert.equal(status.agents[0].capabilities.resume,false);
 const task=await app.api('/api/tasks',{...input,agent:'second'});assert.equal((await finished(app,task.id)).status,'ready');assert.equal((await app.api(`/api/tasks/${task.id}`)).agent,'second');
});
const palette=Object.fromEntries(['page','surface','elevated','text','muted','border','accent','onAccent','accentSoft','success','successSoft','danger','dangerSoft','warning','warningSoft','info','infoSoft','backdrop'].map(k=>[k,'#112233']));
const theme=()=>({version:1,mode:'dark',palettes:{light:{...palette},dark:{...palette}},fonts:{body:'Georgia, serif',heading:'Arial, sans-serif',mono:'Consolas, monospace'},fontSize:16,radius:8,customFonts:[]});
test('appearance persists, publishes SSE, and rejects CSS injection and malformed fonts',async t=>{
 const root=await fixture(t);let app=await start(t,root);assert.equal(await app.api('/api/appearance'),null);const value=theme();const controller=new AbortController();t.cleanups.push(()=>controller.abort());const stream=await app.raw('/api/events',undefined,{signal:controller.signal});const reader=stream.body.getReader();await reader.read();assert.deepEqual(await app.api('/api/appearance',value),value);assert.match(new TextDecoder().decode((await reader.read()).value),/event: appearance/);controller.abort();
 for(const bad of [{...value,mode:'x'},{...value,fonts:{...value.fonts,body:'url(https://evil.example)'}},{...value,customFonts:[{name:'DevReviewFontbody',data:Buffer.from('not a font').toString('base64')}]},{...value,palettes:{...value.palettes,dark:{...palette,accent:'red; background:url(x)'}}}])assert.equal((await app.raw('/api/appearance',bad)).status,400);
 await app.stop();app=await start(t,root,false);assert.deepEqual(await app.api('/api/appearance'),value);
});
