import type { Api } from '../../contracts/src/index.js';
import { errorMessage, query } from '../../contracts/src/index.js';
import { mountBrandLogos } from '../../overlay/src/brand.js';
import { createAppearance, themeDefaults } from '../../overlay/src/appearance.js';
interface Answers { goal: string; objective: string; audience: string; data: string; accounts: boolean; payments: boolean; budget: string }
interface Diagnosis { recommended: string; reason: string; nextSteps: string[]; costNote: string }
interface Template { id: string; name: string; description: string; stack: string; requiresNode: boolean }
interface Project { id: string; name: string; path: string; status: string; template: string; url?: string }
interface Library { projects: Project[]; templates: Template[]; defaultParent: string; nodeAvailable: boolean; npmAvailable: boolean; gitAvailable: boolean; folderPickerAvailable: boolean }
interface Plan { id: string; name: string; path: string; template: string; files: string[]; diagnosis: Diagnosis }
const $ = <E extends HTMLElement = HTMLElement>(s: string) => query<E>(document, s);
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const n = document.createElement(tag); n.textContent = text; return n; };
mountBrandLogos();
const params = new URLSearchParams(location.hash.slice(1));
const token = params.get('token') || sessionStorage.getItem('nudgethis-token') || '';
if (params.has('token')) { sessionStorage.setItem('nudgethis-token', token); history.replaceState(null, '', location.pathname); }
const api: Api = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const response = await fetch(path, { ...options, signal: options.signal || AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`); return data;
};
const post = <T>(path: string, value: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(value) });
const defaults = el('style', themeDefaults); document.head.append(defaults);
const appearance = createAppearance({ api, target: document.documentElement, mount: document.body });
$('#appearance').onclick = () => { void appearance.open(); }; void appearance.load().catch(() => {});
let library: Library | undefined, busy = false, entry = 'idea', chosen = '', name = '', parent = '', diagnosis: Diagnosis | undefined;
let answers: Answers = { goal: 'website', objective: '', audience: '', data: 'none', accounts: false, payments: false, budget: 'free' };
const builder = $('#builder');
const notice = (e?: unknown) => { $('#notice').textContent = e ? errorMessage(e) : ''; $('#notice').hidden = !e || !builder.hidden; builder.querySelector('.builder-error')?.remove(); if (e && !builder.hidden) { const message = el('p', errorMessage(e)); message.className = 'builder-error error'; message.setAttribute('role', 'alert'); message.tabIndex = -1; builder.querySelector('header')?.after(message); message.focus(); } };
async function run(action: () => Promise<void>) {
  if (busy) return; busy = true; notice();
  document.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.disabled = true);
  builder.setAttribute('aria-busy', 'true');
  try { await action(); } catch (e) { notice(e); }
  finally { busy = false; builder.removeAttribute('aria-busy'); document.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.disabled = false); }
}
function button(label: string, action: () => void, primary = false) { const b = el('button', label); b.type = 'button'; if (primary) b.className = 'primary'; b.onclick = action; return b; }
function stage(title: string, step: string) {
  builder.hidden = false; builder.replaceChildren();
  const header = el('header'), caption = el('div'), p = el('p', step); p.className = 'eyebrow'; caption.append(p, el('h2', title));
  header.append(caption, button('Close', () => { builder.hidden = true; document.querySelectorAll('[data-entry]').forEach(b => b.setAttribute('aria-pressed', 'false')); })); builder.append(header);
  const heading = query<HTMLHeadingElement>(builder, 'h2'); heading.tabIndex = -1; heading.focus({ preventScroll: true });
}
async function chooseFolder(input: HTMLInputElement) {
  const result = await api<{ path?: string }>('/api/starter/pick-folder', { method: 'POST', body: '{}', signal: AbortSignal.timeout(125000) });
  if (result.path) input.value = result.path;
}
function starterPicker() {
  if (!library) return;
  stage('Skip the blank page.', 'CHOOSE A STARTER');
  const options = el('div'); options.className = 'starter-options';
  for (const template of library.templates) {
    const card = el('div'); card.className = 'note'; card.append(el('h3', template.name), el('p', template.description), el('p', template.stack), button(`Choose ${template.name}`, () => { chosen = template.id; answers.goal = template.id === 'react' ? 'app' : template.id === 'astro' ? 'content' : 'website'; objectiveForm(); })); options.append(card);
  }
  builder.append(options, el('p', 'Next, add your goal so the project remembers what it is for.'));
}
function objectiveForm() {
  stage(entry === 'starter' ? 'Give your starter a purpose.' : 'What would you like to make?', '01 / YOUR IDEA');
  const form = el('form');
  form.innerHTML = `<div class="fields"><div><label for="goal">What are you building?</label><select id="goal" name="goal"><option value="website">A website or portfolio</option><option value="content">A blog or content website</option><option value="app">An interactive app</option><option value="unsure">I’m not sure yet</option></select></div><div><label for="audience">Who is it for?</label><input id="audience" name="audience" required maxlength="240" placeholder="For example, customers of my bakery"></div></div><label for="objective">What should people be able to do?</label><textarea id="objective" name="objective" required maxlength="1200" rows="3" placeholder="See our menu and find our shop…"></textarea><div class="fields"><div><label for="data">Will it need to remember information?</label><select id="data" name="data"><option value="none">No, just show pages</option><option value="device">On one person’s device</option><option value="shared">Shared between people or devices</option><option value="unsure">Help me decide later</option></select></div><div><label for="budget">Budget for external services</label><select id="budget" name="budget"><option value="free">Start with free options</option><option value="flexible">Flexible</option><option value="unsure">I haven’t decided</option></select></div></div><div class="fields"><label><input type="checkbox" name="accounts">People will need accounts</label><label><input type="checkbox" name="payments">People will make payments</label></div><p class="muted">These answers guide the starter and become your Project context. Features such as payments and sign-in still need to be built.</p><div class="actions"><button class="primary" type="submit">Find my starting point →</button></div>`;
  for (const [key, value] of Object.entries(answers)) { const input = form.elements.namedItem(key) as HTMLInputElement; if (typeof value === 'boolean') input.checked = value; else input.value = value; }
  form.onsubmit = e => { e.preventDefault(); const data = new FormData(form); answers = { goal: String(data.get('goal')), objective: String(data.get('objective')).trim(), audience: String(data.get('audience')).trim(), data: String(data.get('data')), budget: String(data.get('budget')), accounts: data.has('accounts'), payments: data.has('payments') }; void run(async () => { diagnosis = await post<Diagnosis>('/api/starter/diagnose', answers); if (!chosen) chosen = diagnosis.recommended; setupForm(); }); };
  builder.append(form);
}
function setupForm() {
  if (!library || !diagnosis) return;
  stage('A starting point that fits.', '02 / YOUR STARTER');
  builder.append(el('p', diagnosis.reason));
  const form = el('form'), options = el('div'); options.className = 'starter-options';
  for (const template of library.templates) {
    const label = el('label'), radio = el('input'); radio.type = 'radio'; radio.name = 'template'; radio.value = template.id; radio.checked = chosen === template.id;
    label.append(radio, el('strong', template.name), el('span', template.stack), el('span', template.description), el('span', template.id === diagnosis.recommended ? 'Recommended for your answers' : template.requiresNode ? 'Requires Node.js + npm' : 'No additional tools required')); options.append(label);
  }
  form.append(options); const fields = el('div'); fields.innerHTML = `<div class="fields"><div><label for="project-name">Project folder name</label><input id="project-name" name="name" required maxlength="64" pattern="[a-z][a-z0-9-]*" placeholder="my-first-project"><p class="muted">Lowercase letters, numbers and hyphens.</p></div><div><label for="project-parent">Save inside this folder</label><input id="project-parent" name="parent" required><p class="muted">We create a new folder here. Existing files stay in place.</p></div></div>`;
  const projectName = query<HTMLInputElement>(fields, '#project-name'), projectParent = query<HTMLInputElement>(fields, '#project-parent'); projectName.value = name; projectParent.value = parent || library.defaultParent;
  if (library.folderPickerAvailable) query(fields, '.fields>div:last-child').append(button('Choose folder', () => { void run(() => chooseFolder(projectParent)); }));
  form.append(fields, el('p', diagnosis.costNote));
  if (!library.gitAvailable) form.append(el('p', 'Git is not installed. You can create and preview a project now; install Git later to save versions and work with an agent.'));
  const remember = () => { name = projectName.value; parent = projectParent.value; chosen = String(new FormData(form).get('template')); };
  const actions = el('div'); actions.className = 'actions'; const submit = el('button', 'Review project setup →'); submit.type = 'submit'; submit.className = 'primary'; actions.append(button('Back', () => { remember(); objectiveForm(); }), submit); form.append(actions);
  form.onsubmit = e => { e.preventDefault(); remember(); void run(async () => { const plan = await post<Plan>('/api/starter/plan', { name, parent, template: chosen, answers }); reviewPlan(plan); }); };
  builder.append(form);
}
function reviewPlan(plan: Plan) {
  stage('Your first version starts here.', '03 / REVIEW & CREATE');
  builder.append(el('p', `Create ${plan.name} with ${library?.templates.find(t => t.id === plan.template)?.name || plan.template}.`), el('pre', plan.path));
  const note = el('p', plan.template === 'website' ? 'This starter previews immediately using NudgeThis. No package installation is needed.' : 'After creation, Project preview will show the dependency installation and development command for your approval. Node.js 22.12 or newer and npm are required.'); note.className = 'note'; builder.append(note);
  const files = el('details'); files.append(el('summary', `${plan.files.length} project files to create`), el('pre', plan.files.join('\n'))); builder.append(files, el('h3', 'What comes next'));
  const list = el('ul'); plan.diagnosis.nextSteps.forEach(step => list.append(el('li', step))); builder.append(list, el('p', 'Your goal and decisions will be saved in Project context. Creating the folder does not run an agent, initialize Git or publish anything.'));
  const actions = el('div'); actions.className = 'actions'; actions.append(button('Back', setupForm), button('Create project', () => { void run(async () => { const record = await post<Project>('/api/starter/create', { previewId: plan.id, confirm: true }); await refresh(); stage('You have a starting point.', 'READY TO MAKE IT YOURS'); builder.append(el('p', `${record.name} was created on this computer.`), el('pre', record.path), el('p', 'Open your workspace to start the preview, explore Project context and save your first version. Agent execution starts disabled.')); const open = await post<{ url: string }>('/api/starter/open', { id: record.id }); const link = el('a', 'Open workspace & preview →'); link.href = `${open.url}&preview=1`; link.target = '_blank'; link.rel = 'noopener'; builder.append(link); await refresh(); }); }, true)); builder.append(actions);
}
function existingForm() {
  stage('Bring your project along.', 'OPEN AN EXISTING FOLDER'); const form = el('form');
  form.innerHTML = '<p>Choose the project root on this computer. NudgeThis stores local preferences in its <code>.nudgethis</code> folder. Source files are preserved and agents stay disabled.</p><label for="existing-path">Project folder</label><input id="existing-path" required placeholder="Absolute path to your project"><div class="actions"><button type="submit" class="primary">Add to my projects</button></div>';
  const input = query<HTMLInputElement>(form, 'input'); if (library?.folderPickerAvailable) query(form, '.actions').prepend(button('Choose folder', () => { void run(() => chooseFolder(input)); }));
  form.onsubmit = e => { e.preventDefault(); void run(async () => { await post('/api/starter/import', { path: input.value, confirm: true }); builder.hidden = true; await refresh(); }); }; builder.append(form);
}
async function refresh() {
  library = await api<Library>('/api/starter'); const list = $('#projects'); list.replaceChildren();
  if (!library.projects.length) { const empty = el('div', 'No projects yet. Choose a starting point above — you don’t need a repository or a GitHub account.'); empty.className = 'empty'; list.append(empty); }
  for (const project of library.projects) {
    const row = el('article'), info = el('div'), actions = el('div'); row.className = 'project-row'; actions.className = 'actions';
    info.append(el('strong', project.name), el('p', project.path), el('p', project.status === 'ready' ? `${project.template === 'existing' ? 'Existing project' : project.template} · ${project.url ? 'Workspace open' : 'On this computer'}` : 'Creation interrupted · files preserved'));
    if (project.url) { const link = el('a', 'Open workspace ↗'); link.href = project.url; link.target = '_blank'; link.rel = 'noopener'; actions.append(link, button('Close workspace', () => { void run(async () => { await post('/api/starter/close', { id: project.id }); await refresh(); }); })); }
    else actions.append(button('Open workspace', () => { void run(async () => { await post('/api/starter/open', { id: project.id }); await refresh(); }); }, true));
    actions.append(button('Remove from list', () => { stage('Remove this library entry?', 'YOUR FILES STAY ON THIS COMPUTER'); builder.append(el('p', `This closes the workspace for ${project.name} and removes it from this list. You can add the folder again later.`), el('pre', project.path), button('Remove from list', () => { void run(async () => { await post('/api/starter/remove', { id: project.id, confirm: true }); builder.hidden = true; await refresh(); }); })); }));
    row.append(info, actions); list.append(row);
  }
}
document.querySelectorAll<HTMLButtonElement>('[data-entry]').forEach(b => { b.onclick = () => { void run(async () => { if (!library) await refresh(); entry = b.dataset.entry!; document.querySelectorAll('[data-entry]').forEach(n => n.setAttribute('aria-pressed', String(n === b))); if (entry === 'existing') existingForm(); else if (entry === 'starter') starterPicker(); else objectiveForm(); builder.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); }); }; });
$('#refresh').onclick = () => { void run(refresh); };
$('#quit').onclick = () => { stage('Close NudgeThis?', 'YOUR PROJECTS ARE SAVED'); builder.append(el('p', 'This stops the welcome, open workspaces and their local previews. Your project files stay on this computer. Open NudgeThis again to continue.'), button('Quit NudgeThis', () => { void run(async () => { await post('/api/shutdown', {}); document.querySelectorAll('main section').forEach(n => (n as HTMLElement).hidden = true); builder.hidden = false; builder.replaceChildren(el('h2', 'See you next time.'), el('p', 'NudgeThis has stopped. You can close this tab.')); }); })); };
void refresh().catch(e => { $('#projects').textContent = 'Open the welcome link from NudgeThis to connect, or refresh after restarting it.'; notice(e); });
