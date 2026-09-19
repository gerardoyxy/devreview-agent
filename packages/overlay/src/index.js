/** Authenticated SSE over fetch: credentials never appear in a query string. */
export async function watchTasks(server, token, onTask, signal, onConnection = () => {}) {
  while (!signal.aborted) {
    try {
      const response = await fetch(`${server}/api/events`, { headers: { Authorization: `Bearer ${token}` }, signal });
      if (!response.ok) throw new Error(`Connection failed (${response.status})`);
      onConnection(true);
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
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
    } catch (error) { if (signal.aborted) return; onConnection(false, error.message); }
    if (!signal.aborted) await new Promise(resolve => {
      const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
      const timer = setTimeout(finish, 2000); signal.addEventListener('abort', finish, { once: true });
    });
  }
}

export function elementContext(element, { captureDom = false } = {}) {
  const cloned = element.cloneNode(true);
  cloned.querySelectorAll('script,style,input,textarea,select,[contenteditable],[data-devreview-private]').forEach(node => node.remove());
  const privateElement = !!element.closest('input,textarea,select,[contenteditable],[data-devreview-private]');
  const candidates = [];
  if (element.dataset.testid) candidates.push(`[data-testid="${CSS.escape(element.dataset.testid)}"]`);
  if (element.id) candidates.push(`#${CSS.escape(element.id)}`);
  let node = element, selector = '';
  while (node && node !== document.documentElement && candidates.length < 12) {
    const siblings = [...(node.parentElement?.children || [])].filter(sibling => sibling.tagName === node.tagName);
    const segment = `${node.tagName.toLowerCase()}${siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(node) + 1})` : ''}`;
    selector = segment + (selector ? ` > ${selector}` : ''); candidates.push(selector); node = node.parentElement;
  }
  selector = candidates.find(candidate => { try { return document.querySelectorAll(candidate).length === 1; } catch { return false; } }) || '';
  const rect = element.getBoundingClientRect();
  const url = new URL(location.href); url.search = ''; url.hash = ''; url.username = ''; url.password = '';
  const context = {
    url: url.href, route: url.pathname, selector, tagName: element.tagName.toLowerCase(),
    text: privateElement ? '' : (cloned.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 1000),
    testId: element.dataset.testid || '', ariaLabel: element.getAttribute('aria-label') || '',
    source: element.dataset.devreviewSource || '',
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

export const DevReview = {
  init({ server = 'http://127.0.0.1:7331', token, enabled = false, modifier = 'alt', captureDom = false } = {}) {
    if (!enabled || !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return { destroy() {} };
    if (document.querySelector('[data-devreview-overlay]')) throw new Error('DevReview is already initialized');
    const serverUrl = new URL(server);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(serverUrl.hostname) || !['http:', 'https:'].includes(serverUrl.protocol)) throw new Error('DevReview requires a loopback server');
    if (!token) throw new Error('Copy the local token from the DevReview dashboard');
    server = serverUrl.origin;
    const controller = new AbortController();
    const host = document.createElement('div'); host.dataset.devreviewOverlay = '';
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>
      :host{all:initial;font:13px/1.5 ui-sans-serif,system-ui,sans-serif;color:#f3f4ef}
      *{box-sizing:border-box}button,a,textarea{font:inherit}button,a{cursor:pointer}
      .launcher{position:fixed;bottom:20px;right:20px;display:flex;align-items:center;gap:10px;background:#1d231e;color:#eff6e9;border:1px solid #56604e;border-radius:999px;padding:11px 18px;text-decoration:none;pointer-events:auto;box-shadow:0 4px 20px #0003}
      .dot{width:7px;height:7px;border-radius:50%;background:#a8e86c}.outline{position:fixed;pointer-events:none;border:2px solid #8ed451;background:#a8e86c15;border-radius:4px}
      .panel{position:fixed;width:min(360px,calc(100vw - 24px));padding:20px;background:#1d231e;border:1px solid #58674e;border-radius:14px;pointer-events:auto;box-shadow:0 16px 60px #0004}
      .head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}.head strong{font-size:15px}.close{border:0;background:none;color:#c2ccb9;font-size:20px;padding:0 4px}
      .target{font:11px ui-monospace,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#a8e86c;margin-bottom:12px}
      label{display:block;color:#c5cbbb;margin-bottom:7px}textarea{width:100%;height:105px;resize:vertical;border:1px solid #56604e;border-radius:7px;background:#131a15;color:#fff;padding:10px;outline-offset:3px}
      .hint{font-size:11px;color:#adb9a4;margin:8px 0 16px}.save{width:100%;border:0;border-radius:7px;padding:10px;background:#b5ed7d;color:#172310;font-weight:650}.save:disabled{opacity:.5}
      .error{color:#ffb7aa;font-size:12px;margin:8px 0;white-space:pre-wrap}.marker{position:fixed;background:#203621;color:#c9f59a;border:1px solid #86b85d;border-radius:4px;padding:2px 6px;font:11px ui-monospace,monospace;pointer-events:none}
      [hidden]{display:none!important}
    </style>
    <div class="outline" hidden></div>
    <form class="panel" hidden role="dialog" aria-label="Report a QA issue">
      <div class="head"><strong>What needs to change?</strong><button class="close" type="button" aria-label="Close">×</button></div>
      <div class="target"></div><label for="request">QA request</label>
      <textarea id="request" maxlength="8000" required placeholder="Describe the problem and expected result…"></textarea>
      <p class="hint">The agent works in a separate worktree. You review before applying.</p><p class="error" role="alert" hidden></p>
      <button class="save" type="submit">Save & continue reviewing ↗</button>
    </form>
    <a class="launcher" target="_blank" rel="noopener"><span class="dot"></span><span class="label">DevReview · connecting</span></a>`;
    document.documentElement.append(host);
    const $ = selector => shadow.querySelector(selector);
    $('.launcher').href = `${server}/#token=${encodeURIComponent(token)}`;
    const panel = $('.panel'), outline = $('.outline'), textarea = $('textarea'), error = $('.error');
    let selected, context, previousFocus, saving = false;
    const tasks = new Map(), markers = new Map();
    const position = () => {
      if (selected?.isConnected && !panel.hidden) {
        const rect = selected.getBoundingClientRect();
        Object.assign(outline.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      }
      for (const [id, marker] of markers) {
        const task = tasks.get(id);
        let target; try { target = document.querySelector(task.context.selector); } catch { /* stale selector */ }
        marker.hidden = !target || task.context.route !== location.pathname || ['rejected', 'cancelled'].includes(task.status);
        if (target && !marker.hidden) {
          const rect = target.getBoundingClientRect();
          marker.style.left = `${Math.max(0, rect.left)}px`; marker.style.top = `${Math.max(0, rect.top - 23)}px`;
        }
      }
    };
    const close = () => { if (saving) return; panel.hidden = true; outline.hidden = true; previousFocus?.focus?.({ preventScroll: true }); };
    const pick = target => {
      if (!(target instanceof Element) || target === host || saving) return;
      selected = target; previousFocus = document.activeElement; context = elementContext(target, { captureDom });
      $('.target').textContent = context.selector || context.tagName;
      textarea.value = ''; error.hidden = true; panel.hidden = false; outline.hidden = false;
      const rect = target.getBoundingClientRect();
      panel.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - 372))}px`;
      panel.style.top = `${Math.max(12, Math.min(rect.bottom + 10, innerHeight - 340))}px`;
      position(); textarea.focus();
    };
    const contextMenu = event => {
      if (event.composedPath().includes(host) || (modifier === 'alt' && !event.altKey)) return;
      event.preventDefault(); event.stopPropagation(); pick(event.target);
    };
    const keydown = event => {
      if (event.key === 'Escape') close();
      if (event.key === 'Tab' && !panel.hidden) {
        const focusable = [...panel.querySelectorAll('button:not(:disabled),textarea')];
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && shadow.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && shadow.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      if (event.altKey && event.shiftKey && event.code === 'KeyD') { event.preventDefault(); pick(document.activeElement); }
    };
    const update = task => {
      if (task.deleted) { tasks.delete(task.id); markers.get(task.id)?.remove(); markers.delete(task.id); return; }
      tasks.set(task.id, task);
      if (!markers.has(task.id)) { const marker = document.createElement('div'); marker.className = 'marker'; shadow.append(marker); markers.set(task.id, marker); }
      markers.get(task.id).textContent = `${task.id} · ${task.status}`; position();
    };
    panel.addEventListener('submit', async event => {
      event.preventDefault(); if (saving || !textarea.value.trim()) return;
      saving = true; $('.save').disabled = true; error.hidden = true;
      try {
        const response = await fetch(`${server}/api/tasks`, { method: 'POST', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ request: textarea.value, context }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error);
        update(data); saving = false; close();
      } catch (err) { error.textContent = err.message; error.hidden = false; }
      finally { saving = false; $('.save').disabled = false; }
    });
    $('.close').addEventListener('click', close);
    document.addEventListener('contextmenu', contextMenu, true); document.addEventListener('keydown', keydown, true);
    window.addEventListener('scroll', position, true); window.addEventListener('resize', position);
    const load = () => fetch(`${server}/api/tasks`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Unable to load tasks'); return response.json(); })
      .then(items => items.forEach(update)).catch(() => {});
    void watchTasks(server, token, update, controller.signal, connected => {
      $('.label').textContent = connected ? `DevReview · ${modifier === 'alt' ? 'Alt + ' : ''}right-click` : 'DevReview · disconnected';
      $('.dot').style.background = connected ? '#a8e86c' : '#e4a266'; if (connected) void load();
    });
    return { destroy() { controller.abort(); document.removeEventListener('contextmenu', contextMenu, true); document.removeEventListener('keydown', keydown, true); window.removeEventListener('scroll', position, true); window.removeEventListener('resize', position); host.remove(); } };
  }
};
