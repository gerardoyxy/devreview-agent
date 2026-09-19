import { portableContext } from './context.js';
import type { Api, ElementContext, Task, TaskSummary, TaskEvent, ServerStatus } from '../../contracts/src/index.js';
import { errorMessage, query } from '../../contracts/src/index.js';
import { createTaskReview } from './review.js';

/** Authenticated SSE over fetch: credentials never appear in a query string. */
export async function watchTasks(server: string, token: string, onTask: (task: TaskEvent) => void, signal: AbortSignal, onConnection: (connected: boolean, error?: string) => void = () => {}) {
  while (!signal.aborted) {
    try {
      const response = await fetch(`${server}/api/events`, { headers: { Authorization: `Bearer ${token}` }, signal });
      if (!response.ok) throw new Error(`Connection failed (${response.status})`);
      onConnection(true);
      const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      try {
        while (!signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          let end;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const event = buffer.slice(0, end); buffer = buffer.slice(end + 2);
            if (event.startsWith('event: task\n')) onTask(JSON.parse(event.slice(event.indexOf('data: ') + 6)));
          }
        }
      } finally { await reader.cancel().catch(() => {}); }
    } catch (error) { if (signal.aborted) return; onConnection(false, errorMessage(error)); }
    if (!signal.aborted) await new Promise<void>(resolve => {
      const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
      const timer = setTimeout(finish, 2000); signal.addEventListener('abort', finish, { once: true });
    });
  }
}

export function elementContext(element: Element, { captureDom = false } = {}): ElementContext {
  const cloned = element.cloneNode(true) as Element;
  cloned.querySelectorAll('script,style,input,textarea,select,[contenteditable],[data-nudgethis-private]').forEach(node => node.remove());
  const privateElement = !!element.closest('input,textarea,select,[contenteditable],[data-nudgethis-private]');
  const candidates = [];
  if (element.getAttribute('data-testid')) candidates.push(`[data-testid="${CSS.escape(element.getAttribute('data-testid')!)}"]`);
  if (element.id) candidates.push(`#${CSS.escape(element.id)}`);
  let node: Element | null = element, selector = '';
  while (node && node !== document.documentElement && candidates.length < 12) {
    const siblings = [...(node.parentElement?.children || [])].filter(sibling => sibling.tagName === node!.tagName);
    const segment = `${node.tagName.toLowerCase()}${siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(node) + 1})` : ''}`;
    selector = segment + (selector ? ` > ${selector}` : ''); candidates.push(selector); node = node.parentElement;
  }
  selector = candidates.find(candidate => { try { return document.querySelectorAll(candidate).length === 1; } catch { return false; } }) || '';
  const rect = element.getBoundingClientRect();
  const url = new URL(location.href); url.search = ''; url.hash = ''; url.username = ''; url.password = '';
  const context: ElementContext = {
    url: url.href, route: url.pathname, selector, tagName: element.tagName.toLowerCase(),
    text: privateElement ? '' : (cloned.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 1000),
    testId: element.getAttribute('data-testid') || '', ariaLabel: element.getAttribute('aria-label') || '',
    source: element.getAttribute('data-nudgethis-source') || '',
    boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    viewport: { width: innerWidth, height: innerHeight }
  };
  if (captureDom && !privateElement) {
    for (const child of [cloned, ...cloned.querySelectorAll('*')]) {
      for (const attribute of [...child.attributes]) {
        if (!['class', 'id', 'data-testid', 'aria-label'].includes(attribute.name)) child.removeAttribute(attribute.name);
      }
    }
    context.domSnippet = cloned.outerHTML.slice(0, 4000);
  }
  return context;
}

export interface OverlayOptions { server?: string; token?: string; enabled?: boolean; modifier?: 'alt' | 'none'; captureDom?: boolean }

export const NudgeThis = {
  init({ server = 'http://127.0.0.1:7331', token, enabled = false, modifier = 'alt', captureDom = false }: OverlayOptions = {}) {
    if (!enabled || !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return { destroy() {} };
    if (document.querySelector('[data-nudgethis-overlay]')) throw new Error('NudgeThis is already initialized');
    const serverUrl = new URL(server);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(serverUrl.hostname) || !['http:', 'https:'].includes(serverUrl.protocol)) throw new Error('NudgeThis requires a loopback server');
    token ||= ''; // Copy-context mode also works without a server session.
    server = serverUrl.origin;
    const controller = new AbortController();
    const host = document.createElement('div'); host.dataset.nudgethisOverlay = '';
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>
      :host{all:initial;font:13px/1.5 ui-sans-serif,system-ui,sans-serif;color:#f3f4ef}
      *{box-sizing:border-box}button,a,textarea,select{font:inherit}button,a{cursor:pointer}
      .launcher{position:fixed;bottom:20px;right:20px;display:flex;align-items:center;gap:10px;background:#1d231e;color:#eff6e9;border:1px solid #56604e;border-radius:999px;padding:11px 18px;text-decoration:none;pointer-events:auto;box-shadow:0 4px 20px #0003}
      .dot{width:7px;height:7px;border-radius:50%;background:#a8e86c}.outline{position:fixed;pointer-events:none;border:2px solid #8ed451;background:#a8e86c15;border-radius:4px}
      .agent-select{display:block;width:100%;background:#273228;color:#eaf2e4;border:1px solid #58674e;border-radius:6px;padding:8px;margin:8px 0}.prompt-actions{display:flex;gap:8px;align-items:center}.copy-context{background:transparent;color:#deedcf;border:1px solid #58674e;border-radius:6px;padding:10px;white-space:nowrap}.save:disabled{opacity:.5}.copy-status{color:#d4e7b9;font-size:11px;margin-bottom:0}.panel{position:fixed;width:min(360px,calc(100vw - 24px));padding:20px;background:#1d231e;border:1px solid #58674e;border-radius:14px;pointer-events:auto;box-shadow:0 16px 60px #0004}
      .head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}.head strong{font-size:15px}.close{border:0;background:none;color:#c2ccb9;font-size:20px;padding:0 4px}
      .target{font:11px ui-monospace,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#a8e86c;margin-bottom:12px}
      label{display:block;color:#c5cbbb;margin-bottom:7px}textarea{width:100%;height:105px;resize:vertical;border:1px solid #56604e;border-radius:7px;background:#131a15;color:#fff;padding:10px;outline-offset:3px}
      .hint{font-size:11px;color:#adb9a4;margin:8px 0 16px}.save{width:100%;border:0;border-radius:7px;padding:10px;background:#b5ed7d;color:#172310;font-weight:650}.save:disabled{opacity:.5}
      .error{color:#ffb7aa;font-size:12px;margin:8px 0;white-space:pre-wrap}.marker{position:fixed;background:#203621;color:#c9f59a;border:1px solid #86b85d;border-radius:4px;padding:2px 6px;font:11px ui-monospace,monospace;pointer-events:auto}
      .review-dialog{width:min(1100px,calc(100vw - 36px));height:min(800px,calc(100dvh - 48px));padding:0;border:1px solid #dce5d2;border-radius:16px;background:#fff;color:#35472b;pointer-events:auto;box-shadow:0 28px 100px #0004;max-width:none;max-height:none;overflow:hidden}
      .review-dialog::backdrop{background:#14220e66;backdrop-filter:blur(3px)}.review-shell{height:100%;display:flex;flex-direction:column}.review-header{padding:15px 20px;background:#f9fbf5;border-bottom:1px solid #e0e8d6;display:flex;justify-content:space-between;align-items:center;gap:15px}.review-brand{display:flex;align-items:center;gap:10px;font-size:15px;letter-spacing:-.3px}.review-logo{background:#2e4327;color:#d1efa4;width:28px;height:28px;border-radius:7px;display:grid;place-items:center;font:24px Georgia,serif}.review-header-actions{display:flex;align-items:center;gap:20px}.dashboard-link{color:#849873;font-size:10px;text-decoration:none}.review-close{border:0;background:none;color:#6f8560;font-size:24px;line-height:1;padding:4px}.review-body{display:grid;grid-template-columns:260px minmax(0,1fr);min-height:0;flex:1}.review-sidebar{background:#f6f8f1;border-right:1px solid #e1e8d8;overflow:auto;padding:20px 13px}.review-caption{margin:0 7px 14px;display:block;font-size:10px;letter-spacing:1.3px;text-transform:uppercase;color:#8b9b7d}.review-filter{width:100%;background:#fff;border:1px solid #dde5d3;color:#6e835d;border-radius:6px;padding:8px;margin-bottom:14px;font:11px system-ui}.review-task{display:block;width:100%;text-align:left;border:1px solid transparent;background:none;padding:12px 11px;border-radius:8px;color:#6a8158;margin:4px 0}.review-task[aria-current=true]{background:#fff;border-color:#dfe8d3;box-shadow:0 2px 7px #24340e05}.review-task small{font-size:9px;display:flex;justify-content:space-between;gap:8px;color:#91a37e}.review-task strong{display:block;font-size:11px;font-weight:550;line-height:1.65;margin:6px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.review-task .route{font:9px ui-monospace,monospace;color:#9dac8e;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.review-detail{min-height:0;min-width:0}.review-empty{padding:55px 30px;color:#8b9d7a;text-align:center;font-size:12px;line-height:1.9}.review-error{padding:15px;color:#ac7542;white-space:pre-wrap}
      @media(max-width:700px){.review-dialog{width:calc(100vw - 16px);height:calc(100dvh - 24px);border-radius:12px}.review-body{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}.review-sidebar{max-height:130px;border-right:0;border-bottom:1px solid #e1e8d8;padding:9px 12px}.review-caption,.review-filter{display:none}.review-task-list{display:flex;gap:7px;overflow-x:auto}.review-task{min-width:190px;max-width:220px;padding:8px;margin:0}.review-header{padding:12px 15px}.review-header-actions{gap:12px}.dashboard-link{font-size:9px}}
      [hidden]{display:none!important}
    </style>
    <div class="outline" hidden></div>
    <form class="panel" hidden role="dialog" aria-label="Report a QA issue">
      <div class="head"><strong>What needs to change?</strong><button class="close" type="button" aria-label="Close">×</button></div>
      <div class="target"></div><label for="request">QA request</label>
      <textarea id="request" maxlength="8000" required placeholder="Describe the problem and expected result…"></textarea>
      <label for="agent">Coding agent</label><select id="agent" class="agent-select" aria-label="Coding agent"><option value="">Connect to load agents</option></select>
      <p class="hint">The agent works in a separate worktree. You review before applying.</p><p class="error" role="alert" hidden></p>
      <div class="prompt-actions"><button class="copy-context" type="button">Copy context</button><button class="save" type="submit" disabled>Start conversation ↗</button></div><p class="copy-status" role="status" hidden></p>
    </form>
    <button class="launcher" type="button" aria-label="Open NudgeThis conversations"><span class="dot"></span><span class="label">NudgeThis · connecting</span></button>
    <dialog class="review-dialog" aria-label="NudgeThis conversations"><div class="review-shell"><header class="review-header"><div class="review-brand"><span class="review-logo">d</span><strong>nudgethis</strong></div><div class="review-header-actions"><a class="dashboard-link" target="_blank" rel="noopener">Full dashboard ↗</a><button type="button" class="review-close" aria-label="Close conversations">×</button></div></header><div class="review-body"><aside class="review-sidebar"><span class="review-caption">Your changes</span><select class="review-filter" aria-label="Filter conversations"><option value="all">All changes</option><option value="page">This page</option><option value="applied">Applied changes</option></select><div class="review-task-list"></div></aside><div class="review-detail"><p class="review-empty">Your changes and their conversations live here.<br>Hold Alt and right-click an element to start.</p></div></div></div></dialog>`;
    document.documentElement.append(host);
    const $ = <E extends HTMLElement = HTMLElement>(selector: string) => query<E>(shadow, selector);
    $<HTMLAnchorElement>('.dashboard-link').href = `${server}/#token=${encodeURIComponent(token)}`;
    const panel = $<HTMLFormElement>('.panel'), outline = $('.outline'), textarea = $<HTMLTextAreaElement>('textarea'), error = $('.error');
    let agentsReady = false;
    let selected: Element | undefined, context: ElementContext | undefined, previousFocus: Element | null, saving = false;
    const tasks = new Map<string, TaskSummary>(), markers = new Map<string, HTMLButtonElement>();
    const dialog = $<HTMLDialogElement>('.review-dialog');
    let selectedId: string | undefined, review: ReturnType<typeof createTaskReview> | undefined, refreshTimer: ReturnType<typeof setTimeout> | undefined, refreshSequence = 0, online = false;
    const api: Api = async <T>(endpoint: string, options: RequestInit = {}): Promise<T> => {
      const response = await fetch(server + endpoint, { ...options, signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`); return data;
    };
    const loadAgents = async () => {
      try {
        const status = await api<ServerStatus>('/api/status');
        const select = $<HTMLSelectElement>('.agent-select');
        const previous = select.value || status.agent;
        select.replaceChildren();
        for (const agent of status.agents || []) {
          const option = document.createElement('option'); option.value = agent.id; option.textContent = agent.label; select.append(option);
        }
        if ([...select.options].some(option => option.value === previous)) select.value = previous;
        agentsReady = select.options.length > 0;
        $<HTMLButtonElement>('.save').disabled = saving || !agentsReady;
      } catch { agentsReady = false; $<HTMLButtonElement>('.save').disabled = true; }
    };
    $('.copy-context').onclick = async () => {
      if (!context) return;
      try {
        await navigator.clipboard.writeText(portableContext(context, textarea.value));
        $('.copy-status').textContent = 'Context copied. Paste it into your coding agent.'; $('.copy-status').hidden = false;
      } catch { error.textContent = 'Clipboard access was blocked by the browser.'; error.hidden = false; }
    };
    const renderList = () => {
      const filter = $<HTMLSelectElement>('.review-filter').value;
      const items = [...tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).filter(task => filter === 'all' || (filter === 'page' ? task.context.route === location.pathname : task.status === 'applied'));
      $('.review-task-list').replaceChildren();
      for (const task of items) {
        const button = document.createElement('button'); button.className = 'review-task'; button.type = 'button'; button.setAttribute('aria-current', String(task.id === selectedId));
        const top = document.createElement('small'); const id = document.createElement('span'); id.textContent = task.id;
        const status = document.createElement('span'); status.textContent = task.status.replaceAll('_', ' '); top.append(id, status);
        const title = document.createElement('strong'); title.textContent = task.request;
        const route = document.createElement('div'); route.className = 'route'; route.textContent = task.context.route;
        button.append(top, title, route); button.onclick = () => void openReview(task.id); $('.review-task-list').append(button);
      }
      if (!items.length) { const empty = document.createElement('p'); empty.className = 'review-empty'; empty.textContent = 'No changes in this view.'; $('.review-task-list').append(empty); }
      const ready = [...tasks.values()].filter(task => ['ready', 'awaiting_feedback'].includes(task.status)).length;
      $('.label').textContent = online ? `NudgeThis · ${ready ? `${ready} to review` : `${tasks.size} changes`}` : 'NudgeThis · disconnected';
    };
    const refreshReview = async () => {
      if (!selectedId || !dialog.open) return;
      const id = selectedId, sequence = ++refreshSequence;
      try {
        const task = await api<Task>(`/api/tasks/${id}`);
        if (selectedId !== id || sequence !== refreshSequence || !dialog.open) return;
        if (!review) {
          $('.review-detail').replaceChildren();
          review = createTaskReview($('.review-detail'), { api, onMutation: () => { void load(); void refreshReview(); } });
        }
        review.setTask(task);
      } catch (err) {
        if (selectedId !== id || sequence !== refreshSequence) return;
        if (review) review.error(errorMessage(err));
        else { $('.review-detail').textContent = errorMessage(err); }
      }
    };
    const openReview = async (id?: string) => {
      selectedId = id || selectedId || [...tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.id;
      if (!dialog.open) dialog.showModal();
      renderList(); await refreshReview();
    };
    $('.launcher').onclick = () => void openReview();
    $('.review-close').onclick = () => dialog.close();
    $<HTMLSelectElement>('.review-filter').onchange = renderList;
    const position = () => {
      if (selected?.isConnected && !panel.hidden) {
        const rect = selected.getBoundingClientRect();
        Object.assign(outline.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      }
      for (const [id, marker] of markers) {
        const task = tasks.get(id)!;
        let target; try { target = document.querySelector(task.context.selector); } catch { /* stale selector */ }
        marker.hidden = !target || task.context.route !== location.pathname || ['rejected', 'cancelled'].includes(task.status);
        if (target && !marker.hidden) {
          const rect = target.getBoundingClientRect();
          marker.style.left = `${Math.max(0, rect.left)}px`; marker.style.top = `${Math.max(0, rect.top - 23)}px`;
        }
      }
    };
    const close = () => { if (saving) return; panel.hidden = true; outline.hidden = true; if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true }); };
    const pick = (target: EventTarget | null) => {
      if (!(target instanceof Element) || target === host || saving) return;
      selected = target; previousFocus = document.activeElement; context = elementContext(target, { captureDom });
      $('.target').textContent = context.selector || context.tagName;
      textarea.value = ''; error.hidden = true; $('.copy-status').hidden = true; panel.hidden = false; outline.hidden = false;
      const rect = target.getBoundingClientRect();
      panel.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - 372))}px`;
      panel.style.top = `${Math.max(12, Math.min(rect.bottom + 10, innerHeight - 440))}px`;
      position(); textarea.focus();
    };
    const contextMenu = (event: MouseEvent) => {
      if (event.composedPath().includes(host) || (modifier === 'alt' && !event.altKey)) return;
      event.preventDefault(); event.stopPropagation(); pick(event.target);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'Tab' && !panel.hidden && !dialog.open) {
        const focusable = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled),textarea,select:not(:disabled)')];
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && shadow.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && shadow.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      if (event.altKey && event.shiftKey && event.code === 'KeyD') { event.preventDefault(); pick(document.activeElement); }
    };
    const update = (task: TaskEvent) => {
      if ('deleted' in task) {
        tasks.delete(task.id); markers.get(task.id)?.remove(); markers.delete(task.id);
        if (selectedId === task.id) {
          selectedId = undefined; refreshSequence++; review?.destroy(); review = undefined;
          const empty = document.createElement('p'); empty.className = 'review-empty'; empty.textContent = 'This task was deleted. Select another change.'; $('.review-detail').replaceChildren(empty);
        }
        renderList(); return;
      }
      tasks.set(task.id, task);
      if (!markers.has(task.id)) { const marker = document.createElement('button'); marker.type = 'button'; marker.className = 'marker'; marker.onclick = () => void openReview(task.id); shadow.append(marker); markers.set(task.id, marker); }
      markers.get(task.id)!.textContent = `${task.id} · ${task.status.replaceAll('_', ' ')}`; position(); renderList();
      if (selectedId === task.id && dialog.open) { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => void refreshReview(), 40); }
    };
    panel.addEventListener('submit', async event => {
      event.preventDefault(); if (saving || !agentsReady || !textarea.value.trim()) return;
      saving = true; $<HTMLButtonElement>('.save').disabled = true; error.hidden = true;
      try {
        const response = await fetch(`${server}/api/tasks`, { method: 'POST', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ request: textarea.value, context, agent: $<HTMLSelectElement>('.agent-select').value }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error);
        update(data); saving = false; close(); await openReview(data.id);
      } catch (err) { error.textContent = errorMessage(err); error.hidden = false; }
      finally { saving = false; $<HTMLButtonElement>('.save').disabled = !agentsReady; }
    });
    $('.close').addEventListener('click', close);
    document.addEventListener('contextmenu', contextMenu, true); document.addEventListener('keydown', keydown, true);
    window.addEventListener('scroll', position, true); window.addEventListener('resize', position);
    const load = () => fetch(`${server}/api/tasks`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Unable to load tasks'); return response.json(); })
      .then((items: TaskSummary[]) => {
        const ids = new Set(items.map(task => task.id));
        for (const id of tasks.keys()) if (!ids.has(id)) { tasks.delete(id); markers.get(id)?.remove(); markers.delete(id); }
        items.forEach(update); renderList();
      }).catch(() => {});
    renderList();
    if (token) void watchTasks(server, token, update, controller.signal, connected => {
      online = connected; renderList();
      $('.dot').style.background = connected ? '#a8e86c' : '#e4a266'; if (connected) { void load(); void loadAgents(); }
    });
    return { destroy() { clearTimeout(refreshTimer); controller.abort(); dialog.close(); review?.destroy(); document.removeEventListener('contextmenu', contextMenu, true); document.removeEventListener('keydown', keydown, true); window.removeEventListener('scroll', position, true); window.removeEventListener('resize', position); host.remove(); } };
  }
};
