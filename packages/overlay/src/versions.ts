import type { Api, SavedVersion, VersionChange, VersionPreview, Versions } from '../../contracts/src/index.js';
import { errorMessage } from '../../contracts/src/index.js';
import { shell } from './workspace.js';

const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') => { const el = document.createElement(tag); el.textContent = text; el.className = className; return el; };
const changeKey = (c: VersionChange) => `${c.id}:${c.attempt}`;
const styles = `.nt-version-notice{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:16px;margin:16px 0;border:1px solid var(--dr-border);border-radius:var(--dr-radius);background:var(--dr-accentSoft);color:var(--dr-text);font:var(--dr-size)/1.5 var(--dr-font-body)}.nt-version-notice[hidden]{display:none}.nt-version-notice button{border:0;border-radius:var(--dr-radius);background:var(--dr-accent);color:var(--dr-onAccent);padding:10px 14px;font:inherit;cursor:pointer}.nt-version-notice button:focus-visible{outline:2px solid var(--dr-accent);outline-offset:3px}.nt-version-notice p{margin:0}.nt-version-notice small{display:block;color:var(--dr-muted)}.nt-version-choice{display:flex!important;align-items:flex-start;gap:12px;margin:0!important;padding:16px 0;border-bottom:1px solid var(--dr-border);cursor:pointer;overflow-wrap:anywhere}.nt-version-choice input{width:20px!important;height:20px;flex:0 0 20px;accent-color:var(--dr-accent);margin-top:3px}.nt-version-choice small,.nt-version-history small{display:block;font-weight:400;color:var(--dr-muted)}.nt-version-history{padding:14px 0;border-bottom:1px solid var(--dr-border);overflow-wrap:anywhere}.nt-version-history summary{cursor:pointer}.nt-version-files{overflow-wrap:anywhere;padding-left:20px}.nt-version-flow{color:var(--dr-accent)!important;font-weight:700}.nt-version-success{padding:16px;border:1px solid var(--dr-success);border-radius:var(--dr-radius);background:var(--dr-successSoft)}.nt-version-success h3{margin:0}.nt-version-diff{max-height:320px}.nt-version-title{overflow-wrap:anywhere}`;

/** The same explicit review/commit flow in the dashboard and embedded overlay. */
export function createSavedVersions(mount: HTMLElement | ShadowRoot, api: Api, onSaved: () => void = () => {}, onPublish?: () => void) {
  const ui = shell(mount, 'Saved versions'), style = node('style', styles), content = node('div'), alert = node('p', '', 'nt-workspace-error');
  alert.setAttribute('role', 'alert'); alert.hidden = true; ui.dialog.append(style, content, alert);
  // Reminder can be outside the dialog, including within an overlay shadow root.
  const reminderStyle = node('style', styles); mount.append(reminderStyle);
  let data: Versions | undefined, preview: VersionPreview | undefined, busy = false, destroyed = false, step: 'choose' | 'review' | 'saved' = 'choose';
  let loading: Promise<void> | undefined, refreshAgain = false, reminder: HTMLElement | undefined;
  const chosen = new Set<string>();
  const error = (message: string) => { alert.textContent = message; alert.hidden = !message; if (message) alert.scrollIntoView({ block: 'nearest' }); };
  const button = (title: string, action: () => void, primary = false) => { const el = node('button', title, primary ? 'primary' : ''); el.type = 'button'; el.onclick = action; return el; };
  const controls = (value: boolean) => { busy = value; ui.close.disabled = value; content.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button,input').forEach(el => { el.disabled = value; }); ui.dialog.setAttribute('aria-busy', String(value)); };
  const updateReminder = () => {
    if (!reminder || !data) return;
    const count = data.pending.length, interrupted = data.history.some(v => v.status === 'saving');
    reminder.hidden = !count && !interrupted; reminder.replaceChildren();
    const text = node('p', interrupted ? 'A version save needs attention.' : `${count} applied change${count === 1 ? '' : 's'} ready to save.`);
    text.append(node('small', interrupted ? 'Open Saved versions to inspect the interrupted save.' : 'Keep a checkpoint of the changes you approve.'));
    reminder.append(text, button(interrupted ? 'View saved versions' : 'Review & save', () => { void open(); }, true));
  };
  const history = () => {
    if (!data?.history.length) return;
    content.append(node('h3', 'Version history'), node('p', 'Versions created here stay in Git. Publishing to GitHub is a separate step in your Git client.'));
    for (const version of data.history) {
      const entry = node('details', '', 'nt-version-history');
      entry.append(node('summary', `${version.message} · ${version.status === 'saved' ? 'Saved locally' : version.status === 'saving' ? 'Needs attention' : 'Not saved'}`));
      entry.append(node('small', `${new Date(version.at).toLocaleString()} · ${version.branch} · ${version.commit.slice(0, 10)}`));
      if (version.error) entry.append(node('p', version.error, 'nt-workspace-error'));
      entry.append(node('p', `${version.identity.name} <${version.identity.email}>`));
      const changes = node('ul', '', 'nt-version-files');
      version.changes.forEach(c => changes.append(node('li', `${c.request} (${c.id}, revision ${c.attempt})`))); entry.append(changes);
      content.append(entry);
    }
  };
  const renderChoose = () => {
    if (!data) return;
    content.replaceChildren(node('p', '1. Choose changes  →  2. Review  →  3. Save', 'nt-version-flow'), node('p', 'A version is a checkpoint of your approved changes. Git calls it a commit. Saving stays on this computer.'));
    content.append(node('p', `Current branch: ${data.repository.branch}`));
    const pending = data.pending;
    if (!pending.length) content.append(node('h3', 'No applied changes waiting to be saved'));
    else {
      content.append(node('h3', 'What belongs in this version?'));
      for (const change of pending) {
        const label = node('label', '', 'nt-version-choice'), input = node('input'), copy = node('span', change.request);
        input.type = 'checkbox'; input.checked = chosen.has(changeKey(change));
        input.onchange = () => { if (input.checked) chosen.add(changeKey(change)); else chosen.delete(changeKey(change)); };
        copy.append(node('small', `${change.id} · revision ${change.attempt} · ${change.files.length} file${change.files.length === 1 ? '' : 's'} · ${change.validationStatus === 'passed' ? 'Checks passed' : 'Checks not passed or not run'}`));
        label.append(input, copy); content.append(label);
      }
      const actions = node('div', '', 'nt-workspace-actions');
      actions.append(button('Select all', () => { pending.forEach(c => chosen.add(changeKey(c))); renderChoose(); }), button('Review selected changes', () => { void reviewSelected(); }, true)); content.append(actions);
    }
    content.append(node('p', 'Only corrections applied through NudgeThis appear here. Other edits remain in your workspace.', 'nt-workspace-note'));
    content.append(button('Refresh list', () => { void refresh(); })); history();
    if (busy) controls(true);
  };
  const refresh = (): Promise<void> => {
    if (destroyed) return Promise.resolve();
    if (loading) { refreshAgain = true; return loading; }
    loading = (async () => {
      try { const result = await api<Versions>('/api/versions'); if (destroyed) return; data = result; updateReminder(); if (ui.dialog.open && step === 'choose' && !busy) renderChoose(); }
      catch (e) { if (ui.dialog.open && !destroyed) error(errorMessage(e)); }
      finally { loading = undefined; if (refreshAgain && !destroyed) { refreshAgain = false; void refresh(); } }
    })(); return loading;
  };
  const renderPreview = () => {
    if (!preview) return;
    const plan = preview;
    content.replaceChildren(node('p', '2. Review your version', 'nt-version-flow'), node('h3', `${plan.changes.length} change${plan.changes.length === 1 ? '' : 's'} · ${plan.files.length} file${plan.files.length === 1 ? '' : 's'}`, 'nt-version-title'));
    const changes = node('ul', '', 'nt-version-files'); plan.changes.forEach(c => changes.append(node('li', c.request))); content.append(changes);
    const details = node('details'); details.append(node('summary', 'View files and technical diff'));
    const files = node('ul', '', 'nt-version-files'); plan.files.forEach(f => files.append(node('li', f))); details.append(files, node('pre', plan.diff, 'nt-version-diff')); content.append(details);
    if (plan.changes.some(c => c.validationStatus !== 'passed')) content.append(node('p', 'Some changes have no passing checks. Saving records your approval; it does not run validation.', 'nt-workspace-note'));
    const form = node('form');
    const field = (label: string, value: string, limit: number, type = 'text') => { const container = node('label', label), input = node('input'); input.type = type; input.value = value; input.required = true; input.maxLength = limit; container.append(input); form.append(container); return input; };
    const title = field('Version name', plan.suggestedMessage, 240);
    const name = field('Author name', plan.identity.name || data?.history.find(v => v.status === 'saved')?.identity.name || '', 160);
    const email = field('Author email', plan.identity.email || data?.history.find(v => v.status === 'saved')?.identity.email || '', 254, 'email');
    form.append(node('p', 'This name and email are recorded in Git and become visible if you publish. You can use your GitHub private email. Your Git settings are not changed.'));
    form.append(node('p', `Save on ${plan.repository.branch}. This creates one local commit. It does not publish to GitHub.`, 'nt-workspace-note'));
    const actions = node('div', '', 'nt-workspace-actions'), save = node('button', 'Save version', 'primary'); save.type = 'submit';
    actions.append(button('Back to changes', () => { step = 'choose'; preview = undefined; error(''); renderChoose(); void refresh(); }), save); form.append(actions);
    form.onsubmit = async e => {
      e.preventDefault(); if (busy) return; error(''); controls(true); save.textContent = 'Saving version…';
      try {
        const version = await api<SavedVersion>('/api/versions/save', { method: 'POST', body: JSON.stringify({ previewId: plan.id, message: title.value.trim(), identity: { name: name.value.trim(), email: email.value.trim() } }), signal: AbortSignal.timeout(150000) });
        if (destroyed) return; step = 'saved'; chosen.clear(); controls(false);
        content.replaceChildren(); const success = node('section', '', 'nt-version-success'); success.setAttribute('role', 'status');
        success.append(node('h3', 'Version saved on your computer.'), node('p', version.message), node('p', `Commit ${version.commit.slice(0, 10)} · ${version.branch}`)); content.append(success, node('p', 'Your approved changes now have a checkpoint in Git. Publish from your Git client when you want to share them on GitHub.'));
        if (onPublish) content.append(button('Publish to GitHub', () => { ui.dialog.close(); onPublish(); }, true));
        content.append(button('View history', () => { step = 'choose'; renderChoose(); void refresh(); }));
        onSaved(); await refresh();
      } catch (e) { if (!destroyed) error(`${errorMessage(e)}. If the connection was interrupted, retry this save or refresh the list to check its status.`); }
      finally { if (!destroyed) { controls(false); save.textContent = 'Save version'; } }
    };
    content.append(form); title.focus();
  };
  const reviewSelected = async () => {
    if (busy || !data) return;
    const selected = data.pending.filter(c => chosen.has(changeKey(c)));
    if (!selected.length) { error('Choose at least one change to review.'); return; }
    error(''); controls(true);
    try { preview = await api<VersionPreview>('/api/versions/preview', { method: 'POST', body: JSON.stringify({ changes: selected.map(c => ({ id: c.id, attempt: c.attempt })) }), signal: AbortSignal.timeout(150000) }); if (!destroyed) { step = 'review'; renderPreview(); } }
    catch (e) { if (!destroyed) error(errorMessage(e)); }
    finally { if (!destroyed) controls(false); }
  };
  const open = async () => {
    if (busy) return;
    step = 'choose'; preview = undefined; error(''); if (!ui.dialog.open) ui.dialog.showModal();
    content.replaceChildren(node('p', 'Reading applied changes and saved versions…')); controls(true);
    await refresh(); if (destroyed) return;
    chosen.clear(); data?.pending.forEach(c => chosen.add(changeKey(c))); controls(false); renderChoose();
  };
  ui.dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
  const focus = () => { void refresh(); }; window.addEventListener('focus', focus);
  return { open, refresh, attachReminder(target: HTMLElement) { reminder = node('aside', '', 'nt-version-notice'); reminder.setAttribute('aria-label', 'Changes ready to save'); reminder.hidden = true; target.append(reminder); updateReminder(); }, destroy() { destroyed = true; window.removeEventListener('focus', focus); reminder?.remove(); reminderStyle.remove(); ui.destroy(); } };
}
