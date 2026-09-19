import type { Api, Task, Revision } from '../../contracts/src/index.js';
import { errorMessage, query } from '../../contracts/src/index.js';

const styles = `
.dr-review{font:13px/1.6 ui-sans-serif,system-ui,sans-serif;color:#283528;background:#fff;display:flex;flex-direction:column;height:100%;min-height:0;min-width:0;text-align:left}
.dr-review *{box-sizing:border-box}.dr-review button,.dr-review textarea{font:inherit}.dr-review button{cursor:pointer}.dr-review button:disabled{opacity:.5;cursor:default}.dr-review button:focus-visible,.dr-review textarea:focus-visible{outline:2px solid #6a9646;outline-offset:3px}.dr-review [hidden]{display:none!important}
.dr-heading{padding:22px 25px 16px}.dr-eyebrow{font-size:10px;letter-spacing:1.4px;color:#7d8e72;text-transform:uppercase}.dr-title{font-size:18px;line-height:1.45;font-weight:600;margin:9px 0;overflow-wrap:anywhere}.dr-meta{color:#88967d;font:10px/1.7 ui-monospace,monospace;overflow-wrap:anywhere}.dr-tabs{display:flex;gap:22px;border-bottom:1px solid #e3e9db;padding:0 25px}.dr-tab{padding:11px 0;background:none;border:0;border-bottom:2px solid transparent;color:#86947b;font-size:11px!important}.dr-tab[aria-selected=true]{border-bottom-color:#73944e;color:#3e5a2d;font-weight:650}
.dr-content{flex:1;min-height:0;overflow:auto}.dr-chat{height:100%;min-height:260px;display:flex;flex-direction:column}.dr-messages{flex:1;overflow:auto;padding:23px 25px;min-height:80px;display:flex;flex-direction:column;gap:18px}.dr-message{max-width:94%;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}.dr-message.user{align-self:flex-end;background:#f0f5e8;border:1px solid #e0e9d3;border-radius:12px 12px 3px 12px;padding:12px 15px}.dr-message.assistant{align-self:flex-start;padding:0 3px}.dr-message-label{display:block;white-space:normal;color:#889c75;font-size:9px;letter-spacing:.5px;margin-bottom:6px}.dr-wait{color:#819375;font-size:11px;margin:0;padding:0 26px 10px}.dr-composer{border-top:1px solid #e7ecdf;padding:15px 25px}.dr-composer label{font-size:10px;color:#80916e;display:block;margin-bottom:6px}.dr-composer textarea{display:block;width:100%;min-height:70px;max-height:160px;resize:vertical;border:1px solid #dbe3d1;border-radius:8px;padding:10px 12px;background:#fbfcf9;color:#33472b;line-height:1.6;font-size:12px}.dr-composer-bottom{display:flex;justify-content:space-between;gap:15px;align-items:center;margin-top:9px}.dr-hint{font-size:9px;color:#8f9d83;margin:0;max-width:350px}.dr-primary{background:#d1efa4;color:#324b24;border:1px solid #c1df95;border-radius:6px;padding:9px 13px;font-size:11px!important;font-weight:600;white-space:nowrap}.dr-secondary{border:1px solid #dfe6d7;background:#fff;color:#748766;padding:8px 11px;border-radius:6px;font-size:11px!important}.dr-error{margin:10px 25px 0;padding:10px 13px;border:1px solid #ead7bf;background:#faf0e5;border-radius:6px;color:#986c37;font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere}
.dr-changes,.dr-history{padding:20px 25px}.dr-review h3{font-size:12px;font-weight:600;margin:18px 0 10px}.dr-review h3:first-child{margin-top:0}.dr-files{font:11px/1.8 ui-monospace,monospace;color:#66804e;overflow-wrap:anywhere}.dr-check{font-size:11px;padding:8px 0;border-bottom:1px solid #e9eee4}.dr-check summary,.dr-history details summary{cursor:pointer}.dr-review pre{font:11px/1.7 ui-monospace,Consolas,monospace;background:#f6f8f2;border:1px solid #e2e9d8;padding:12px;border-radius:7px;overflow:auto;max-height:380px;white-space:pre;tab-size:2}.dr-diff-line{display:block;min-height:1.7em}.dr-add{background:#e2f0d5;color:#497634}.dr-remove{background:#f5e0d8;color:#a16b5a}.dr-context{color:#849d6b}.dr-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;padding:14px 25px;border-top:1px solid #e3e9db;background:#fbfcf8}.dr-revision{display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid #e9eee4;gap:10px;font-size:11px}.dr-revision small{display:block;color:#8b9a7e}.dr-timeline{border-left:1px solid #dbe5d0;margin:22px 0 0 5px;padding-left:17px}.dr-event{position:relative;font-size:11px;margin:14px 0;color:#6d825a}.dr-event:before{content:'';position:absolute;left:-21px;top:6px;width:6px;height:6px;border:1px solid white;background:#9cb980;border-radius:50%}.dr-event small{display:block;font-size:9px;color:#98a58d}.dr-empty{padding:28px;color:#8a9a7e;text-align:center}
@media(max-width:600px){.dr-heading{padding:17px}.dr-title{font-size:15px}.dr-tabs{padding:0 17px}.dr-messages{padding:17px}.dr-message{font-size:12px;max-width:100%}.dr-composer{padding:12px 17px}.dr-hint{font-size:9px;max-width:175px}.dr-composer-bottom{align-items:flex-end}.dr-actions{padding:12px 17px}.dr-changes,.dr-history{padding:17px}.dr-error{margin-left:17px;margin-right:17px}}
`;

const labels: Record<string, string> = { pending: 'Queued', analyzing: 'Preparing task', working: 'Agent working', validating: 'Validating changes', ready: 'Ready for review', awaiting_feedback: 'Waiting for your reply', applying: 'Applying changes', applied: 'Applied', failed: 'Needs attention', conflict: 'Conflict', rejected: 'Rejected', cancelled: 'Cancelled', created: 'Task created' };
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
const time = (value: string) => new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Shared conversation/review UI, mounted in the overlay or dashboard's shadow root. */
export function createTaskReview(root: HTMLElement | ShadowRoot, { api, onMutation = () => {} }: { api: Api; onMutation?: (id: string) => void }) {
  const style = node('style'); style.textContent = styles; root.append(style);
  const view = node('section', 'dr-review');
  view.innerHTML = `<div class="dr-heading"><div class="dr-eyebrow"></div><h2 class="dr-title"></h2><div class="dr-meta"></div></div>
    <div class="dr-tabs" role="tablist" aria-label="Task details"><button class="dr-tab" role="tab" data-tab="conversation" aria-selected="true">Conversation</button><button class="dr-tab" role="tab" data-tab="changes" aria-selected="false">Changes</button><button class="dr-tab" role="tab" data-tab="history" aria-selected="false">History</button></div>
    <div class="dr-error" role="alert" hidden></div><div class="dr-content">
    <section class="dr-chat" data-panel="conversation" role="tabpanel" aria-label="Conversation"><div class="dr-messages" role="log" aria-label="Task conversation" aria-live="polite" aria-relevant="additions"></div><p class="dr-wait" role="status"></p>
    <form class="dr-composer"><label>Message to the agent<textarea aria-label="Message to the agent" maxlength="8000" required placeholder="Ask a question or describe the next adjustment…"></textarea></label><div class="dr-composer-bottom"><p class="dr-hint"></p><button class="dr-primary dr-send" type="submit">Send follow-up ↗</button></div></form></section>
    <section class="dr-changes" data-panel="changes" role="tabpanel" aria-label="Changes" hidden><h3>Validation</h3><div class="dr-checks"></div><h3>Changed files</h3><div class="dr-files"></div><h3>Current patch</h3><pre class="dr-diff" tabindex="0"></pre></section>
    <section class="dr-history" data-panel="history" role="tabpanel" aria-label="History" hidden><h3>Change versions</h3><p class="dr-hint">Earlier versions are kept for reference. Apply always uses the current validated version.</p><div class="dr-revisions"></div><div class="dr-past" hidden></div><h3>Activity</h3><div class="dr-timeline"></div></section></div><div class="dr-actions"></div>`;
  root.append(view);
  const $ = <E extends HTMLElement = HTMLElement>(selector: string) => query<E>(view, selector);
  let task: Task, busy = false, tab = 'conversation', selectedRevision: number | undefined, renderedMessages = new Set<number>();
  const drafts = new Map<string, string>();
  const error = (text?: string | null) => { $('.dr-error').textContent = text || ''; $('.dr-error').hidden = !text; };
  const selectTab = (name: string) => {
    tab = name;
    for (const button of view.querySelectorAll<HTMLButtonElement>('[data-tab]')) { button.setAttribute('aria-selected', String(button.dataset.tab === name)); button.tabIndex = button.dataset.tab === name ? 0 : -1; }
    for (const panel of view.querySelectorAll<HTMLElement>('[data-panel]')) panel.hidden = panel.dataset.panel !== name;
  };
  for (const button of view.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
    button.onclick = () => selectTab(button.dataset.tab || 'conversation');
    button.onkeydown = event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault(); const tabs = [...view.querySelectorAll<HTMLButtonElement>('[data-tab]')];
      const next = tabs[(tabs.indexOf(button) + (event.key === 'ArrowRight' ? 1 : 2)) % 3]; selectTab(next.dataset.tab || 'conversation'); next.focus();
    };
  }
  const patch = (container: HTMLElement, value: string) => container.replaceChildren(...(value || 'No file changes in this version.').split('\n').map(line => node('span', `dr-diff-line ${line.startsWith('+') ? 'dr-add' : line.startsWith('-') ? 'dr-remove' : line.startsWith('@@') ? 'dr-context' : ''}`, line)));
  const controls = () => {
    if (!task) return;
    const active = ['pending', 'analyzing', 'working', 'validating', 'applying'].includes(task.status);
    const canSend = ['ready', 'awaiting_feedback', 'failed', 'cancelled', 'applied', 'rejected'].includes(task.status);
    $<HTMLButtonElement>('.dr-send').disabled = busy || !canSend;
    // Keep the draft editable while the agent works.
    $('.dr-hint').textContent = task.status === 'applied' ? 'Commit the applied changes before continuing this conversation.' : task.status === 'conflict' ? 'Retry against HEAD to resolve the conflict before continuing.' : active ? 'You can draft a reply now. Send it when this turn finishes.' : 'Your reply stays in this task. Changes still need your approval.';
    $('.dr-wait').textContent = active ? `${labels[task.status]}… You can close this window and keep reviewing.` : task.status === 'awaiting_feedback' ? 'The agent replied without file changes. You can continue the conversation.' : '';
    $('.dr-wait').hidden = !$('.dr-wait').textContent;
    $('.dr-actions').replaceChildren();
    const action = (name: string, label: string, primary = false) => {
      const attempt = task.attempt;
      const button = node('button', primary ? 'dr-primary' : 'dr-secondary', label); button.disabled = busy;
      button.onclick = async () => {
        const id = task.id;
        if (name === 'apply' && !window.confirm(`Apply ${id} to your working tree? Files will change without a commit.`)) return;
        busy = true; controls(); error('');
        try {
          await api(`/api/tasks/${id}/${name}`, { method: 'POST', body: JSON.stringify({ attempt }) });
          const updated = await api<Task>(`/api/tasks/${id}`); if (task?.id === id) setTask(updated);
          onMutation(id);
        } catch (err) { if (task?.id === id) error(errorMessage(err)); }
        finally { busy = false; controls(); }
      };
      $('.dr-actions').append(button);
    };
    if (['pending', 'analyzing', 'working', 'validating'].includes(task.status)) action('cancel', 'Cancel task');
    if (['ready', 'awaiting_feedback', 'failed', 'conflict'].includes(task.status)) action('reject', 'Reject');
    if (['ready', 'awaiting_feedback', 'failed', 'conflict', 'cancelled', 'rejected'].includes(task.status)) action('retry', 'Retry from HEAD');
    if (task.status === 'ready') action('apply', 'Apply current changes ↗', true);
  };
  function setTask(next: Task) {
    if (task?.id !== next.id) {
      if (task) drafts.set(task.id, $<HTMLTextAreaElement>('textarea').value);
      $<HTMLTextAreaElement>('textarea').value = drafts.get(next.id) || '';
      renderedMessages = new Set(); $('.dr-messages').replaceChildren();
      selectedRevision = undefined; $('.dr-past').hidden = true; selectTab('conversation');
    }
    task = next;
    $('.dr-eyebrow').textContent = `${task.id} · ${labels[task.status] || task.status} · version ${task.attempt}`;
    $('.dr-title').textContent = task.request;
    $('.dr-meta').textContent = `${task.agent} · ${task.context.route} · ${task.context.selector || task.context.tagName}`;
    error(task.error || task.cleanupWarning);
    const log = $('.dr-messages'), stick = log.scrollHeight - log.scrollTop - log.clientHeight < 80 || !renderedMessages.size;
    for (const message of task.messages || []) {
      if (renderedMessages.has(message.id)) continue;
      const item = node('div', `dr-message ${message.role}`);
      item.append(node('span', 'dr-message-label', `${message.role === 'user' ? 'YOU' : 'AGENT'} · ${time(message.at)} · v${message.attempt}`), node('div', '', message.content));
      log.append(item); renderedMessages.add(message.id);
    }
    if (stick) requestAnimationFrame(() => { if (task?.id === next.id) log.scrollTop = log.scrollHeight; });
    $('.dr-checks').replaceChildren();
    if (!task.validation.length) $('.dr-checks').append(node('p', 'dr-hint', task.status === 'ready' ? 'No validation commands configured. Review this patch carefully.' : 'No validation results yet.'));
    for (const check of task.validation) {
      const entry = node('details', 'dr-check'); entry.append(node('summary', '', `${check.passed ? '✓' : '×'} ${check.command} · ${check.durationMs}ms`), node('pre', '', check.output || '(no output)')); $('.dr-checks').append(entry);
    }
    $('.dr-files').replaceChildren(...task.files.map(file => node('div', '', file))); patch($('.dr-diff'), task.diff);
    $('.dr-revisions').replaceChildren();
    for (const revision of task.revisions || []) {
      const row = node('div', 'dr-revision'), description = node('div', '', `Version ${revision.attempt} · ${labels[revision.status] || revision.status}`);
      description.append(node('small', '', `${revision.files.length} files · ${time(revision.updatedAt)}`));
      const button = node('button', 'dr-secondary', `View v${revision.attempt}`);
      button.onclick = async () => {
        const id = task.id; selectedRevision = revision.attempt; button.disabled = true;
        try {
          const old = await api<Revision>(`/api/tasks/${id}/revisions/${revision.attempt}`);
          if (task?.id !== id || selectedRevision !== revision.attempt) return;
          const past = $('.dr-past'); past.hidden = false; past.replaceChildren(node('h3', '', `Version ${old.attempt} · ${labels[old.status] || old.status}`));
          const files = node('div', 'dr-files'); files.textContent = old.files.join(' · '); past.append(files);
          for (const check of old.validation) past.append(node('div', 'dr-check', `${check.passed ? '✓' : '×'} ${check.command}`));
          const code = node('pre'); patch(code, old.diff); past.append(code);
        } catch (err) { if (task?.id === id) error(errorMessage(err)); }
        finally { button.disabled = false; }
      };
      row.append(description, button); $('.dr-revisions').append(row);
    }
    $('.dr-timeline').replaceChildren(...(task.history || []).map(event => {
      const item = node('div', 'dr-event', labels[event.action] || event.action); item.append(node('small', '', time(event.at))); return item;
    }));
    controls(); selectTab(tab);
  }
  $('.dr-composer').onsubmit = async event => {
    event.preventDefault(); if (busy || $<HTMLButtonElement>('.dr-send').disabled || !$<HTMLTextAreaElement>('textarea').value.trim()) return;
    const id = task.id, content = $<HTMLTextAreaElement>('textarea').value, attempt = task.attempt;
    busy = true; controls(); error('');
    try {
      const updated = await api<Task>(`/api/tasks/${id}/messages`, { method: 'POST', body: JSON.stringify({ content, attempt }) });
      if (drafts.get(id) === content) drafts.delete(id);
      if (task?.id === id) { if ($<HTMLTextAreaElement>('textarea').value === content) $<HTMLTextAreaElement>('textarea').value = ''; setTask(updated); }
      onMutation(id);
    } catch (err) { if (task?.id === id) error(errorMessage(err)); }
    finally { busy = false; controls(); }
  };
  return { setTask, error, focusComposer: () => $<HTMLTextAreaElement>('textarea').focus(), destroy: () => { style.remove(); view.remove(); } };
}
