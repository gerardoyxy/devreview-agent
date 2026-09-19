// Test driver only: production invokes this Rust library directly, without Node.
import { spawn } from 'node:child_process';
import { binary } from './helpers.js';
export class NativeAgent {
 constructor(options){this.options=options;}
 async run({cwd,task,signal,onMessage=()=>{}}){
  return new Promise((resolve,reject)=>{
   const child=spawn(binary,['agent-run'],{stdio:['pipe','pipe','pipe']});let buffer='',error='',result={},failure;
   child.stdout.setEncoding('utf8');child.stdout.on('data',data=>{buffer+=data;let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{const event=JSON.parse(line);if(event.type==='message')onMessage(event.text);if(event.type==='error')failure=event.message;if(event.type==='result')result=event;}catch(e){failure=e.message;}}});
   child.stderr.on('data',b=>error+=b);const abort=()=>child.kill('SIGTERM');signal?.addEventListener('abort',abort,{once:true});child.on('error',reject);child.on('close',code=>{signal?.removeEventListener('abort',abort);if(signal?.aborted)reject(new Error('Cancelled'));else if(code||failure)reject(new Error(failure||error||`Runtime exited ${code}`));else resolve(result);});
   child.stdin.end(JSON.stringify({protocolVersion:1,transport:this.options.transport,command:this.options.command,args:this.options.args,cwd,task,timeoutMs:this.options.timeout||5000}));
  });
 }
}
