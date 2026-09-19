// Application/browser checks only. No adapter, model, agent fixture or project script runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { application } from './application-safe-helpers.js';

const post = body => ({ method:'POST', body:JSON.stringify(body), signal:AbortSignal.timeout(15000) });
test('device preview rejects unsafe requests and reports a missing browser without launching commands', async t => {
  const origin = 'http://localhost:39201';
  const app = await application({ origins:[origin], environment:{NUDGETHIS_BROWSER_PATH:path.resolve('missing-browser-test-executable')} });
  t.after(() => app.close());
  assert.equal((await app.api('/api/device-preview',{headers:{Authorization:''}})).status,401);
  const status = await app.api('/api/device-preview');
  assert.equal(status.data.available,false); assert.equal(status.data.session,null);
  assert.equal(status.data.profiles.length,5);
  const open = {action:'open',origin,path:'/',profile:'phone',orientation:'portrait'};
  assert.equal((await app.api('/api/device-preview',post({...open,origin:'https://example.com'}))).status,400);
  assert.equal((await app.api('/api/device-preview',post({...open,origin:'http://localhost:39202'}))).status,403);
  for (const route of ['//example.com','/../private','/path?secret=x','/a\\b','/a%2fb']) {
    assert.equal((await app.api('/api/device-preview',post({...open,path:route}))).status,400);
  }
  assert.equal((await app.api('/api/device-preview',post({...open,profile:'invented'}))).status,400);
  assert.equal((await app.api('/api/device-preview',post(open))).status,409);
  assert.equal((await app.api('/api/device-preview',post({action:'close'}))).status,200);
  assert.deepEqual((await readdir(path.join(app.root,'.nudgethis'))).filter(file=>file.startsWith('browser-')),[]);
});

test('Chromium device preview: touch, rotation, desktop reset, review evidence and owned lifecycle', {
  timeout:120000, skip:!process.env.NUDGETHIS_TEST_BROWSER && 'Set NUDGETHIS_TEST_BROWSER to run real browser checks',
}, async t => {
  const headers = new Map(); let hold;
  const site = createServer((req,res) => {
    headers.set(req.url,req.headers);
    if (req.url === '/redirect') { res.writeHead(302,{Location:'/login?private=test'}); res.end(); return; }
    if (req.url === '/loading') { res.writeHead(200,{'Content-Type':'text/html'}); res.write('<!doctype html><title>Loading</title>'); hold = res; return; }
    res.writeHead(200,{'Content-Type':'text/html'});
    res.end('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Device fixture</title><style>body{margin:0}button{width:180px;height:80px}</style><button>Tap me</button><script>window.touches=0;document.addEventListener("touchstart",()=>window.touches++);</script></html>');
  });
  await new Promise(resolve=>site.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{ hold?.end(); site.closeAllConnections(); await new Promise(resolve=>site.close(resolve)); });
  const origin = `http://127.0.0.1:${site.address().port}`;
  const app = await application({ origins:[origin], environment:{NUDGETHIS_BROWSER_PATH:process.env.NUDGETHIS_TEST_BROWSER,NUDGETHIS_BROWSER_HEADLESS:'1'} });
  t.after(()=>app.close());
  await writeFile(path.join(app.root,'index.html'),'<main>Device fixture</main>');
  let report = (await app.api('/api/route-review',post({action:'scan',origin,revision:0}))).data;
  for (const route of ['/redirect','/loading']) report = (await app.api('/api/route-review',post({action:'add',path:route,revision:report.revision}))).data;
  const open = async (profile='phone',orientation='portrait',route='/') => {
    const result = await app.api('/api/device-preview',post({action:'open',origin,path:route,profile,orientation}));
    assert.equal(result.status,200,JSON.stringify(result.data)); return result.data.session;
  };
  const review = async (session,route='/',viewport='mobile',extra={}) => {
    const result = await app.api('/api/route-review',post({action:'review',id:route,viewport,status:'reviewed',method:'device',sessionId:session.id,width:session.profile.width,revision:report.revision,...extra}));
    if (result.status === 200) report = result.data;
    return result;
  };
  const reviewed = async (session,viewport='mobile') => {
    let result;
    for (let n=0;n<30;n++) { result=await review(session,'/',viewport); if (result.status===200 || !result.data.error.includes('still loading')) break; await delay(50); }
    assert.equal(result.status,200,JSON.stringify(result.data));
    return result.data.routes.find(route=>route.id==='/')[viewport].device;
  };
  const phone = await open();
  let evidence = await reviewed(phone);
  assert.equal(evidence.profile.width,390); assert.equal(evidence.observed.width,390);
  assert.equal(evidence.observed.dpr,3); assert.equal(evidence.observed.touchPoints,5);
  assert.equal(evidence.observed.coarsePointer,true); assert.equal(evidence.observed.orientation,'portrait-primary');
  assert.match(headers.get('/')['user-agent'],/Android.*Mobile/);
  assert.equal(headers.get('/')['sec-ch-ua-mobile'],'?1');

  // Test code attaches only to the browser/profile this fixture owns; the product exposes no raw CDP API.
  const directories = (await readdir(path.join(app.root,'.nudgethis'))).filter(file=>file.startsWith('browser-'));
  assert.equal(directories.length,1);
  const [port,endpoint] = (await readFile(path.join(app.root,'.nudgethis',directories[0],'DevToolsActivePort'),'utf8')).split(/\r?\n/);
  const socket = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
  await once(socket,'open'); t.after(()=>socket.close());
  let sequence = 0;
  const cdp = (method,params={},sessionId) => new Promise((resolve,reject)=>{
    const id=++sequence;
    const timer=setTimeout(()=>{socket.removeEventListener('message',listener);reject(new Error(`Browser timeout: ${method}`));},3000);
    const listener=event=>{const message=JSON.parse(event.data);if(message.id!==id)return;clearTimeout(timer);socket.removeEventListener('message',listener);message.error?reject(new Error(message.error.message)):resolve(message.result);};
    socket.addEventListener('message',listener); socket.send(JSON.stringify({id,method,params,sessionId}));
  });
  const target=(await cdp('Target.getTargets')).targetInfos.find(target=>target.type==='page');
  const attached=await cdp('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  const tab=attached.sessionId;
  await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:40,y:40}]},tab);
  await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]},tab);
  assert((await cdp('Runtime.evaluate',{expression:'window.touches',returnByValue:true},tab)).result.value>0,'Emulated touch must reach the page');
  await cdp('Runtime.evaluate',{expression:'localStorage.setItem("temporary-review","kept")'},tab);
  const landscape=await open('phone','landscape');
  assert.equal((await review(phone)).status,409,'Old session cannot certify new settings');
  evidence=await reviewed(landscape);
  assert.equal(evidence.observed.width,844); assert.equal(evidence.observed.height,390);
  assert.equal(evidence.observed.orientation,'landscape-primary');
  assert.equal((await cdp('Runtime.evaluate',{expression:'localStorage.getItem("temporary-review")',returnByValue:true},tab)).result.value,'kept');
  const tablet=await open('tablet'); evidence=await reviewed(tablet);
  assert.equal(evidence.observed.width,768); assert.equal(evidence.observed.dpr,2);
  assert.equal(headers.get('/')['sec-ch-ua-mobile'],'?0');
  const desktop=await open('desktop');
  assert.equal((await review(desktop)).status,409,'Desktop cannot count as mobile review');
  evidence=await reviewed(desktop,'desktop');
  assert.equal(evidence.observed.width,1440); assert.equal(evidence.observed.dpr,1);
  assert.equal(evidence.observed.touchPoints,0); assert.equal(evidence.observed.coarsePointer,false);
  assert.doesNotMatch(headers.get('/')['user-agent'],/Android/);
  assert.notEqual(headers.get('/')['sec-ch-ua-platform'],'"Android"');
  const redirected=await open('phone','portrait','/redirect'); await delay(150);
  assert.equal((await review(redirected,'/redirect')).status,409);
  const loading=await open('phone','portrait','/loading');
  assert.equal((await review(loading,'/loading')).status,409); hold.end();
  await cdp('Target.closeTarget',{targetId:target.targetId});
  let closed;
  for (let n=0;n<30;n++) { closed=await app.api('/api/device-preview'); if (!closed.data.session) break; await delay(50); }
  assert.equal(closed.data.session,null);
  assert.equal((await review(loading,'/loading')).status,409);
  const reopened=await open(); await reviewed(reopened);
  assert.equal((await app.api('/api/device-preview',post({action:'close'}))).data.session,null);
  assert.equal((await review(reopened)).status,409);
  assert.deepEqual((await readdir(path.join(app.root,'.nudgethis'))).filter(file=>file.startsWith('browser-')),[]);
  await open();
  await app.restart();
  assert.equal((await app.api('/api/device-preview')).data.session,null);
  assert.deepEqual((await readdir(path.join(app.root,'.nudgethis'))).filter(file=>file.startsWith('browser-')),[]);
  assert.equal((await app.api('/api/status')).data.executionEnabled,false);
  assert.equal((await app.api('/api/tasks')).data.length,0);
});
