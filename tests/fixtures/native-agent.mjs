// Deterministic protocol peer, never a real model. Runs on Windows/macOS/Linux.
import { createInterface } from 'node:readline';
import { writeFile, readFile, unlink, symlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const [mode, flavor = 'normal'] = process.argv.slice(2);
const emit = value => console.log(JSON.stringify(value));
if (mode === 'acp') {
  const lines = createInterface({ input: process.stdin });
  for await (const line of lines) {
    const frame = JSON.parse(line);
    const reply = result => emit({ jsonrpc: '2.0', id: frame.id, result });
    if (frame.method === 'initialize') {
      if (Object.keys(frame.params.clientCapabilities).length) throw new Error('Unexpected client capabilities');
      reply({ protocolVersion: flavor === 'bad-version' ? 999 : 1, agentCapabilities: { loadSession: true } });
    } else if (frame.method === 'session/new') {
      await writeFile('acp-cwd.txt', frame.params.cwd); reply({ sessionId: 'test-session' });
    } else if (frame.method === 'session/prompt') {
      await writeFile('acp-prompt.txt', frame.params.prompt[0].text);
      if (flavor === 'permission') {
        emit({ jsonrpc: '2.0', id: 17, method: 'session/request_permission', params: { sessionId: 'test-session', toolCall: { toolCallId: 'write' }, options: [{ optionId: 'allow', kind: 'allow_once' }] } });
        continue;
      }
      if (flavor === 'close-stderr') process.stderr.end();
      const update = (kind, text, id = 'm1') => emit({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: flavor === 'wrong-session' ? 'other' : 'test-session', update: { sessionUpdate: kind, messageId: id, content: { type: 'text', text } } } });
      update('agent_thought_chunk', 'private reasoning');
      update('agent_message_chunk', 'Hello '); update('agent_message_chunk', 'from ACP.');
      reply({ stopReason: 'end_turn' });
      // An ACP peer normally lives beyond a turn. The runtime must stop it.
      setInterval(() => {}, 1000);
    } else if (frame.id === 17) {
      await writeFile('permission-result.json', JSON.stringify(frame.result));
    } else throw new Error(`Unexpected method: ${frame.method}`);
  }
} else {
  let input = ''; for await (const chunk of process.stdin) input += chunk;
  if (mode !== 'workflow') await writeFile('captured.json', JSON.stringify({ input, args: process.argv.slice(3) }));
  if (mode === 'workflow') {
    const envelope = JSON.parse(input), task = envelope.task;
    if (flavor === 'context') emit({type:'message',text:JSON.stringify({context:task.projectContext,prompt:envelope.prompt})});
    if (flavor === 'question' && task.attempt === 1) { emit({type:'message',text:'Which color?'}); }
    else if (flavor === 'wait') { emit({type:'message',text:'Working on it.'}); spawn(process.execPath,['-e',"setTimeout(()=>require('fs').writeFileSync('escaped-child.txt','bad'),1500)"],{stdio:'inherit'}); setInterval(()=>{},1000); }
    else if (flavor === 'secret') await writeFile('.env','SECRET=fixture');
    else if (flavor === 'symlink') await symlink('/tmp','escape');
    else if (flavor === 'binary') { await writeFile('asset.bin',Buffer.from([0,2,255,4,0,6]));await unlink('other.txt'); }
    else {
      if(task.attempt>1 && flavor==='conversation' && !(await readFile('button.css','utf8')).includes('green'))throw new Error('Previous edit was lost');
      await writeFile('button.css',`.button { color: green;${task.attempt>1?' border-radius: 14px;':''} }\n`);
      emit({type:'message',text:task.attempt===1?'I made it green.':'I kept it green and rounded the corners.'});
      if(flavor==='conversation' && task.attempt>1 && !task.messages.some(m=>m.content==='Also round the corners'))throw new Error('Conversation was lost');
    }
  } else if (mode === 'timeout') {
    spawn(process.execPath, ['-e', "setTimeout(()=>require('fs').writeFileSync('escaped-child.txt','bad'),1100)"], { stdio: 'inherit' });
    setInterval(() => {}, 1000);
  } else if (mode === 'flood') {
    process.stdout.write('x'.repeat(2 * 1024 * 1024 + 1));
  } else if (mode === 'stdio') {
    const envelope = JSON.parse(input);
    if (envelope.protocolVersion !== 1) throw new Error('Bad protocol');
    if (flavor === 'edit') await writeFile('button.css', '.button { color: blue; }\n');
    emit({ type: 'message', id: 'one', text: 'Custom agent reply.' });
    emit({ type: 'tool', text: 'Do not show raw tools' });
    if (flavor === 'failure') { emit({ type: 'error', message: 'Custom provider failed' }); }
  } else if (mode === 'codex') {
    const message = { type: 'item.completed', item: { id: 'one', type: 'agent_message', text: 'Codex protocol reply.' } };
    const serialized = JSON.stringify(message);
    process.stdout.write(serialized.slice(0, 24));
    await new Promise(resolve => setTimeout(resolve, 20));
    process.stdout.write(serialized.slice(24) + '\n');
    emit(message);
    emit({ type: 'item.completed', item: { type: 'reasoning', text: 'private' } });
    if (flavor === 'failure') emit({ type: 'turn.failed', error: { message: 'Codex provider failed' } });
  }
}
