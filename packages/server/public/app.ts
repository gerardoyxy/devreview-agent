import { createRouteReview } from '../../overlay/src/route-review.js';
import { createTaskComposer, createDiagnostics } from '../../overlay/src/workspace.js';
import { icon } from '../../overlay/src/icons.js';
import { mountBrandLogos } from '../../overlay/src/brand.js';
import { createProjectContext } from '../../overlay/src/project-context.js';
import { createAppearance, themeDefaults } from '../../overlay/src/appearance.js';
import type { Task, TaskSummary, ServerStatus, TaskStatus } from '../../contracts/src/index.js';
import { errorMessage, query } from '../../contracts/src/index.js';
import { watchTasks } from '../../overlay/src/index.js';
import { createTaskReview, taskStatusLabels } from '../../overlay/src/review.js';

mountBrandLogos();
const $ = <E extends HTMLElement = HTMLElement>(selector: string) => query<E>(document, selector);
const params = new URLSearchParams(location.hash.slice(1));
let token = params.get('token') || sessionStorage.getItem('devreview-token') || '';
if (params.has('token')) { sessionStorage.setItem('devreview-token', token); history.replaceState(null, '', location.pathname); }
let executionEnabled = false, visibleLimit = 40;
const activeStatuses = ['pending', 'analyzing', 'preparing', 'working', 'validating', 'applying', 'undoing'];
let tasks: TaskSummary[] = [], filter = 'all', selectedId: string | undefined, connection: AbortController | undefined, refreshing = false, refreshAgain = false;
const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const showError = (message: string) => { $('#notice').textContent = message; $('#notice').hidden = !message; };
async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...options, signal: options.signal || AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`); return data;
}
const defaults = document.createElement('style'); defaults.textContent = themeDefaults; document.head.append(defaults);
const appearance = createAppearance({ api, target: document.documentElement, mount: document.body });
const projectContext = createProjectContext({ api, mount: document.body });
$('#context-button').onclick = () => { void projectContext.open(); };
$('#appearance-button').onclick = () => { void appearance.open(); };
const composer = createTaskComposer(document.body, api, task => { void refresh(); void openTask(task.id); });
const diagnostics = createDiagnostics(document.body, api);
const routes = createRouteReview(document.body, api, seed => { void composer.open(undefined, seed); });
$('#routes-button').onclick = () => { void routes.open(); };
$('#new-task').onclick = () => { void composer.open(); };
$('#setup-button').onclick = () => { void diagnostics.open(); };
const review = createTaskReview($('#task-review').attachShadow({ mode: 'open' }), { api, executionEnabled: () => executionEnabled, onEditDraft: task => { $<HTMLDialogElement>('#detail-dialog').close(); void composer.open(task); }, onMutation: () => void refresh() });
function render() {
  const count = (status: TaskStatus) => tasks.filter(task => task.status === status).length;
  $('#draft-count').textContent = String(count('draft')); $('#all-count').textContent = String(tasks.length); $('#ready-count').textContent = String(count('ready')); $('#applied-count').textContent = String(count('applied'));
  $('#metric-open').textContent = String(tasks.filter(task => activeStatuses.includes(task.status)).length);
  $('#metric-ready').textContent = String(count('ready')); $('#metric-applied').textContent = String(count('applied'));
  const query = $<HTMLInputElement>('#search').value.toLowerCase();
  const kind = $<HTMLSelectElement>('#kind-filter').value, status = $<HTMLSelectElement>('#status-filter').value, sort = $<HTMLSelectElement>('#sort').value;
  const matchesStatus = (task: TaskSummary) => status === 'all' || task.status === status || (status === 'active' && activeStatuses.includes(task.status)) || (status === 'attention' && ['failed','conflict','recovery_required','awaiting_feedback'].includes(task.status));
  const visible = tasks.filter(task => (filter === 'all' || task.status === filter) && matchesStatus(task) && (kind === 'all' || (task.kind || 'frontend') === kind) && `${task.id} ${task.request} ${task.context.route} ${(task.references || []).join(' ')} ${task.files.join(' ')}`.toLowerCase().includes(query)).sort((a,b) => sort === 'oldest' ? a.createdAt.localeCompare(b.createdAt) : sort === 'updated' ? b.updatedAt.localeCompare(a.updatedAt) : b.createdAt.localeCompare(a.createdAt));
  $('#load-more').hidden = visible.length <= visibleLimit;
  $('#visible-count').textContent = String(visible.length); $('#tasks').replaceChildren();
  if (!visible.length) {
    const empty = element('div', 'empty');
    const symbol = element('div', 'empty-symbol'); symbol.innerHTML = icon('pointer');
    empty.append(symbol, element('h3', '', tasks.length ? 'Nothing here just yet.' : 'Your next change starts here.'), element('p', '', tasks.length ? 'Try another filter or create a new change.' : 'Create a change for your interface, backend, tests or documentation. Or point at an element in the playground.'));
    $('#tasks').append(empty); return;
  }
  for (const task of visible.slice(0, visibleLimit)) {
    const row = element('article', 'task');
    const info = element('div');
    const title = element('button', 'task-title', task.request); title.onclick = () => openTask(task.id);
    const subtitle = element('div', 'task-subtitle');
    subtitle.append(element('span', '', task.id), element('span', '', '·'), element('code', '', task.context.route || task.kind || 'General'), element('span', '', `${task.files.length} file${task.files.length === 1 ? '' : 's'}`));
    info.append(title, subtitle);
    const review = element('button', 'review-button', 'Review'); review.onclick = () => openTask(task.id);
    const mark = element('span', 'task-icon'); mark.innerHTML = icon(task.status === 'applied' ? 'check' : 'pointer');
    row.append(mark, info, element('span', `badge ${task.status}${task.status === 'ready' && task.validationStatus !== 'passed' ? ' unchecked' : ''}`, task.status === 'ready' && task.validationStatus !== 'passed' ? 'Ready · unchecked' : taskStatusLabels[task.status] || task.status), review);
    $('#tasks').append(row);
  }
}
async function refresh() {
  if (refreshing) { refreshAgain = true; return; }
  refreshing = true;
  try { tasks = await api<TaskSummary[]>('/api/tasks'); render(); showError(''); if (selectedId && $<HTMLDialogElement>('#detail-dialog').open) await showTask(selectedId); }
  catch (error) { showError(errorMessage(error)); }
  finally { refreshing = false; if (refreshAgain) { refreshAgain = false; void refresh(); } }
}
async function openTask(id: string) {
  selectedId = id;
  try { await showTask(id); if (!$<HTMLDialogElement>('#detail-dialog').open) $<HTMLDialogElement>('#detail-dialog').showModal(); }
  catch (error) { showError(errorMessage(error)); }
}
async function showTask(id: string) {
  const task = await api<Task>(`/api/tasks/${id}`);
  if (selectedId !== id) return;
  $('#detail-id').textContent = `${task.id} / Task conversation`;
  review.setTask(task);
}
async function connect() {
  connection?.abort();
  if (!token) { $<HTMLDialogElement>('#connect-dialog').showModal(); return; }
  try {
    const status = await api<ServerStatus>('/api/status');
    executionEnabled = status.executionEnabled !== false;
    $('#execution-note').hidden = executionEnabled; $('#execution-note').textContent = 'Execution is disabled. Save drafts and review changes without running agents or setup commands.';
    await appearance.load();
    $('#branch').textContent = `branch / ${status.repository.branch}`;
    const playground = status.playgroundUrl || '/playground';
    for (const id of ['#playground-link', '#inspect-link']) $<HTMLAnchorElement>(id).href = `${playground}#token=${encodeURIComponent(token)}`;
    await refresh();
    connection = new AbortController();
    void watchTasks(location.origin, token, () => void refresh(), connection.signal, online => {
      $('#connection').textContent = online ? 'Connected to localhost' : 'Reconnecting…';
      $('.status-dot').style.background = online ? 'var(--dr-success)' : 'var(--dr-warning)'; if (online) { void refresh(); void appearance.load().catch(() => {}); }
    }, value => appearance.receive(value));
  } catch (error) { showError(errorMessage(error)); $('#connection').textContent = 'Disconnected'; $<HTMLDialogElement>('#connect-dialog').showModal(); }
}
const resetFilter = () => { visibleLimit = 40; render(); };
$<HTMLInputElement>('#search').addEventListener('input', resetFilter);
for (const id of ['#kind-filter','#status-filter','#sort']) $(id).addEventListener('change', resetFilter);
$('#load-more').onclick = () => { visibleLimit += 40; render(); };
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-filter]')) button.onclick = () => {
  filter = button.dataset.filter || 'all'; document.querySelector('.nav-item.active')?.classList.remove('active'); button.classList.add('active'); for (const item of document.querySelectorAll('[data-filter]')) item.setAttribute('aria-pressed', String(item === button)); $<HTMLSelectElement>('#status-filter').value = 'all'; resetFilter();
};
$('#connect-button').onclick = () => { $<HTMLInputElement>('#token-input').value = token; $<HTMLDialogElement>('#connect-dialog').showModal(); };
$('#connect-close').onclick = () => $<HTMLDialogElement>('#connect-dialog').close();
$('#connect-form').onsubmit = event => { event.preventDefault(); token = $<HTMLInputElement>('#token-input').value.trim(); sessionStorage.setItem('devreview-token', token); $<HTMLDialogElement>('#connect-dialog').close(); void connect(); };
$('#detail-close').onclick = () => { $<HTMLDialogElement>('#detail-dialog').close(); selectedId = undefined; };
$<HTMLDialogElement>('#detail-dialog').addEventListener('close', () => { selectedId = undefined; });
void connect();
