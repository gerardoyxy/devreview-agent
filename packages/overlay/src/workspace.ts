import { createContextPicker, contextStyles } from './project-context.js';
import { renderElementContext } from './context.js';
import type { Api, Diagnostics, ServerStatus, Task, TaskKind, ElementContext } from '../../contracts/src/index.js';
import { errorMessage, query } from '../../contracts/src/index.js';

const styles = `${contextStyles}
.nt-workspace-dialog{box-sizing:border-box;width:min(720px,calc(100vw - 24px));max-height:calc(100dvh - 32px);padding:26px;border:1px solid var(--dr-border);border-radius:var(--dr-radius);background:var(--dr-surface);color:var(--dr-text);font:var(--dr-size)/1.6 var(--dr-font-body);pointer-events:auto;overflow:auto}.nt-workspace-dialog *{box-sizing:border-box}.nt-workspace-dialog::backdrop{background:color-mix(in srgb,var(--dr-backdrop) 65%,transparent)}.nt-workspace-dialog [hidden]{display:none!important}.nt-workspace-dialog h2{margin:0;font:700 26px/1.15 var(--dr-font-heading);letter-spacing:-.025em}.nt-workspace-dialog h3{font:700 16px/1.4 var(--dr-font-heading);margin:24px 0 10px}.nt-workspace-dialog p{margin:12px 0;color:var(--dr-muted)}.nt-workspace-dialog header,.nt-workspace-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.nt-workspace-actions{justify-content:flex-end;margin-top:22px}.nt-workspace-dialog label{display:block;margin:18px 0 7px;font-weight:700}.nt-workspace-dialog :is(input,textarea,select){display:block;width:100%;font:inherit;background:var(--dr-page);color:var(--dr-text);border:1px solid var(--dr-border);border-radius:var(--dr-radius);padding:10px;caret-color:var(--dr-accent)}.nt-workspace-dialog textarea{resize:vertical;min-height:100px}.nt-workspace-dialog button{cursor:pointer;font:inherit;border:1px solid var(--dr-border);border-radius:var(--dr-radius);padding:8px 12px;background:var(--dr-surface);color:var(--dr-text);touch-action:manipulation}.nt-workspace-dialog button.primary{background:var(--dr-accent);border-color:var(--dr-accent);color:var(--dr-onAccent)}.nt-workspace-dialog button:disabled{opacity:.5;cursor:default}.nt-workspace-dialog :is(button,input,textarea,select,summary):focus-visible{outline:2px solid var(--dr-accent);outline-offset:3px}.nt-workspace-dialog button:hover{filter:brightness(.97)}.nt-workspace-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.nt-workspace-dialog pre{background:var(--dr-page);border:1px solid var(--dr-border);padding:12px;border-radius:var(--dr-radius);overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.7 var(--dr-font-mono)}.nt-workspace-error{color:var(--dr-danger)!important;overflow-wrap:anywhere}.nt-workspace-note{border:1px solid var(--dr-border);padding:12px;border-radius:var(--dr-radius);font-size:13px}.nt-workspace-row{padding:12px 0;border-bottom:1px solid var(--dr-border);display:flex;justify-content:space-between;gap:16px;overflow-wrap:anywhere}.nt-workspace-dialog ::selection{background:var(--dr-accentSoft);color:var(--dr-text)}@media(max-width:600px){.nt-workspace-dialog{padding:18px}.nt-workspace-grid{grid-template-columns:1fr;gap:0}.nt-workspace-dialog :is(input,textarea,select){font-size:max(16px,var(--dr-size))}}
`;
const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const node = document.createElement(tag); node.textContent = text; return node; };
export function shell(mount: HTMLElement | ShadowRoot, title: string) {
  const style = element('style', styles), dialog = element('dialog'); dialog.className = 'nt-workspace-dialog'; dialog.setAttribute('aria-label', title);
  const header = element('header'), heading = element('h2', title), close = element('button', 'Close'); close.type = 'button'; close.onclick = () => dialog.close(); header.append(heading, close); dialog.append(header); mount.append(style, dialog);
  return { dialog, heading, close, destroy: () => { dialog.remove(); style.remove(); } };
}
export function createTaskComposer(mount: HTMLElement | ShadowRoot, api: Api, onSaved: (task: Task) => void) {
  const ui = shell(mount, 'New change'), form = element('form');
  form.innerHTML = `<p>Describe a change to your interface, backend, tests or documentation. Selecting a page element is optional.</p><div class="nt-workspace-grid"><div><label for="nt-kind">Change type</label><select id="nt-kind"><option value="general">General</option><option value="frontend">Frontend</option><option value="backend">Backend</option><option value="tests">Tests</option><option value="documentation">Documentation</option></select></div><div><label for="nt-provider">Coding agent</label><select id="nt-provider" required></select></div></div><label for="nt-request">What needs to change?</label><textarea id="nt-request" required maxlength="8000" rows="5" placeholder="Describe the result you want and any constraints…"></textarea><label for="nt-files">File references (optional)</label><textarea id="nt-files" rows="2" placeholder="src/api/users.ts&#10;tests/users.test.ts" aria-describedby="nt-files-hint"></textarea><p id="nt-files-hint">One repository-relative path per line, up to 32. References guide the request; they are not an edit allowlist.</p><div class="nt-context"></div><p class="nt-mode nt-workspace-note"></p><p class="nt-workspace-error" role="alert" hidden></p><div class="nt-workspace-actions"><button type="submit" name="intent" value="draft">Save draft</button><button class="primary" type="submit" name="intent" value="start">Start change</button></div>`;
  const selectedContext = element('div'); selectedContext.className = 'nt-selected-context'; form.prepend(selectedContext);
  ui.dialog.append(form);
  const $ = <E extends HTMLElement = HTMLElement>(selector: string) => query<E>(form, selector);
  const picker = createContextPicker($('.nt-context'), api);
  let seedContext: ElementContext | undefined;
  let editing: Task | undefined, busy = false, enabled = false;
  const showError = (value: string) => { $('.nt-workspace-error').textContent = value; $('.nt-workspace-error').hidden = !value; };
  const controls = () => { form.querySelectorAll<HTMLButtonElement>('button[type=submit]').forEach(b => { b.disabled = busy || (b.value === 'start' && (!enabled || !!editing)); }); ui.close.disabled = busy; };
  form.onsubmit = async event => {
    event.preventDefault(); if (busy) return;
    const draft = (event as SubmitEvent).submitter?.getAttribute('value') !== 'start';
    if (!draft && !enabled) return;
    const references = $<HTMLTextAreaElement>('#nt-files').value.split('\n').map(s => s.trim()).filter(Boolean);
    if (references.length > 32) { showError('Use up to 32 file references.'); return; }
    const payload = { request: $<HTMLTextAreaElement>('#nt-request').value, kind: $<HTMLSelectElement>('#nt-kind').value as TaskKind, agent: $<HTMLSelectElement>('#nt-provider').value, references, contextIds: picker.value(), draft, ...(editing ? { attempt: editing.attempt, context: editing.context } : seedContext ? { context: seedContext } : {}) };
    busy = true; controls(); showError('');
    try {
      const task = await api<Task>(editing ? `/api/tasks/${editing.id}/draft` : '/api/tasks', { method: 'POST', body: JSON.stringify(payload) });
      form.reset(); ui.dialog.close(); onSaved(task);
    } catch (error) { showError(errorMessage(error)); }
    finally { busy = false; controls(); }
  };
  ui.dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  return { async open(task?: Task, seed?: { request: string; context?: ElementContext; contextIds?: string[] }) {
    if (seed || (!task && editing)) form.reset(); seedContext = seed?.context;
    if (seed) { $<HTMLTextAreaElement>('#nt-request').value = seed.request; $<HTMLSelectElement>('#nt-kind').value = 'frontend'; }
    editing = task; ui.heading.textContent = task ? 'Edit draft' : 'New change'; showError('');
    selectedContext.replaceChildren(); renderElementContext(selectedContext, task?.context || seedContext);
    if (task) { $<HTMLTextAreaElement>('#nt-request').value = task.request; $<HTMLTextAreaElement>('#nt-files').value = (task.references || []).join('\n'); $<HTMLSelectElement>('#nt-kind').value = task.kind || 'general'; }
    if (!ui.dialog.open) ui.dialog.showModal();
    busy = true; controls();
    try {
      const status = await api<ServerStatus>('/api/status'); enabled = status.executionEnabled !== false;
      const select = $<HTMLSelectElement>('#nt-provider'); select.replaceChildren(...(status.agents || []).map(a => { const option = element('option', a.label); option.value = a.id; return option; })); select.value = task?.agent || status.agent;
      $('.nt-mode').textContent = status.workspace && !status.workspace.ready ? 'Set up local version history in Branch & publish before starting changes. You can save drafts and project context now.' : enabled ? 'Save a draft without running anything, or start a change with the selected agent. You review files before applying.' : 'Execution is disabled. Drafts, project context and review remain available. No agent or setup command will run.';
      await picker.load(task ? task.projectContext ?? null : undefined, seed?.contextIds); $<HTMLTextAreaElement>('#nt-request').focus();
    } catch (error) { enabled = false; showError(errorMessage(error)); }
    finally { busy = false; controls(); }
  }, destroy: ui.destroy };
}
export function createDiagnostics(mount: HTMLElement | ShadowRoot, api: Api) {
  const ui = shell(mount, 'Workspace setup'), content = element('div'); ui.dialog.append(content);
  const commands = (title: string, lines: string[]) => { content.append(element('h3', title), element('pre', lines.length ? lines.join('\n') : 'None configured')); };
  const row = (title: string, value: string) => { const entry = element('div'); entry.className = 'nt-workspace-row'; entry.append(element('strong', title), element('span', value)); content.append(entry); };
  const open = async () => {
    if (!ui.dialog.open) ui.dialog.showModal(); content.replaceChildren(element('p', 'Reading project configuration…'));
    try {
      const report = await api<Diagnostics>('/api/diagnostics'); content.replaceChildren(element('p', report.note));
      row('Project', [...report.project.frameworks, ...report.project.backends].join(' · ') || 'No framework detected');
      row('Git', report.gitAvailable ? 'Available' : 'Not found');
      row('Package manager', report.project.packageManager ? `${report.project.packageManager} · ${report.project.packageManagerAvailable ? 'available' : 'not found in server PATH'}` : 'Not detected');
      row('Configuration', report.configurationExists ? 'nudgethis.toml found' : 'Run nudgethis init');
      row('Execution', report.executionEnabled ? 'Enabled' : 'Disabled');
      row('Device browser', report.deviceBrowser.available ? `${report.deviceBrowser.browser} found · launch not checked` : 'Not found · embedded layout available');
      for (const agent of report.agents) row(agent.id, `${agent.executableAvailable ? 'Executable found' : 'Executable not found'} · sign-in not checked`);
      for (const warning of report.project.warnings) { const p = element('p', warning); p.className = 'nt-workspace-note'; content.append(p); }
      if (!report.validationConfigured) { const p = element('p', 'No automated validation is configured. A ready patch will be clearly marked as unchecked.'); p.className = 'nt-workspace-note'; content.append(p); }
      commands('Prepare each new workspace', report.setupCommands); commands('Validate changes', report.validationCommands); commands('Allowed browser origins', report.allowedOrigins);
      const details = element('details'); details.append(element('summary', 'Suggested commands for this project'), element('pre', JSON.stringify({ setup: report.project.suggestedSetup, validation: report.project.suggestedValidation }, null, 2))); content.append(details);
      content.append(element('p', 'Review nudgethis.toml to change commands or origins, then restart the server. The configuration belongs to your repository.'));
    } catch (error) { const p = element('p', errorMessage(error)); p.className = 'nt-workspace-error'; p.setAttribute('role', 'alert'); const retry = element('button', 'Try again'); retry.onclick = () => { void open(); }; content.replaceChildren(p, retry); }
  };
  return { open, destroy: ui.destroy };
}
