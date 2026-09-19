import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { startServer } from '../packages/server/src/index.js';
import { run } from '../packages/shared/src/index.js';

// This explicitly labelled demo adapter never calls a model or edits your project.
const root = await mkdtemp(path.join(tmpdir(), 'nudgethis-demo-'));
const before = '.actions { display: flex; justify-content: flex-start; }\n.add-button { padding: 12px 18px; border: 0; border-radius: 7px; background: #263e29; color: white; font: 600 13px system-ui; cursor: pointer; }\n';
const after = '.actions { display: flex; justify-content: flex-end; }\n.add-button { padding: 12px 18px; border: 0; border-radius: 7px; background: #263e29; color: white; font: 600 13px system-ui; cursor: pointer; }\n@media (max-width: 640px) { .add-button { width: 100%; } }\n';
const demoHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NudgeThis demo — Team workspace</title><style>body{margin:0;font:14px system-ui;background:#f4f6f0;color:#273327}*{box-sizing:border-box}header{padding:24px 8vw;border-bottom:1px solid #dfe5d7;background:white;display:flex;justify-content:space-between;align-items:center}header strong{font-size:20px;letter-spacing:-1px}header span{font-size:11px;color:#7c8c70}main{max-width:960px;margin:65px auto;padding:0 25px}.eyebrow{font-size:10px;letter-spacing:2px;color:#83946f}h1{font-size:42px;font-weight:550;letter-spacing:-2px;margin:16px 0}p{color:#819075;line-height:1.8}.card{background:white;border:1px solid #dfe5d7;border-radius:12px;margin-top:35px;padding:28px}.row{display:flex;align-items:center;gap:14px;padding:22px 0;border-bottom:1px solid #edf0e7}.avatar{width:37px;height:37px;border-radius:50%;background:#e9efdd;display:grid;place-items:center;font-size:12px;color:#7a8f60}.person{flex:1}.person small{display:block;color:#97a08d;margin-top:4px}.role{color:#8c9981;font-size:11px}.actions{margin:25px 0 0}.tip{font-size:12px;border-left:2px solid #b2cd92;padding:10px 18px;margin-top:28px}code{color:#617b47}a{color:inherit}#demo-css{display:none}@media(max-width:640px){main{margin-top:35px}h1{font-size:31px}header{padding:20px}.card{padding:20px}}</style><style id="button-style"></style></head><body><header><strong>acme<span style="color:#90b16f">.</span></strong><span>NUDGETHIS OFFLINE DEMO</span></header><main><span class="eyebrow">WORKSPACE / PEOPLE</span><h1>Good work starts with your team.</h1><p>Manage the people building something great with you.</p><section class="card"><strong>Team members <span style="color:#9aa88c;font-weight:400">/ 3</span></strong><div class="row"><div class="avatar">AM</div><div class="person">Alex Morgan<small>alex@example.test</small></div><span class="role">Owner</span></div><div class="row"><div class="avatar">JL</div><div class="person">Jordan Lee<small>jordan@example.test</small></div><span class="role">Developer</span></div><div class="row"><div class="avatar">SR</div><div class="person">Sam Rivera<small>sam@example.test</small></div><span class="role">Designer</span></div><div class="actions"><button class="add-button" data-testid="add-teammate">+ Add teammate</button></div></section><p class="tip">Hold <code>Alt</code> and right-click <strong>Add teammate</strong>. Request: “Align this button to the right on desktop and make it full width on mobile.”<br>The demo adapter makes this one predefined fix. Review and apply it in the conversation window, or use the <a id="dashboard">dashboard</a>, then watch this page update.</p><p id="message" role="status"></p></main><script type="module" src="/app.js"></script></body></html>`;
await writeFile(path.join(root, '.gitignore'), '.nudgethis/\n');
await writeFile(path.join(root, 'button.css'), before);
await writeFile(path.join(root, 'index.html'), demoHtml);
await writeFile(path.join(root, 'validate.mjs'), "import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';const css=await readFile('button.css','utf8');assert.match(css,/justify-content: flex-end/);assert.match(css,/max-width: 640px/);assert.match(css,/width: 100%/);console.log('Desktop alignment and mobile width checks passed.');\n");
for (const args of [['init', '-b', 'main'], ['add', '.'], ['-c', 'user.name=NudgeThis Demo', '-c', 'user.email=demo@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'Demo app']]) {
  const result = await run('git', args, { cwd: root }); if (result.code) throw new Error(result.stderr);
}
const demoAgent = { name: 'demo', label: 'Demo (predefined button fix)', async run({ cwd, signal, task, onMessage }) {
  onMessage('I’m checking the button layout in this task’s isolated copy. You can keep reviewing the page.');
  await new Promise(resolve => setTimeout(resolve, 900)); signal.throwIfAborted();
  if (task.attempt > 1) {
    const current = await readFile(path.join(cwd, 'button.css'), 'utf8');
    await writeFile(path.join(cwd, 'button.css'), current.replace('border-radius: 7px', 'border-radius: 14px'));
    onMessage('I kept the desktop alignment and mobile width, and rounded the button corners. This demo follow-up is predefined; a real Codex adapter would respond to your message.');
  } else {
    await writeFile(path.join(cwd, 'button.css'), after);
    onMessage('The button now aligns to the right on desktop and fills the row on mobile. Next I’ll run the layout checks. You can review the patch or ask for an adjustment here.');
  }
  return { output: 'Demo adapter: predefined CSS change. No external model was called.' };
} };
let app;
const web = http.createServer(async (req, res) => {
  try {
    if (![`127.0.0.1:${web.address().port}`, `localhost:${web.address().port}`].includes(req.headers.host)) { res.writeHead(403); res.end(); return; }
    const route = new URL(req.url, 'http://localhost').pathname;
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
    if (route === '/') { res.setHeader('Content-Type', 'text/html'); res.end(await readFile(path.join(root, 'index.html'))); }
    else if (route === '/button.css') { res.setHeader('Content-Type', 'text/css'); res.end(await readFile(path.join(root, 'button.css'))); }
    else if (route === '/app.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(`import { NudgeThis } from '${app.url}/overlay.js';\nconst token=new URLSearchParams(location.hash.slice(1)).get('token')||sessionStorage.getItem('demo-token');\nif(token){sessionStorage.setItem('demo-token',token);history.replaceState(null,'','/');NudgeThis.init({server:'${app.url}',token,enabled:true});document.querySelector('#dashboard').href='${app.url}/#token='+token;}\nasync function refresh(){document.querySelector('#button-style').textContent=await fetch('/button.css').then(r=>r.text());}await refresh();setInterval(refresh,700);document.querySelector('.add-button').onclick=()=>document.querySelector('#message').textContent='Invite flow placeholder — try reporting a layout issue.';`);
    } else { res.writeHead(404); res.end(); }
  } catch { res.writeHead(500); res.end(); }
});
try {
  await new Promise((resolve, reject) => { web.once('error', reject); web.listen(0, '127.0.0.1', resolve); });
  const playgroundUrl = `http://127.0.0.1:${web.address().port}/`;
  app = await startServer({ root, agent: demoAgent, playgroundUrl, config: {
    port: Number(process.env.NUDGETHIS_DEMO_PORT || 7331), origins: [new URL(playgroundUrl).origin], maxConcurrent: 2,
    commands: [`"${process.execPath}" validate.mjs`], validationTimeout: 10000, agentOptions: {}
  } });
  console.log(`\nNudgeThis offline demo (predefined fix; no model calls)\nDashboard: ${app.url}/#token=${app.token}\nPlayground: ${playgroundUrl}#token=${app.token}\nDisposable repository: ${root}\nPress Ctrl+C to stop and remove the demo repository.\n`);
  let stopped = false;
  const stop = async () => { if (stopped) return; stopped = true; await app.close(); await new Promise(resolve => web.close(resolve)); await rm(root, { recursive: true, force: true, maxRetries: 3 }); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
} catch (error) { web.close(); await app?.close(); await rm(root, { recursive: true, force: true }); throw error; }
