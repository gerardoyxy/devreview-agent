import { icon } from '../../overlay/src/icons.js';
import { createProjectContext } from '../../overlay/src/project-context.js';
import { createAppearance, themeDefaults } from '../../overlay/src/appearance.js';
import type { Task, TaskSummary, ServerStatus, TaskStatus } from '../../contracts/src/index.js';
import { errorMessage, query } from '../../contracts/src/index.js';
import { watchTasks } from '../../overlay/src/index.js';
import { createTaskReview, taskStatusLabels } from '../../overlay/src/review.js';

const $ = <E extends HTMLElement = HTMLElement>(selector: string) => query<E>(document, selector);
const params = new URLSearchParams(location.hash.slice(1));
let token = params.get('token') || sessionStorage.getItem('nudgethis-token') || '';
if (params.has('token')) { sessionStorage.setItem('nudgethis-token', token); history.replaceState(null, '', location.pathname); }
let tasks: TaskSummary[] = [], filter = 'all', selectedId: string | undefined, connection: AbortController | undefined, refreshing = false, refreshAgain = false;
const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const showError = (message: string) => { $('#notice').textContent = message; $('#notice').hidden = !message; };
async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`); return data;
}
const defaults = document.createElement('style'); defaults.textContent = themeDefaults; document.head.append(defaults);
const appearance = createAppearance({ api, target: document.documentElement, mount: document.body });
const projectContext = createProjectContext({ api, mount: document.body });
$('#context-button').onclick = () => { void projectContext.open(); };
$('#appearance-button').onclick = () => { void appearance.open(); };
const review = createTaskReview($('#task-review').attachShadow({ mode: 'open' }), { api, onMutation: () => void refresh() });
function render() {
  const count = (status: TaskStatus) => tasks.filter(task => task.status === status).length;
  $('#all-count').textContent = String(tasks.length); $('#ready-count').textContent = String(count('ready')); $('#applied-count').textContent = String(count('applied'));
  $('#metric-open').textContent = String(tasks.filter(task => ['pending', 'analyzing', 'working', 'validating'].includes(task.status)).length);
  $('#metric-ready').textContent = String(count('ready')); $('#metric-applied').textContent = String(count('applied'));
  const query = $<HTMLInputElement>('#search').value.toLowerCase();
  const visible = tasks.filter(task => (filter === 'all' || task.status === filter) && `${task.id} ${task.request} ${task.context.route}`.toLowerCase().includes(query));
  $('#visible-count').textContent = String(visible.length); $('#tasks').replaceChildren();
  if (!visible.length) {
    const empty = element('div', 'empty');
    const symbol = element('div', 'empty-symbol'); symbol.innerHTML = icon('pointer');
    empty.append(symbol, element('h3', '', tasks.length ? 'Nothing here just yet.' : 'Your next change starts here.'), element('p', '', tasks.length ? 'Try another filter or report a new issue.' : 'Open the playground. Hold Alt and right-click an element, then describe what you want to change.'));
    $('#tasks').append(empty); return;
  }
  for (const task of visible) {
    const row = element('article', 'task');
    const info = element('div');
    const title = element('button', 'task-title', task.request); title.onclick = () => openTask(task.id);
    const subtitle = element('div', 'task-subtitle');
    subtitle.append(element('span', '', task.id), element('span', '', '·'), element('code', '', task.context.route), element('span', '', `${task.files.length} file${task.files.length === 1 ? '' : 's'}`));
    info.append(title, subtitle);
    const review = element('button', 'review-button', 'Review'); review.onclick = () => openTask(task.id);
    const mark = element('span', 'task-icon'); mark.innerHTML = icon(task.status === 'applied' ? 'check' : 'pointer');
    row.append(mark, info, element('span', `badge ${task.status}`, taskStatusLabels[task.status] || task.status), review);
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
$<HTMLInputElement>('#search').addEventListener('input', render);
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-filter]')) button.onclick = () => {
  filter = button.dataset.filter || 'all'; document.querySelector('.nav-item.active')?.classList.remove('active'); button.classList.add('active'); render();
};
$('#connect-button').onclick = () => { $<HTMLInputElement>('#token-input').value = token; $<HTMLDialogElement>('#connect-dialog').showModal(); };
$('#connect-close').onclick = () => $<HTMLDialogElement>('#connect-dialog').close();
$('#connect-form').onsubmit = event => { event.preventDefault(); token = $<HTMLInputElement>('#token-input').value.trim(); sessionStorage.setItem('nudgethis-token', token); $<HTMLDialogElement>('#connect-dialog').close(); void connect(); };
$('#detail-close').onclick = () => { $<HTMLDialogElement>('#detail-dialog').close(); selectedId = undefined; };
$<HTMLDialogElement>('#detail-dialog').addEventListener('close', () => { selectedId = undefined; });
void connect();
