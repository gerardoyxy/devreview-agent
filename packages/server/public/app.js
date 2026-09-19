import { watchTasks } from '/overlay.js';
import { createTaskReview } from '/review.js';

const $ = selector => document.querySelector(selector);
const params = new URLSearchParams(location.hash.slice(1));
let token = params.get('token') || sessionStorage.getItem('devreview-token') || '';
if (params.has('token')) { sessionStorage.setItem('devreview-token', token); history.replaceState(null, '', location.pathname); }
let tasks = [], filter = 'all', selectedId, connection, refreshing = false, refreshAgain = false;
const element = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const showError = message => { $('#notice').textContent = message; $('#notice').hidden = !message; };
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`); return data;
}
const review = createTaskReview($('#task-review').attachShadow({ mode: 'open' }), { api, onMutation: () => void refresh() });
function render() {
  const count = status => tasks.filter(task => task.status === status).length;
  $('#all-count').textContent = tasks.length; $('#ready-count').textContent = count('ready'); $('#applied-count').textContent = count('applied');
  $('#metric-open').textContent = tasks.filter(task => ['pending', 'analyzing', 'working', 'validating'].includes(task.status)).length;
  $('#metric-ready').textContent = count('ready'); $('#metric-applied').textContent = count('applied');
  const query = $('#search').value.toLowerCase();
  const visible = tasks.filter(task => (filter === 'all' || task.status === filter) && `${task.id} ${task.request} ${task.context.route}`.toLowerCase().includes(query));
  $('#visible-count').textContent = visible.length; $('#tasks').replaceChildren();
  if (!visible.length) {
    const empty = element('div', 'empty');
    empty.append(element('div', 'empty-symbol', '+'), element('h3', '', tasks.length ? 'Nothing here just yet.' : 'Your next fix starts with a right-click.'), element('p', '', tasks.length ? 'Try another filter or report a new issue.' : 'Open the playground, hold Alt, and right-click an element. Leave a note. We’ll take it from there.'));
    $('#tasks').append(empty); return;
  }
  for (const task of visible) {
    const row = element('article', 'task');
    const info = element('div');
    const title = element('button', 'task-title', task.request); title.onclick = () => openTask(task.id);
    const subtitle = element('div', 'task-subtitle');
    subtitle.append(element('span', '', task.id), element('span', '', '·'), element('code', '', task.context.route), element('span', '', `${task.files.length} file${task.files.length === 1 ? '' : 's'}`));
    info.append(title, subtitle);
    const review = element('button', 'review-button', 'Review ↗'); review.onclick = () => openTask(task.id);
    row.append(element('span', 'task-icon', task.status === 'applied' ? '✓' : '+'), info, element('span', `badge ${task.status}`, task.status), review);
    $('#tasks').append(row);
  }
}
async function refresh() {
  if (refreshing) { refreshAgain = true; return; }
  refreshing = true;
  try { tasks = await api('/api/tasks'); render(); showError(''); if (selectedId && $('#detail-dialog').open) await showTask(selectedId); }
  catch (error) { showError(error.message); }
  finally { refreshing = false; if (refreshAgain) { refreshAgain = false; void refresh(); } }
}
async function openTask(id) {
  selectedId = id;
  try { await showTask(id); if (!$('#detail-dialog').open) $('#detail-dialog').showModal(); }
  catch (error) { showError(error.message); }
}
async function showTask(id) {
  const task = await api(`/api/tasks/${id}`);
  if (selectedId !== id) return;
  $('#detail-id').textContent = `${task.id} / Task conversation`;
  review.setTask(task);
}
async function connect() {
  connection?.abort();
  if (!token) { $('#connect-dialog').showModal(); return; }
  try {
    const status = await api('/api/status');
    $('#branch').textContent = `branch / ${status.repository.branch}`;
    const playground = status.playgroundUrl || '/playground';
    for (const id of ['#playground-link', '#inspect-link']) $(id).href = `${playground}#token=${encodeURIComponent(token)}`;
    await refresh();
    connection = new AbortController();
    void watchTasks(location.origin, token, () => void refresh(), connection.signal, online => {
      $('#connection').textContent = online ? 'Connected to localhost' : 'Reconnecting…';
      $('.status-dot').style.background = online ? '#6a994e' : '#caa16b'; if (online) void refresh();
    });
  } catch (error) { showError(error.message); $('#connection').textContent = 'Disconnected'; $('#connect-dialog').showModal(); }
}
$('#search').addEventListener('input', render);
for (const button of document.querySelectorAll('[data-filter]')) button.onclick = () => {
  filter = button.dataset.filter; document.querySelector('.nav-item.active')?.classList.remove('active'); button.classList.add('active'); render();
};
$('#connect-button').onclick = () => { $('#token-input').value = token; $('#connect-dialog').showModal(); };
$('#connect-close').onclick = () => $('#connect-dialog').close();
$('#connect-form').onsubmit = event => { event.preventDefault(); token = $('#token-input').value.trim(); sessionStorage.setItem('devreview-token', token); $('#connect-dialog').close(); void connect(); };
$('#detail-close').onclick = () => { $('#detail-dialog').close(); selectedId = undefined; };
$('#detail-dialog').addEventListener('close', () => { selectedId = undefined; });
void connect();
