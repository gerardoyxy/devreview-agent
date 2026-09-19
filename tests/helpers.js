import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const binary=fileURLToPath(new URL(`../target/debug/devreview${process.platform==='win32'?'.exe':''}`,import.meta.url));
export const peer=fileURLToPath(new URL('./fixtures/native-agent.mjs',import.meta.url));
export function command(exe,args,options={}) { return new Promise((resolve,reject)=>{ const child=spawn(exe,args,{...options,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));child.stdin.end(options.input); }); }
export async function git(root,...args){const r=await command('git',['-c','user.name=DevReview Test','-c','user.email=test@example.invalid','-c','commit.gpgsign=false',...args],{cwd:root});if(r.code)throw new Error(r.stderr);return r.stdout.trim();}
export async function fixture(t) { const root=await mkdtemp(path.join(tmpdir(),'devreview-test-'));t.cleanups=[];t.after(async()=>{for(const cleanup of t.cleanups.reverse())await cleanup();await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});});await git(root,'init','-b','main');await writeFile(path.join(root,'.gitignore'),'.devreview/\n');await writeFile(path.join(root,'button.css'),'.button { color: red; }\n');await writeFile(path.join(root,'other.txt'),'unchanged\n');await git(root,'add','.');await git(root,'commit','-m','Fixture');return root; }
export const input={request:'Make the button green',context:{url:'http://localhost:3000/settings',route:'/settings',tagName:'button',selector:'.button',viewport:{width:1440,height:900}}};
export async function until(check,timeout=12000){const start=Date.now();while(Date.now()-start<timeout){const result=await check();if(result)return result;await new Promise(r=>setTimeout(r,25));}throw new Error('Condition timed out');}
export async function configure(root,{agents=[{id:'fixture',mode:'workflow',flavor:'edit'}],commands=[],workers=2,validationTimeout=5000}={}) {
 const lines=[`defaultAgent = ${JSON.stringify(agents[0].id)}`,'[server]','port = 0','allowedOrigins = ["http://localhost:3000"]','[workers]',`maxConcurrent = ${workers}`,'[validation]',`timeout = ${validationTimeout}`,`commands = ${JSON.stringify(commands)}`];
 for(const a of agents)lines.push('[[agents]]',`id = ${JSON.stringify(a.id)}`,`transport = ${JSON.stringify(a.transport||'stdio')}`,`command = ${JSON.stringify(process.execPath)}`,`args = ${JSON.stringify([peer,a.mode||'workflow',a.flavor||'edit'])}`,`timeout = ${a.timeout||5000}`);
 await writeFile(path.join(root,'devreview.toml'),lines.join('\n')+'\n');await git(root,'add','devreview.toml');await git(root,'commit','-m','Configure test');
}
export async function start(t,root,options) {
 if(options!==false)await configure(root,options);
 const child=spawn(binary,['--root',root,'start'],{stdio:['ignore','pipe','pipe']});let output='',errors='';let exit;
 const closed=new Promise(resolve=>child.once('close',code=>{exit=code;resolve(code);}));child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>errors+=b);
 let match;try{match=await until(()=>{if(exit!==undefined)throw new Error(errors||`Server exited ${exit}`);return /Dashboard: (http:\/\/127\.0\.0\.1:\d+)\/#token=([a-f0-9]+)/.exec(output);});}catch(e){child.kill();await closed;throw e;}
 const [url,token]=match.slice(1);let stopped=false;
 const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
 const raw=(endpoint,body,extra={})=>fetch(url+endpoint,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),...extra});
 const api=async(endpoint,body,extra)=>{const response=await raw(endpoint,body,extra);const value=await response.json();if(!response.ok)throw Object.assign(new Error(value.error),{status:response.status});return value;};
 const stop=async()=>{if(stopped)return;stopped=true;await raw('/api/shutdown',{}).catch(()=>child.kill());await Promise.race([closed,new Promise((_,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error('Rust server did not shut down'));},10000);timer.unref();})]);};t.cleanups.push(stop);
 return {root,url,token,headers,raw,api,stop,child,closed,get errors(){return errors;},worktree:id=>path.join(root,'.devreview','worktrees',id)};
}
export const finished=(app,id)=>until(async()=>{const task=await app.api(`/api/tasks/${id}`);return ['ready','awaiting_feedback','failed','cancelled'].includes(task.status)?task:false;});
export const action=(app,id,action,body={})=>app.api(`/api/tasks/${id}/${action}`,body);
