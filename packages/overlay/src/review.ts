import type { Api, Task, Revision } from '../../contracts/src/index.js';
import { errorMessage, query } from '../../contracts/src/index.js';

const styles = `
.dr-review{font:calc(var(--dr-size) * 0.929)/1.6 var(--dr-font-body);color:var(--dr-text);background:var(--dr-surface);display:flex;flex-direction:column;height:100%;min-height:0;min-width:0;text-align:left}
.dr-review *{box-sizing:border-box}.dr-review button,.dr-review textarea{font:inherit}.dr-review button{cursor:pointer}.dr-review button:disabled{opacity:.5;cursor:default}.dr-review button:focus-visible,.dr-review textarea:focus-visible{outline:2px solid var(--dr-border);outline-offset:3px}.dr-review [hidden]{display:none!important}
.dr-heading{padding:22px 25px 16px}.dr-eyebrow{font-size:calc(var(--dr-size) * 0.857);letter-spacing:1.4px;color:var(--dr-muted);text-transform:uppercase}.dr-title{font-size:calc(var(--dr-size) * 1.286);line-height:1.45;font-weight:600;margin:9px 0;overflow-wrap:anywhere}.dr-meta{color:var(--dr-muted);font:calc(var(--dr-size) * 0.857)/1.7 var(--dr-font-mono);overflow-wrap:anywhere}.dr-tabs{display:flex;gap:22px;border-bottom:1px solid var(--dr-border);padding:0 25px}.dr-tab{padding:11px 0;background:none;border:0;border-bottom:2px solid transparent;color:var(--dr-muted);font-size:calc(var(--dr-size) * .86)!important}.dr-tab[aria-selected=true]{border-bottom-color:var(--dr-border);color:var(--dr-text);font-weight:650}
.dr-content{flex:1;min-height:0;overflow:auto}.dr-chat{height:100%;min-height:260px;display:flex;flex-direction:column}.dr-messages{flex:1;overflow:auto;padding:23px 25px;min-height:80px;display:flex;flex-direction:column;gap:18px}.dr-message{max-width:94%;white-space:pre-wrap;overflow-wrap:anywhere;font-size:calc(var(--dr-size) * 0.857)}.dr-message.user{align-self:flex-end;background:var(--dr-surface);border:1px solid var(--dr-border);border-radius:var(--dr-radius);padding:12px 15px}.dr-message.assistant{align-self:flex-start;padding:0 3px}.dr-message-label{display:block;white-space:normal;color:var(--dr-muted);font-size:calc(var(--dr-size) * 0.857);letter-spacing:.5px;margin-bottom:6px}.dr-wait{color:var(--dr-muted);font-size:calc(var(--dr-size) * 0.857);margin:0;padding:0 26px 10px}.dr-composer{border-top:1px solid var(--dr-border);padding:15px 25px}.dr-composer label{font-size:calc(var(--dr-size) * 0.857);color:var(--dr-muted);display:block;margin-bottom:6px}.dr-composer textarea{display:block;width:100%;min-height:70px;max-height:160px;resize:vertical;border:1px solid var(--dr-border);border-radius:var(--dr-radius);padding:10px 12px;background:var(--dr-surface);color:var(--dr-text);line-height:1.6;font-size:calc(var(--dr-size) * 0.857)}.dr-composer-bottom{display:flex;justify-content:space-between;gap:15px;align-items:center;margin-top:9px}.dr-hint{font-size:calc(var(--dr-size) * 0.857);color:var(--dr-muted);margin:0;max-width:350px}.dr-primary{background:var(--dr-elevated);color:var(--dr-text);border:1px solid var(--dr-border);border-radius:var(--dr-radius);padding:9px 13px;font-size:calc(var(--dr-size) * .86)!important;font-weight:600;white-space:nowrap}.dr-secondary{border:1px solid var(--dr-border);background:var(--dr-surface);color:var(--dr-muted);padding:8px 11px;border-radius:var(--dr-radius);font-size:calc(var(--dr-size) * .86)!important}.dr-error{margin:10px 25px 0;padding:10px 13px;border:1px solid var(--dr-border);background:var(--dr-elevated);border-radius:var(--dr-radius);color:var(--dr-muted);font-size:calc(var(--dr-size) * 0.857);white-space:pre-wrap;overflow-wrap:anywhere}
.dr-changes,.dr-history{padding:20px 25px}.dr-review h3{font-size:calc(var(--dr-size) * 0.857);font-weight:600;margin:18px 0 10px}.dr-review h3:first-child{margin-top:0}.dr-files{font:calc(var(--dr-size) * 0.857)/1.8 var(--dr-font-mono);color:var(--dr-muted);overflow-wrap:anywhere}.dr-check{font-size:calc(var(--dr-size) * 0.857);padding:8px 0;border-bottom:1px solid var(--dr-border)}.dr-check summary,.dr-history details summary{cursor:pointer}.dr-review pre{font:calc(var(--dr-size) * 0.857)/1.7 var(--dr-font-mono);background:var(--dr-surface);border:1px solid var(--dr-border);padding:12px;border-radius:var(--dr-radius);overflow:auto;max-height:380px;white-space:pre;tab-size:2}.dr-diff-line{display:block;min-height:1.7em}.dr-add{background:var(--dr-elevated);color:var(--dr-muted)}.dr-remove{background:var(--dr-elevated);color:var(--dr-muted)}.dr-context{color:var(--dr-muted)}.dr-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;padding:14px 25px;border-top:1px solid var(--dr-border);background:var(--dr-surface)}.dr-revision{display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--dr-border);gap:10px;font-size:calc(var(--dr-size) * 0.857)}.dr-revision small{display:block;color:var(--dr-muted)}.dr-timeline{border-left:1px solid var(--dr-border);margin:22px 0 0 5px;padding-left:17px}.dr-event{position:relative;font-size:calc(var(--dr-size) * 0.857);margin:14px 0;color:var(--dr-muted)}.dr-event:before{content:'';position:absolute;left:-21px;top:6px;width:6px;height:6px;border:1px solid var(--dr-border);background:var(--dr-elevated);border-radius:50%}.dr-event small{display:block;font-size:calc(var(--dr-size) * 0.857);color:var(--dr-muted)}.dr-empty{padding:28px;color:var(--dr-muted);text-align:center}
@media(max-width:600px){.dr-heading{padding:17px}.dr-title{font-size:calc(var(--dr-size) * 1.071)}.dr-tabs{padding:0 17px}.dr-messages{padding:17px}.dr-message{font-size:calc(var(--dr-size) * 0.857);max-width:100%}.dr-composer{padding:12px 17px}.dr-hint{font-size:calc(var(--dr-size) * 0.857);max-width:175px}.dr-composer-bottom{align-items:flex-end}.dr-actions{padding:12px 17px}.dr-changes,.dr-history{padding:17px}.dr-error{margin-left:17px;margin-right:17px}}
.dr-title,.dr-review h3{font-family:var(--dr-font-heading)}.dr-primary{background:var(--dr-accent);color:var(--dr-onAccent);border-color:var(--dr-accent)}.dr-add{background:var(--dr-successSoft);color:var(--dr-success)}.dr-remove{background:var(--dr-dangerSoft);color:var(--dr-danger)}.dr-error{background:var(--dr-warningSoft);color:var(--dr-warning)}.dr-tab[aria-selected=true]{color:var(--dr-accent);border-bottom-color:var(--dr-accent)}.dr-message.user{background:var(--dr-accentSoft)}
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
