import type { Api, GitHubStatus, GitHubProposal, WorkspaceState, VersionPreview, VersionIdentity, PublishPreview, MergePreview } from '../../contracts/src/index.js';
import { errorMessage } from '../../contracts/src/index.js';
import { shell } from './workspace.js';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') => { const n = document.createElement(tag); n.textContent = text; n.className = className; return n; };
const dirty = (w: WorkspaceState['dirty']) => w.staged + w.unstaged + w.untracked > 0;
const styles = `.nt-branch-notice{font:var(--dr-size)/1.55 var(--dr-font-body);color:var(--dr-text);background:var(--dr-accentSoft);border:1px solid var(--dr-border);border-radius:var(--dr-radius);padding:18px;margin:16px 0}.nt-branch-notice[hidden]{display:none}.nt-branch-notice strong{font-family:var(--dr-font-heading);font-size:18px}.nt-branch-notice p{margin:7px 0;color:var(--dr-muted)}.nt-branch-notice button{font:inherit;border:1px solid var(--dr-border);border-radius:var(--dr-radius);padding:9px 12px;background:var(--dr-surface);color:var(--dr-text);cursor:pointer}.nt-branch-notice button.primary{background:var(--dr-accent);color:var(--dr-onAccent);border-color:var(--dr-accent)}.nt-branch-notice button:focus-visible{outline:2px solid var(--dr-accent);outline-offset:3px}.nt-branch-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.nt-flow-nav{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}.nt-flow-nav [aria-pressed=true]{background:var(--dr-accentSoft);color:var(--dr-accent);border-color:var(--dr-accent)}.nt-flow-summary{padding:14px;border:1px solid var(--dr-border);border-radius:var(--dr-radius);overflow-wrap:anywhere}.nt-flow-summary strong,.nt-flow-summary small{display:block}.nt-flow-summary small{color:var(--dr-muted)}.nt-flow-choice{display:flex!important;gap:10px;align-items:flex-start;overflow-wrap:anywhere;margin:0!important;padding:9px 0;border-bottom:1px solid var(--dr-border)}.nt-flow-choice input{width:20px!important;height:20px;flex:0 0 20px;accent-color:var(--dr-accent)}.nt-flow-list{max-height:280px;overflow:auto}.nt-flow-diff{max-height:300px}.nt-workspace-dialog .nt-flow-content :is(h3,p,li){overflow-wrap:anywhere}.nt-flow-content a{color:var(--dr-accent)}.nt-flow-state{color:var(--dr-accent)!important;font-weight:700}.nt-flow-error{color:var(--dr-danger)}.nt-flow-basics dt{font-weight:700;margin-top:12px}.nt-flow-basics dd{margin:4px 0 0;color:var(--dr-muted)}`;

export function createBranchPublish(mount: HTMLElement | ShadowRoot, api: Api, options: { onWorkspace: (w: WorkspaceState) => void; onSaved: () => void; openVersions: () => void }) {
  const ui = shell(mount, 'Branch & publish'), style = el('style', styles), nav = el('nav', '', 'nt-flow-nav'), content = el('div', '', 'nt-flow-content'), alert = el('p', '', 'nt-workspace-error');
  nav.setAttribute('aria-label', 'Git workflow'); alert.setAttribute('role', 'alert'); alert.hidden = true; ui.dialog.append(nav, content, alert); mount.append(style);
  let workspace: WorkspaceState | undefined, github: GitHubStatus | undefined, notice: HTMLElement | undefined, busy = false, destroyed = false;
  let view = 'branch', publishing: PublishPreview | undefined, fetching: Promise<void> | undefined, poll: ReturnType<typeof setInterval> | undefined;
  const button = (text: string, action: () => void, primary = false) => { const b = el('button', text, primary ? 'primary' : ''); b.type = 'button'; b.onclick = action; return b; };
  const link = (label: string, href: string) => { const a = el('a', label); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };
  const error = (message: string) => { alert.textContent = message; alert.hidden = !message; if (message && ui.dialog.open) alert.scrollIntoView({ block: 'nearest' }); };
  const controls = (value: boolean) => { busy = value; ui.close.disabled = value; ui.dialog.setAttribute('aria-busy', String(value)); ui.dialog.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>('button,input,select,textarea').forEach(n => { n.disabled = value || (n.dataset.merge === 'true' && n.dataset.allowed !== 'true'); }); };
  const run = async (work: () => Promise<void>) => { if (busy) return; error(''); controls(true); try { await work(); } catch (e) { if (!destroyed) error(errorMessage(e)); } finally { if (!destroyed) { controls(false); updateNav(); } } };
  const post = <T>(data: unknown) => api<T>('/api/github', { method: 'POST', body: JSON.stringify(data), signal: AbortSignal.timeout(300000) });
  const local = <T>(path: string, data: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(data), signal: AbortSignal.timeout(150000) });
  const actions = (...buttons: HTMLElement[]) => { const row = el('div', '', 'nt-workspace-actions'); row.append(...buttons); content.append(row); };
  const field = (parent: HTMLElement, label: string, value = '', type = 'text', limit = 240) => { const wrap = el('label', label), input = el('input'); input.type = type; input.value = value; input.maxLength = limit; input.required = true; wrap.append(input); parent.append(wrap); return input; };
  const select = (parent: HTMLElement, label: string, items: Array<[string, string]>) => { const wrap = el('label', label), input = el('select'); input.setAttribute('aria-label', label); for (const [value, title] of items) { const o = el('option', title); o.value = value; input.append(o); } wrap.append(input); parent.append(wrap); return input; };
  const details = (diff: string, files?: string[]) => { const d = el('details'); d.append(el('summary', 'View files and technical diff')); if (files) { const list = el('ul'); files.forEach(f => list.append(el('li', f))); d.append(list); } d.append(el('pre', diff || 'No file differences.', 'nt-flow-diff')); content.append(d); };
  const acknowledgement = () => workspace ? `${workspace.id}:${workspace.kind}:${workspace.branch}` : '';
  const remember = () => { try { sessionStorage.setItem('nudgethis-branch-choice', acknowledgement()); } catch { /* Session storage is optional. */ } renderNotice(); };
  const renderNotice = () => {
    if (!notice || !workspace) return;
    let acknowledged = false; try { acknowledged = sessionStorage.getItem('nudgethis-branch-choice') === acknowledgement(); } catch { /* Private browsers can disable storage. */ }
    notice.hidden = workspace.ready && acknowledged && !workspace.operation;
    notice.replaceChildren();
    if (workspace.ready) {
      notice.append(el('strong', `You’re working on ${workspace.branch}`), el('p', workspace.operation ? 'A Git operation needs attention before you change branches.' : 'A branch keeps a separate line of work. Choose where this session’s changes should go.'));
      const row = el('div', '', 'nt-branch-actions'); row.append(button('Create a working branch', () => { void open('branch'); }, workspace.branch === workspace.defaultBranch), button(`Continue on ${workspace.branch}`, remember, workspace.branch !== workspace.defaultBranch), button('Choose another branch', () => { void open('branch'); })); notice.append(row);
    } else {
      const titles: Record<string, string> = { missing_git: 'Version history needs Git', no_repository: 'Start keeping versions of this project', unborn: 'Save your first project version', detached: 'Choose a branch for this work', nested_folder: 'Open the project’s root folder', unavailable: 'Git needs attention' };
      notice.append(el('strong', titles[workspace.kind]), el('p', 'You can keep drafts and project context here. Set up local version history before running changes; GitHub is optional.'), button(workspace.kind === 'no_repository' ? 'Enable version history' : 'Open workspace guide', () => { void open('branch'); }, true));
    }
  };
  const refresh = async (fresh = false): Promise<void> => {
    if (destroyed) return; if (fetching) { await fetching; if (!fresh || destroyed) return; }
    fetching = (async () => {
      try {
        const next = await api<WorkspaceState>('/api/workspace'); if (destroyed) return;
        const changed = !!workspace && (next.branch !== workspace.branch || next.kind !== workspace.kind || next.id !== workspace.id);
        if (publishing && (publishing.branch !== next.branch || publishing.head !== next.head)) publishing = undefined;
        workspace = next; options.onWorkspace(next); renderNotice();
        if (changed && ui.dialog.open && !busy) { view = 'branch'; renderBranch(); error('Your workspace changed outside this window. Choose where to continue.'); updateNav(); }
      } catch (e) { if (ui.dialog.open && !busy && !destroyed) error(errorMessage(e)); }
      finally { fetching = undefined; }
    })(); return fetching;
  };
  const loadGitHub = async () => { github = await api<GitHubStatus>('/api/github'); if (publishing && (publishing.target.id !== github.target?.id || publishing.account !== github.account)) publishing = undefined; };
  const updateNav = () => { nav.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.view === view)); b.disabled = busy; }); };
  const showBasics = () => {
    view = 'basics'; content.replaceChildren(el('h3', 'A few words, explained'));
    const dl = el('dl', '', 'nt-flow-basics');
    for (const [term, meaning] of [['Repository', 'Your project with a record of its versions. A local repository stays on this computer.'], ['Branch', 'A separate line of work. Changes can later be combined with another branch. Uncommitted edits are not automatically isolated by branches.'], ['Commit / version', 'A named checkpoint of changes you chose to save.'], ['Publish / push', 'Send saved commits and their history to a remote repository such as GitHub.'], ['Pull request / proposal', 'Ask to bring changes from a working branch into another branch.'], ['Merge', 'Integrate the proposal on GitHub after review and required checks.'], ['Deploy', 'Update the running website or app. This happens only if the project has a deployment process.']]) dl.append(el('dt', term), el('dd', meaning));
    content.append(dl); updateNav();
  };
  const renderBranch = () => {
    if (!workspace) return; view = 'branch'; content.replaceChildren(); const w = workspace;
    if (w.kind === 'missing_git') { content.append(el('h3', 'Install Git to enable version history'), el('p', 'Your drafts and context stay available. Install Git, restart NudgeThis so it can find it, then return here.'), link('Get Git', 'https://git-scm.com/downloads')); return; }
    if (w.kind === 'nested_folder') { content.append(el('h3', 'This folder belongs to a larger repository'), el('p', 'Open NudgeThis from the repository root. Creating another repository inside it could split the project’s history.'), el('pre', w.rootHint)); return; }
    if (w.kind === 'unavailable') { content.append(el('h3', 'Git metadata needs attention'), el('p', 'The folder contains Git metadata that cannot be read. Inspect it in your Git client, then refresh. Your files have been kept.')); actions(button('Refresh workspace', () => { void run(async () => { await refresh(); renderBranch(); }); })); return; }
    if (w.kind === 'no_repository') {
      content.append(el('h3', 'Keep versions on this computer'), el('p', 'Git records checkpoints so you can understand how your project changed. Enabling it creates local history; it does not create a GitHub repository or publish files.'));
      const form = el('form'), branch = field(form, 'Initial branch name', 'main', 'text', 120); content.append(form);
      form.append(el('p', 'Local state, common credential filenames and generated folders will be excluded. You will review the source files before saving the first version.', 'nt-workspace-note'));
      const submit = el('button', 'Enable version history', 'primary'); submit.type = 'submit'; form.append(submit);
      form.onsubmit = e => { e.preventDefault(); void run(async () => { await local('/api/workspace/initialize', { confirm: true, branch: branch.value.trim() }); await refresh(true); await initialFiles(); }); }; return;
    }
    if (w.kind === 'unborn') { content.append(el('h3', 'Your local history is ready to begin'), el('p', 'Save a first version of the source files you choose. This gives future changes a starting point. Nothing is sent to GitHub.')); actions(button('Choose files for first version', () => { void run(initialFiles); }, true)); return; }
    content.append(el('h3', w.kind === 'detached' ? 'This version is not on a branch' : `You’re working on ${w.branch}`), el('p', 'A branch is a separate line of work. Use one to develop changes before combining them with your main work.'));
    if (w.branch === w.defaultBranch) content.append(el('p', w.defaultSource === 'remote' ? 'This is the repository’s default branch. A working branch gives your next changes a separate place for review.' : 'This branch uses a conventional main-branch name. Consider a working branch for your next changes.', 'nt-workspace-note'));
    content.append(el('p', `${w.dirty.staged} staged · ${w.dirty.unstaged} edited · ${w.dirty.untracked} untracked entries`));
    if (w.operation) content.append(el('p', 'Finish the current merge, rebase or Git operation in your Git client before changing branches.', 'nt-workspace-error'));
    const form = el('form'), branch = field(form, 'New working branch', '', 'text', 120); branch.placeholder = 'improve-checkout';
    let carry: HTMLInputElement | undefined;
    if (dirty(w.dirty)) { const label = el('label', '', 'nt-flow-choice'); carry = el('input'); carry.type = 'checkbox'; label.append(carry, el('span', 'Keep my existing local edits in the new branch. Applied NudgeThis corrections must be saved or undone first.')); form.append(label); }
    const create = el('button', 'Create a working branch', 'primary'); create.type = 'submit'; form.append(create); content.append(form);
    form.onsubmit = e => { e.preventDefault(); void run(async () => { await local('/api/workspace/branch', { action: 'create', name: branch.value.trim(), expected: { head: w.head, branch: w.branch }, carryChanges: carry?.checked ?? false }); await refresh(true); remember(); renderBranch(); options.onSaved(); }); };
    const choices = w.branches.filter(b => b !== w.branch);
    if (choices.length) {
      const chooser = select(content, 'Existing branch', choices.map(b => [b, b]));
      if (dirty(w.dirty)) content.append(el('p', 'Save your changes before switching to an existing branch. No files will be discarded or stashed automatically.'));
      actions(button('Switch to selected branch', () => { void run(async () => { await local('/api/workspace/branch', { action: 'switch', name: chooser.value, expected: { head: w.head, branch: w.branch } }); await refresh(true); remember(); renderBranch(); options.onSaved(); }); }));
    }
    content.append(el('p', 'Conversations keep their original branch. Return to it to apply their patches; switching does not move conversations.'));
    actions(button('Review applied changes', () => { ui.dialog.close(); options.openVersions(); }), button(w.kind === 'detached' ? 'Close guide' : `Continue on ${w.branch}`, () => { remember(); ui.dialog.close(); })); updateNav();
  };
  const initialFiles = async () => {
    const data = await api<{ files: string[]; excluded: number; identity: VersionIdentity }>('/api/workspace/initial-files'); view = 'initial';
    content.replaceChildren(el('h3', 'Choose the starting point'), el('p', 'Review the files included in your first local version. Filename exclusions help, but they are not a complete secret scan.'));
    if (data.excluded) content.append(el('p', `${data.excluded} additional private, generated, linked or oversized paths were excluded.`));
    const list = el('div', '', 'nt-flow-list'), inputs: Array<{ path: string; input: HTMLInputElement }> = [];
    for (const path of data.files) { const label = el('label', '', 'nt-flow-choice'), input = el('input'); input.type = 'checkbox'; input.checked = true; label.append(input, el('span', path)); list.append(label); inputs.push({ path, input }); }
    content.append(list);
    actions(button('Back', renderBranch), button('Review first version', () => { void run(async () => { const plan = await local<VersionPreview>('/api/workspace/initial-preview', { files: inputs.filter(p => p.input.checked).map(p => p.path) }); initialReview(plan); }); }, true));
  };
  const initialReview = (plan: VersionPreview) => {
    view = 'initial-review'; content.replaceChildren(el('h3', 'Review your first version'), el('p', `${plan.files.length} source files · ${plan.repository.branch} · stays on this computer`)); details(plan.diff, plan.files);
    const form = el('form'), title = field(form, 'Version name', plan.suggestedMessage), name = field(form, 'Author name', plan.identity.name, 'text', 160), email = field(form, 'Author email', plan.identity.email, 'email', 254);
    form.append(el('p', 'Git records this name and email. They become visible if you publish; a GitHub private email is supported. Your Git settings stay unchanged.'));
    const save = el('button', 'Save first version', 'primary'); save.type = 'submit'; form.append(save); content.append(form);
    form.onsubmit = e => { e.preventDefault(); void run(async () => { await local('/api/versions/save', { previewId: plan.id, message: title.value.trim(), identity: { name: name.value.trim(), email: email.value.trim() } }); await refresh(true); options.onSaved(); view = 'done'; content.replaceChildren(el('h3', 'Your first version is saved.'), el('p', 'You can now create a working branch and review changes. GitHub remains optional.')); actions(button('Choose a working branch', renderBranch, true), button('Connect GitHub', () => { void open('github'); })); }); };
  };
  const renderTargetForm = () => {
    const form = el('form'), repository = field(form, 'GitHub repository', github?.target?.fullName || github?.suggestedTarget || ''); repository.placeholder = 'username/project'; const connect = el('button', 'Connect repository', 'primary'); connect.type = 'submit'; form.append(connect); content.append(form);
    form.onsubmit = e => { e.preventDefault(); void run(async () => { await post({ action: 'target', repository: repository.value.trim() }); await loadGitHub(); renderGitHub(); }); };
    const details = el('details'); details.append(el('summary', 'Create a repository on GitHub')); const create = el('form'), name = field(create, 'Repository name', '', 'text', 100), visibility = select(create, 'Repository visibility', [['private', 'Private — only people with access'], ['public', 'Public — anyone can see it']]);
    const next = el('button', 'Review repository setup'); next.type = 'submit'; create.append(next); details.append(create); content.append(details);
    create.onsubmit = e => { e.preventDefault(); const account = github?.account, chosen = name.value.trim(), isPrivate = visibility.value === 'private'; view = 'create-repository'; content.replaceChildren(el('h3', `Create ${account}/${chosen}`), el('p', isPrivate ? 'Only people with access can see this repository.' : 'Anyone will be able to view this repository and anything you publish to it.'), el('p', 'The repository starts empty. Your local files are uploaded only after you review and choose Publish to GitHub.')); actions(button('Back', renderGitHub), button('Create repository', () => { void run(async () => { await post({ action: 'create', account, name: chosen, private: isPrivate, confirm: true }); await loadGitHub(); renderGitHub(); }); }, true)); };
  };
  const renderGitHub = () => {
    if (!github || !workspace) return; view = 'github'; content.replaceChildren(el('h3', 'Share when you’re ready'), el('p', 'Saved on this computer → Published to GitHub → Ready to merge → Merged', 'nt-flow-state'));
    if (!github.available) { content.append(el('p', 'GitHub publishing uses GitHub CLI. Local versions and branches work without it. Install the CLI and restart NudgeThis to continue.'), link('Install GitHub CLI', 'https://cli.github.com/')); return; }
    if (!github.account) {
      content.append(el('p', 'Connect the account you choose for this session. Existing GitHub CLI accounts and global Git settings are not changed.'));
      const form = el('form'), username = field(form, 'GitHub username', '', 'text', 100), method = select(form, 'Connection method', [['cli', 'An account already signed in to GitHub CLI'], ['token', 'A token for this session']]), token = field(form, 'GitHub token', '', 'password', 512); token.autocomplete = 'off'; token.required = false; token.parentElement!.hidden = true;
      method.onchange = () => { token.parentElement!.hidden = method.value !== 'token'; token.required = method.value === 'token'; };
      form.append(el('p', 'Tokens remain in server memory for this session. They are not saved in the project, sent to an agent or added to Git configuration.'));
      const connect = el('button', 'Connect GitHub', 'primary'); connect.type = 'submit'; form.append(connect); content.append(form);
      content.append(link('GitHub CLI sign-in help', 'https://cli.github.com/manual/gh_auth_login'));
      form.onsubmit = e => { e.preventDefault(); void run(async () => { try { await post({ action: 'connect', username: username.value.trim(), method: method.value, token: token.value }); } finally { token.value = ''; } await loadGitHub(); renderGitHub(); }); }; return;
    }
    content.append(el('p', `Connected as ${github.account}`));
    if (!github.target) { renderTargetForm(); actions(button('Disconnect account', () => { void run(async () => { await post({ action: 'disconnect' }); await loadGitHub(); renderGitHub(); }); })); return; }
    const target = github.target, summary = el('div', '', 'nt-flow-summary'); summary.append(el('strong', target.fullName), el('small', `${target.private ? 'Private' : 'Public'} repository · branch ${workspace.branch || 'not ready'}`), link('Open repository', target.url)); content.append(summary);
    if (!workspace.ready) { content.append(el('p', 'Save your first local version and choose a branch before publishing.')); actions(button('Set up local history', renderBranch, true)); return; }
    const last = github.last, proposal = last?.proposal, merged = proposal?.merged && proposal.head === workspace.head;
    if (last) content.append(el('p', `Last checked: ${new Date(last.checkedAt).toLocaleString()}. Use Refresh GitHub status to check remote changes.`));
    const published = last?.head === workspace.head;
    content.append(el('p', merged ? 'Merged on GitHub. Your local branch is unchanged.' : published ? 'This local version is published on GitHub.' : 'Review which saved versions are ready to publish.', 'nt-flow-state'));
    const refreshRemote = button('Refresh GitHub status', () => { void run(async () => { await post({ action: 'refresh' }); await loadGitHub(); renderGitHub(); }); });
    actions(refreshRemote, button('Review publishing', () => { void run(async () => { publishing = await post<PublishPreview>({ action: 'preview' }); renderPublish(publishing); }); }, true));
    if (proposal && !proposal.merged && proposal.state === 'open') {
      content.append(el('h3', proposal.title), link('View proposal on GitHub', proposal.url));
      actions(button('Review & merge', () => { void run(async () => { renderMerge(await post<MergePreview>({ action: 'merge-preview', number: proposal.number })); }); }, true));
    } else if (published && workspace.branch !== target.defaultBranch && !merged) actions(button('Propose changes', renderProposal, true));
    if (workspace.branch === target.defaultBranch) content.append(el('p', 'Publishing here updates the default branch directly. Create a working branch when you want a separate proposal first.', 'nt-workspace-note'));
    content.append(el('p', 'Merging code and deploying your website are separate. Deployment depends on this repository’s configuration.'));
    actions(button('Change repository', () => { view = 'target'; content.replaceChildren(el('h3', 'Choose the destination')); renderTargetForm(); }), button('Disconnect account', () => { void run(async () => { await post({ action: 'disconnect' }); await loadGitHub(); renderGitHub(); }); })); updateNav();
  };
  const renderPublish = (plan: PublishPreview) => {
    view = 'publish-review'; content.replaceChildren(el('h3', 'Ready to publish'), el('p', `Account: ${plan.account}`), el('p', `Repository: ${plan.target.fullName} · ${plan.target.private ? 'Private' : 'Public'}`), el('p', `Branch: ${plan.branch} · ${plan.commits.length} version${plan.commits.length === 1 ? '' : 's'} to publish`));
    content.append(el('p', plan.updatesMain ? 'This publishes directly to the repository’s default branch.' : 'This publishes your working branch. The default branch stays unchanged.', 'nt-workspace-note'));
    const list = el('ul'); plan.commits.forEach(c => list.append(el('li', `${c.title} · ${c.sha.slice(0, 8)}`))); content.append(list); details(plan.diff, plan.files);
    if (dirty(plan.dirty)) content.append(el('p', 'You have uncommitted edits. They stay on this computer and are not part of this upload.'));
    content.append(el('p', 'Publishing sends these commits and their history, including files changed or deleted in earlier versions. Review that history before sharing a repository.'));
    actions(button('Back', renderGitHub), button('Publish to GitHub', () => { void run(async () => { await post({ action: 'publish', previewId: plan.id }); await loadGitHub(); view = 'published'; content.replaceChildren(el('h3', 'Published to GitHub.'), el('p', `${plan.target.fullName} · ${plan.branch}`)); actions(button('View GitHub status', renderGitHub), ...(plan.updatesMain ? [] : [button('Propose changes', renderProposal, true)])); }); }, true));
  };
  const renderProposal = () => {
    if (!workspace || !github?.target) return; view = 'proposal';
    const w = workspace, target = github.target, account = github.account;
    content.replaceChildren(el('h3', 'Propose your changes'), el('p', `${target.fullName}: ${w.branch} → ${target.defaultBranch}`), el('p', 'A pull request lets you review these changes before combining them with the main work. It does not merge or deploy them.'));
    const form = el('form'), title = field(form, 'Proposal title', publishing?.commits[0]?.title || `Update ${w.branch}`), label = el('label', 'Proposal description'), body = el('textarea'); body.maxLength = 8000; body.rows = 5; body.value = publishing?.commits.map(c => `- ${c.title}`).join('\n') || `Changes from ${w.branch}.`; label.append(body); form.append(label);
    const submit = el('button', 'Create proposal', 'primary'); submit.type = 'submit'; form.append(submit); content.append(form);
    form.onsubmit = e => { e.preventDefault(); void run(async () => { await post<GitHubProposal>({ action: 'propose', account, targetId: target.id, private: target.private, base: target.defaultBranch, branch: w.branch, head: w.head, title: title.value, body: body.value }); await loadGitHub(); renderGitHub(); }); };
  };
  const renderMerge = (plan: MergePreview) => {
    view = 'merge-review'; content.replaceChildren(el('h3', plan.merged ? 'Already merged on GitHub' : 'Review the proposal'), el('p', plan.proposal.title), link('Open the full proposal on GitHub', plan.proposal.url));
    if (plan.merged) { actions(button('Back to GitHub', () => { void open('github'); })); return; }
    content.append(el('p', `${plan.proposal.branch} → ${plan.proposal.base}`)); details(plan.diff);
    const checks = el('ul'); plan.checks.forEach(c => checks.append(el('li', `${c.name}: ${c.conclusion || c.status}`))); content.append(checks);
    content.append(el('p', plan.canMerge ? 'GitHub reports this proposal is ready to merge.' : 'Checks, required reviews, conflicts or a merge queue still need attention. Complete them in GitHub and refresh.', plan.canMerge ? 'nt-flow-state' : 'nt-workspace-note'));
    content.append(el('p', `Review requirement: ${plan.reviewDecision || 'No required review reported'}. Commit status: ${plan.status}.`));
    const choices: Array<[string, string]> = []; if (plan.target.allowMerge) choices.push(['merge', 'Keep the branch commits']); if (plan.target.allowSquash) choices.push(['squash', 'Combine changes into one commit']); if (plan.target.allowRebase) choices.push(['rebase', 'Replay the branch commits']);
    const method = select(content, 'How to combine the changes', choices);
    const merge = button('Merge on GitHub', () => { void run(async () => { await post({ action: 'merge', previewId: plan.id, number: plan.proposal.number, method: method.value }); await loadGitHub(); content.replaceChildren(el('h3', 'Merged on GitHub.'), el('p', 'Your local files and branch are unchanged. Update your local main branch in your Git client when you are ready.'), el('p', 'A website deploy runs only if this repository is configured to deploy on merge.')); view = 'merged'; actions(button('View GitHub status', renderGitHub)); }); }, true);
    merge.dataset.merge = 'true'; merge.dataset.allowed = String(plan.canMerge && choices.length > 0);
    actions(button('Refresh merge review', () => { void run(async () => renderMerge(await post<MergePreview>({ action: 'merge-preview', number: plan.proposal.number }))); }), merge);
  };
  for (const [key, label] of [['branch', 'Your branch'], ['github', 'GitHub'], ['basics', 'Git basics']]) { const b = button(label, () => { void open(key); }); b.dataset.view = key; nav.append(b); }
  const open = async (next = 'branch') => {
    if (busy) return; if (!ui.dialog.open) ui.dialog.showModal();
    await run(async () => { await refresh(); await loadGitHub(); if (destroyed) return; view = next; if (next === 'github') renderGitHub(); else if (next === 'basics') showBasics(); else renderBranch(); updateNav(); });
  };
  const focus = () => { if (poll) void refresh(); }; window.addEventListener('focus', focus);
  ui.dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
  return { open, refresh, receiveGitHub() { if (!busy && ui.dialog.open && view === 'github') void loadGitHub().then(renderGitHub).catch(e => error(errorMessage(e))); },
    start() { if (!poll) poll = setInterval(() => { if (document.visibilityState === 'visible' && !busy) void refresh(); }, 5000); void refresh(); },
    attachNotice(target: HTMLElement) { notice = el('aside', '', 'nt-branch-notice'); notice.setAttribute('aria-label', 'Workspace guide'); notice.hidden = true; target.append(notice); renderNotice(); },
    destroy() { destroyed = true; clearInterval(poll); window.removeEventListener('focus', focus); notice?.remove(); style.remove(); ui.destroy(); }
  };
}
