import type { Api } from '../../contracts/src/index.js';
import { errorMessage } from '../../contracts/src/index.js';
import { shell } from './workspace.js';

interface PreviewStatus { state: { status: string; message: string; url?: string }; recipe: { supported: boolean; kind: string; dependenciesReady: boolean; description: string }; nodeAvailable: boolean; npmAvailable: boolean; commandsBlocked: boolean }
interface PreviewReview { id: string; action: string; command: string; script?: string; folder: string; note: string; network: boolean }
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const n = document.createElement(tag); n.textContent = text; return n; };
export function createPreview(mount: HTMLElement | ShadowRoot, api: Api) {
  const ui = shell(mount, 'Project preview'), content = el('div'), error = el('p');
  error.className = 'nt-workspace-error'; error.setAttribute('role', 'alert'); ui.dialog.append(content, error);
  let timer: ReturnType<typeof setTimeout> | undefined, busy = false, review: PreviewReview | undefined;
  const fail = (e: unknown) => { error.textContent = errorMessage(e); };
  const button = (label: string, action: () => Promise<void>, primary = false) => { const b = el('button', label); b.type = 'button'; if (primary) b.className = 'primary'; b.onclick = () => { if (busy) return; busy = true; error.textContent = ''; content.querySelectorAll('button').forEach(n => n.disabled = true); void action().catch(fail).finally(() => { busy = false; content.querySelectorAll('button').forEach(n => n.disabled = false); }); }; return b; };
  async function refresh() {
    clearTimeout(timer); if (!ui.dialog.open || review) return;
    const report = await api<PreviewStatus>('/api/preview'); if (!ui.dialog.open || review) return;
    content.replaceChildren(el('p', report.recipe.description));
    const state = el('p', report.state.message); state.className = 'nt-workspace-note'; state.setAttribute('role', 'status'); state.dataset.previewStatus = report.state.status; content.append(state);
    const actions = el('div'); actions.className = 'nt-workspace-actions';
    if (report.state.url) { const link = el('a', 'Open preview ↗'); link.href = report.state.url; link.target = '_blank'; link.rel = 'noopener'; content.append(link); }
    const running = ['starting', 'running', 'installing'].includes(report.state.status);
    if (running) {
      actions.append(button(report.state.status === 'installing' ? 'Cancel installation' : 'Stop preview', async () => { await api('/api/preview', { method: 'POST', body: JSON.stringify({ action: 'stop' }) }); await refresh(); }));
      if (report.state.status === 'running') actions.append(button('Review restart', () => plan('restart')));
    } else if (report.recipe.supported) {
      const needsTools = report.recipe.kind !== 'website' && (!report.nodeAvailable || !report.npmAvailable);
      if (needsTools) { const p = el('p', 'This starter needs Node.js 22.12 or newer and npm. Install them, restart NudgeThis and reopen this project. '), link = el('a', 'Get Node.js'); link.href = 'https://nodejs.org/en/download'; link.target = '_blank'; link.rel = 'noopener'; p.append(link); content.append(p); }
      else if (report.commandsBlocked && report.recipe.kind !== 'website') content.append(el('p', 'Project commands are disabled in this session.'));
      else actions.append(button(report.recipe.dependenciesReady ? 'Review preview startup' : 'Review dependency installation', () => plan(report.recipe.dependenciesReady ? 'start' : 'install'), true));
    }
    actions.append(button('Refresh', refresh)); content.append(actions, el('p', 'A preview is local to your computer. Publishing your website is a separate step. New projects start with agents disabled; you can explore, save drafts and set up version history first.'));
    if (running) timer = setTimeout(() => { void refresh().catch(fail); }, 1800);
  }
  async function plan(action: string) {
    const value = await api<PreviewReview>('/api/preview/review', { method: 'POST', body: JSON.stringify({ action }) });
    clearTimeout(timer); review = value; content.replaceChildren(el('h3', action === 'install' ? 'Install dependencies in this folder?' : 'Start this project locally?'), el('p', value.note), el('pre', `${value.folder}\n\n${value.command}${value.script ? `\n\nProject dev script: ${value.script}` : ''}`));
    const actions = el('div'); actions.className = 'nt-workspace-actions'; actions.append(button('Back', async () => { review = undefined; await refresh(); }), button(action === 'install' ? 'Install dependencies' : action === 'restart' ? 'Restart preview' : 'Start preview', async () => { await api('/api/preview', { method: 'POST', body: JSON.stringify({ previewId: value.id, confirm: true }) }); review = undefined; await refresh(); }, true)); content.append(actions);
  }
  ui.dialog.addEventListener('close', () => { clearTimeout(timer); review = undefined; });
  return { async open() { review = undefined; error.textContent = ''; if (!ui.dialog.open) ui.dialog.showModal(); content.replaceChildren(el('p', 'Checking your project…')); await refresh().catch(fail); }, destroy() { clearTimeout(timer); ui.destroy(); } };
}
