import { createPreview } from './preview.js';
import { createBranchPublish } from './branch-publish.js';
import { createSavedVersions } from './versions.js';
import { createMyStyle } from './my-style.js';
import { createElementSelection } from './multi-selection.js';
import { createSelectionControls, defaultSelectionControls, validSelectionControls, pointerLabel, keyboardLabel, type SelectionControls } from './selection-controls.js';
import { createRouteReview } from './route-review.js';
import { createTaskComposer, createDiagnostics } from './workspace.js';
import { overlayStyles } from './styles.js';
import { icon } from './icons.js';
import { brandLogo } from './brand.js';
import { createProjectContext, createContextPicker, contextStyles } from './project-context.js';
import { createAppearance, themeDefaults } from './appearance.js';
import { portableContext, contextElements } from './context.js';
import type { Api, ElementContext, Task, TaskSummary, TaskEvent, ServerStatus } from '../../contracts/src/index.js';
import { errorMessage, query } from '../../contracts/src/index.js';
import { createTaskReview } from './review.js';

/** Authenticated SSE over fetch: credentials never appear in a query string. */
export async function watchTasks(server: string, token: string, onTask: (task: TaskEvent) => void, signal: AbortSignal, onConnection: (connected: boolean, error?: string) => void = () => {}, onAppearance: (value: unknown) => void = () => {}, onSelection: (value: unknown) => void = () => {}, onVersions: () => void = () => {}, onWorkspace: () => void = () => {}, onGitHub: () => void = () => {}) {
  let retryDelay = 1000;
  while (!signal.aborted) {
    try {
      const response = await fetch(`${server}/api/events`, { headers: { Authorization: `Bearer ${token}` }, signal });
      if (!response.ok) throw new Error(`Connection failed (${response.status})`);
      onConnection(true); retryDelay = 1000;
      const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      try {
        while (!signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          if (buffer.length > 1048576) throw new Error('Event stream exceeded its limit');
          let end;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const event = buffer.slice(0, end); buffer = buffer.slice(end + 2);
            if (event.startsWith('event: appearance\n')) onAppearance(JSON.parse(event.slice(event.indexOf('data: ') + 6)));
            if (event.startsWith('event: selection-controls\n')) onSelection(JSON.parse(event.slice(event.indexOf('data: ') + 6)));
            if (event.startsWith('event: workspace\n')) onWorkspace();
            if (event.startsWith('event: github\n')) onGitHub();
            if (event.startsWith('event: versions\n')) onVersions();
            if (event.startsWith('event: task\n')) onTask(JSON.parse(event.slice(event.indexOf('data: ') + 6)));
          }
        }
      } finally { await reader.cancel().catch(() => {}); }
      if (!signal.aborted) onConnection(false);
    } catch (error) { if (signal.aborted) return; onConnection(false, errorMessage(error)); }
    if (!signal.aborted) await new Promise<void>(resolve => {
      const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
      const timer = setTimeout(finish, retryDelay); signal.addEventListener('abort', finish, { once: true });
    });
    retryDelay = Math.min(retryDelay * 2, 15000);
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
    testId: element.getAttribute('data-testid') || '', ariaLabel: privateElement ? '' : element.getAttribute('aria-label') || '',
    sourceVerified: false, source: element.getAttribute('data-nudgethis-source') || '',
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

/** Reidentify only a unique target whose captured tag and text still agree. */
export function resolveElement(context: ElementContext): Element | undefined {
  if (context.route !== location.pathname || !context.selector) return;
  try {
    const matches = document.querySelectorAll(context.selector);
    if (matches.length !== 1) return;
    const target = matches[0];
    if (target.closest('[data-nudgethis-overlay]') || target.tagName.toLowerCase() !== context.tagName) return;
    if (context.testId && target.getAttribute('data-testid') !== context.testId) return;
    if (context.ariaLabel && target.getAttribute('aria-label') !== context.ariaLabel) return;
    if (context.text && elementContext(target).text !== context.text) return;
    return target;
  } catch { return; }
}

export interface OverlayOptions { server?: string; token?: string; enabled?: boolean; modifier?: 'alt' | 'none'; selection?: Pick<SelectionControls, 'pointer' | 'keyboard' | 'additiveModifier'>; captureDom?: boolean }

export const NudgeThis = {
  init({ server = 'http://127.0.0.1:7331', token, enabled = false, modifier = 'alt', selection, captureDom = false }: OverlayOptions = {}) {
    if (!enabled || !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return { destroy() {} };
    if (document.querySelector('[data-nudgethis-overlay]')) throw new Error('NudgeThis is already initialized');
    const serverUrl = new URL(server);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(serverUrl.hostname) || !['http:', 'https:'].includes(serverUrl.protocol)) throw new Error('NudgeThis requires a loopback server');
    token ||= ''; // Copy-context mode also works without a server session.
    server = serverUrl.origin;
    const fallbackControls = { ...defaultSelectionControls(), ...(selection || {}) };
    if (!selection && modifier === 'none') fallbackControls.pointer.modifiers = [];
    if (!validSelectionControls(fallbackControls)) throw new Error('Invalid selection controls');
    let selectionControls = fallbackControls;
    const controller = new AbortController();
    const host = document.createElement('div'); host.dataset.nudgethisOverlay = '';
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${themeDefaults}${contextStyles}${overlayStyles}</style>
    <div class="outline" hidden></div>
    <form class="panel" hidden role="dialog" aria-label="Report a QA issue">
      <div class="head"><strong>What needs to change?</strong><button class="close" type="button" aria-label="Close">${icon('close')}</button></div>
      <div class="target"></div><div class="selection-summary" hidden><ol class="selection-items"></ol><button class="edit-selection" type="button">Add more elements</button></div><div class="target-navigation"><button type="button" class="target-parent">Parent</button><button type="button" class="target-child">First child</button><button type="button" class="target-next">Next sibling</button></div><p class="target-hint" role="status"></p><label for="request">Your request</label>
      <textarea id="request" maxlength="8000" required placeholder="Make this wider, move it up, give it more space…"></textarea>
      <label for="agent">Coding agent</label><select id="agent" class="agent-select" aria-label="Coding agent"><option value="">Connect to load agents</option></select>
      <div class="capture-context"></div><p class="hint">The agent works in a separate worktree. You review before applying.</p><p class="error" role="alert" hidden></p>
      <div class="prompt-actions"><button class="style-target" type="button">My Style</button><button class="copy-context" type="button">Copy context</button><button class="save-draft" type="submit" value="draft" disabled>Save draft</button><button class="save" type="submit" value="start" disabled>Start conversation</button></div><p class="copy-status" role="status" hidden></p>
    </form>
    <div class="overlay-tools"><button type="button" class="pick-launcher" aria-pressed="false">Pick element</button><button type="button" class="multiple-launcher" aria-pressed="false">Select multiple</button><button type="button" class="area-launcher" aria-pressed="false">Select area</button><button type="button" class="controls-launcher" aria-label="Selection controls">Controls</button><button class="launcher" type="button" aria-label="Open NudgeThis conversations">${brandLogo()}<span class="dot"></span><span class="label">NudgeThis · connecting</span></button></div><p class="pick-notice" role="status" hidden>Click or tap an element · Escape to cancel</p>
    <dialog class="review-dialog" aria-label="NudgeThis conversations"><div class="review-shell"><header class="review-header"><div class="review-brand">${brandLogo()}<span>NudgeThis</span></div><div class="review-header-actions"><button type="button" class="appearance-button new-change">New change</button><button type="button" class="appearance-button branch-open">Branch &amp; publish</button><button type="button" class="appearance-button versions-open">Saved versions</button><button type="button" class="appearance-button routes-open">Routes</button><button type="button" class="appearance-button preview-open">Preview</button><button type="button" class="appearance-button workspace-setup">Setup</button><button type="button" class="appearance-button project-context-button">Project context</button><button type="button" class="appearance-button selection-open">Selection controls</button><button type="button" class="appearance-button my-style-open">My Style</button><button type="button" class="appearance-button appearance-open">Appearance</button><a class="dashboard-link" target="_blank" rel="noopener">Dashboard</a><button type="button" class="review-close" aria-label="Close conversations">${icon('close')}</button></div></header><div class="review-body"><aside class="review-sidebar"><span class="review-caption">Your changes</span><select class="review-filter" aria-label="Filter conversations"><option value="all">All changes</option><option value="page">This page</option><option value="applied">Applied changes</option></select><div class="branch-guide"></div><div class="version-reminder"></div><div class="review-task-list"></div></aside><div class="review-detail"><p class="review-empty">Your changes and their conversations live here.<br><span class="selection-hint"></span></p></div></div></div></dialog>`;
    document.documentElement.append(host);
    const $ = <E extends HTMLElement = HTMLElement>(selector: string) => query<E>(shadow, selector);
    $<HTMLAnchorElement>('.dashboard-link').href = `${server}/#token=${encodeURIComponent(token)}`;
    const panel = $<HTMLFormElement>('.panel'), textarea = $<HTMLTextAreaElement>('textarea'), error = $('.error');
    let agentsReady = false, executionEnabled = false, currentBranch = '', workspaceKey = '';
    let selected: Element | undefined, context: ElementContext | undefined, previousFocus: Element | null, saving = false;
    let selectionStarted = false;
    const tasks = new Map<string, TaskSummary>(), markers = new Map<string, HTMLButtonElement>();
    const dialog = $<HTMLDialogElement>('.review-dialog');
    let selectedId: string | undefined, review: ReturnType<typeof createTaskReview> | undefined, refreshTimer: ReturnType<typeof setTimeout> | undefined, refreshSequence = 0, online = false;
    const api: Api = async <T>(endpoint: string, options: RequestInit = {}): Promise<T> => {
      const response = await fetch(server + endpoint, { ...options, signal: AbortSignal.any([controller.signal, options.signal || AbortSignal.timeout(15000)]),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`); return data;
    };
    const versions = createSavedVersions(shadow, api, () => { void load(); void refreshReview(); void flow.refresh(); }, () => { void flow.open('github'); });
    const flow = createBranchPublish(shadow, api, { onWorkspace: w => { currentBranch = w.branch; $('.branch-open').textContent = w.branch ? `Branch: ${w.branch}` : 'Branch & publish'; const key = `${w.id}:${w.kind}:${w.branch}`; if (workspaceKey && workspaceKey !== key) { void loadAgents(); void refreshReview(); void load(); } workspaceKey = key; }, onSaved: () => { void load(); void refreshReview(); void loadAgents(); }, openVersions: () => { void versions.open(); } });
    flow.attachNotice($('.branch-guide')); $('.branch-open').onclick = () => { void flow.open(); };
    versions.attachReminder($('.version-reminder'));
    $('.versions-open').onclick = () => { void versions.open(); };
    const appearance = createAppearance({ api, target: host, mount: shadow });
    const projectContext = createProjectContext({ api, mount: shadow });
    const composer = createTaskComposer(shadow, api, task => { update(task); void openReview(task.id); });
    const diagnostics = createDiagnostics(shadow, api);
    const preview = createPreview(shadow, api);
    $('.preview-open').onclick = () => { void preview.open(); };
    const myStyle = createMyStyle(shadow, api, seed => { void composer.open(undefined, seed); }, id => { void openReview(id); });
    $('.my-style-open').onclick = () => { void myStyle.open(context); };
    $('.style-target').onclick = () => { void myStyle.open(context); };
    const routes = createRouteReview(shadow, api, seed => { void composer.open(undefined, seed); });
    $('.routes-open').onclick = () => { void routes.open(); };
    $('.new-change').onclick = () => { void composer.open(); };
    $('.workspace-setup').onclick = () => { void diagnostics.open(); };
    const contextPicker = createContextPicker($('.capture-context'), api);
    $('.project-context-button').onclick = () => { void projectContext.open(); };
    $('.appearance-open').onclick = () => { void appearance.open(); };
    void appearance.load().catch(() => {});
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
        agentsReady = select.options.length > 0; executionEnabled = status.executionEnabled !== false;
        $('.hint').textContent = status.workspace && !status.workspace.ready ? 'Set up local version history in Branch & publish. You can save a draft now.' : executionEnabled ? 'Save a draft or start in a separate workspace. You review before applying.' : 'Execution is disabled. Save a draft without running anything.';
        syncSelection();
      } catch { agentsReady = false; $<HTMLButtonElement>('.save').disabled = true; $<HTMLButtonElement>('.save-draft').disabled = true; }
    };
    $('.copy-context').onclick = async () => {
      selectionInput.refresh();
      if (!context || !selectionInput.valid()) return;
      try {
        await navigator.clipboard.writeText(portableContext(context, textarea.value) + contextPicker.portable());
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
        const route = document.createElement('div'); route.className = 'route'; route.textContent = [task.context.route, task.baseBranch].filter(Boolean).join(' · ');
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
          review = createTaskReview($('.review-detail'), { api, currentBranch: () => currentBranch, onSaveVersions: () => { void versions.open(); }, executionEnabled: () => executionEnabled, onEditDraft: task => { void composer.open(task); }, onMutation: () => { void load(); void refreshReview(); } });
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
    $('.launcher').onclick = () => { selectionInput.cancel(); void openReview(); };
    $('.review-close').onclick = () => dialog.close();
    $<HTMLSelectElement>('.review-filter').onchange = renderList;
    const position = () => {
      selectionInput.refresh();
      for (const [id, marker] of markers) {
        const task = tasks.get(id)!;
        const target = contextElements(task.context).map(resolveElement).find(Boolean);
        marker.hidden = !target || task.context.route !== location.pathname || ['rejected', 'cancelled'].includes(task.status);
        if (target && !marker.hidden) {
          const rect = target.getBoundingClientRect();
          marker.style.left = `${Math.max(0, rect.left)}px`; marker.style.top = `${Math.max(0, rect.top - 23)}px`;
        }
      }
    };
    const close = () => { if (saving) return; panel.hidden = true; selectionInput.clear(); selectionStarted = false; if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true }); };
    const openSelection = () => {
      if (!selected || !context) return;
      if (document.activeElement !== host) previousFocus = document.activeElement;
      error.hidden = true; $('.copy-status').hidden = true; panel.hidden = false;
      const rect = selected.getBoundingClientRect();
      panel.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - 372))}px`;
      panel.style.top = `${Math.max(12, Math.min(rect.bottom + 10, innerHeight - 580))}px`;
      panel.style.maxHeight = `${innerHeight - parseFloat(panel.style.top) - 12}px`;
      position(); textarea.focus();
    };
    const pick = (target?: Element | null) => { if (target && !saving) selectionInput.replace(target); };
    $('.target-parent').onclick = () => pick(selected?.parentElement);
    $('.target-child').onclick = () => pick(selected?.firstElementChild);
    $('.target-next').onclick = () => pick(selected?.nextElementSibling);
    const syncSelection = () => {
      context = selectionInput.context(); selected = selectionInput.primary();
      if (context && !selectionStarted) { textarea.value = ''; selectionStarted = true; void contextPicker.load(); }
      const valid = selectionInput.valid(), count = selectionInput.count();
      $('.target').textContent = count > 1 ? `${count} elements · one conversation` : context?.selector || context?.tagName || 'No elements selected';
      $('.target-navigation').hidden = count !== 1;
      $('.target-hint').textContent = !count ? 'Select at least one element.' : !valid ? 'A target no longer matches. Select it again or remove it; your request is preserved.' : count > 1 ? 'Your request applies to this entire group. Source hints are unverified.' : context?.source ? 'Source hint supplied by this page · unverified' : 'Page element selected. Source file is not verified.';
      $<HTMLButtonElement>('.target-parent').disabled = !selected?.parentElement || selected.parentElement === document.documentElement;
      $<HTMLButtonElement>('.target-child').disabled = !selected?.firstElementChild;
      $<HTMLButtonElement>('.target-next').disabled = !selected?.nextElementSibling || selected.nextElementSibling === host;
      $<HTMLButtonElement>('.save').disabled = saving || !agentsReady || !executionEnabled || !valid;
      $<HTMLButtonElement>('.save-draft').disabled = saving || !agentsReady || !valid;
      $<HTMLButtonElement>('.copy-context').disabled = saving || !valid;
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'Tab' && !panel.hidden && !dialog.open) {
        const focusable = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled),textarea,select:not(:disabled),input:not(:disabled),summary')].filter(element => element.getClientRects().length > 0);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && shadow.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && shadow.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    const update = (task: TaskEvent) => {
      if ('deleted' in task || ['applied', 'undone'].includes(task.status)) void versions.refresh();
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
      markers.get(task.id)!.textContent = `${task.id}${task.context.elements ? ` · ${task.context.elements.length} elements` : ''} · ${task.status.replaceAll('_', ' ')}`; position(); renderList();
      if (selectedId === task.id && dialog.open) { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => void refreshReview(), 40); }
    };
    panel.addEventListener('submit', async event => {
      event.preventDefault(); if (saving || !agentsReady || !textarea.value.trim()) return;
      selectionInput.refresh(); if (!selectionInput.valid()) return;
      const draft = (event as SubmitEvent).submitter?.getAttribute('value') !== 'start';
      if (!draft && (!executionEnabled || !selected?.isConnected)) return;
      saving = true; $<HTMLButtonElement>('.save').disabled = true; $<HTMLButtonElement>('.save-draft').disabled = true; error.hidden = true;
      try {
        const response = await fetch(`${server}/api/tasks`, { method: 'POST', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ request: textarea.value, draft, kind: 'frontend', context, contextIds: contextPicker.value(), agent: $<HTMLSelectElement>('.agent-select').value }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error);
        update(data); saving = false; close(); await openReview(data.id);
      } catch (err) { error.textContent = errorMessage(err); error.hidden = false; }
      finally { saving = false; syncSelection(); }
    });
    $('.close').addEventListener('click', close);
    const selectionInput = createElementSelection({
      host, shadow, controls: () => selectionControls,
      available: () => !saving && !shadow.querySelector('dialog[open]'),
      capture: element => elementContext(element, { captureDom }), resolve: resolveElement,
      onChange: syncSelection, onReview: openSelection, onPicking: () => { panel.hidden = true; }, onCancel: () => { panel.hidden = true; selectionStarted = false; }
    });
    const selectionEditor = createSelectionControls(shadow, api, value => {
      selectionControls = value; selectionInput.cancel();
      const hint = shadow.querySelector('.selection-hint');
      if (hint) hint.textContent = `${pointerLabel(value)} to select, or use Pick element.`;
      $('.pick-launcher').title = `${pointerLabel(value)} · Focused element: ${keyboardLabel(value)}`;
    }, fallbackControls);
    const openControls = () => { selectionInput.cancel(); void selectionEditor.open(); };
    $('.controls-launcher').onclick = openControls; $('.selection-open').onclick = openControls;
    if (token) void selectionEditor.load().catch(() => {});
    document.addEventListener('keydown', keydown, true);
    let positionFrame = 0;
    const schedulePosition = () => { if (!positionFrame) positionFrame = requestAnimationFrame(() => { positionFrame = 0; position(); }); };
    const observer = new MutationObserver(schedulePosition); observer.observe(document.body, { childList: true, subtree: true, characterData: true });
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
      $('.dot').style.background = connected ? 'var(--dr-success)' : 'var(--dr-warning)'; if (connected) { flow.start(); void versions.refresh(); void load(); void loadAgents(); void appearance.load().catch(() => {}); void selectionEditor.load().catch(() => {}); }
    }, value => appearance.receive(value), value => selectionEditor.receive(value), () => { void versions.refresh(); void refreshReview(); }, () => { void flow.refresh(); }, () => flow.receiveGitHub());
    return { destroy() { clearTimeout(refreshTimer); controller.abort(); flow.destroy(); versions.destroy(); appearance.destroy(); projectContext.destroy(); dialog.close(); review?.destroy(); selectionInput.destroy(); selectionEditor.destroy(); document.removeEventListener('keydown', keydown, true); window.removeEventListener('scroll', position, true); window.removeEventListener('resize', position); observer.disconnect(); cancelAnimationFrame(positionFrame); composer.destroy(); myStyle.destroy(); diagnostics.destroy(); preview.destroy(); routes.destroy(); host.remove(); } };
  }
};
