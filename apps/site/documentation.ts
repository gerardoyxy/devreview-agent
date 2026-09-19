// Progressive enhancement: installation commands and guides remain readable without JavaScript.
export {};
for (const section of document.querySelectorAll<HTMLElement>('[data-install]')) {
  const tabs = [...section.querySelectorAll<HTMLButtonElement>('[data-install-tab]')];
  const panels = [...section.querySelectorAll<HTMLElement>('[data-install-panel]')];
  const list = section.querySelector<HTMLElement>('[data-install-tabs]')!;
  function select(index: number, focus = false): void {
    tabs.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; });
    panels.forEach((panel, i) => { panel.hidden = i !== index; });
    if (focus) tabs[index].focus();
  }
  list.hidden = false;
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(i));
    tab.addEventListener('keydown', event => {
      let next = i;
      if (event.key === 'ArrowRight') next = (i + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (i + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault(); select(next, true);
    });
  });
  // Choosing explicitly avoids confusing a Windows browser with a WSL execution environment.
  select(0);
}

for (const pre of document.querySelectorAll<HTMLPreElement>('.terminal-install pre, .docs-article pre')) {
  const code = pre.querySelector('code');
  if (!code || code.classList.contains('language-mermaid')) continue;
  pre.tabIndex = 0;
  const wrapper = document.createElement('div'); wrapper.className = 'code-block';
  pre.before(wrapper); wrapper.append(pre);
  const button = document.createElement('button'); button.type = 'button'; button.className = 'copy-command';
  button.textContent = 'Copy'; button.setAttribute('aria-label', 'Copy code');
  const status = document.createElement('span'); status.className = 'copy-status'; status.setAttribute('role', 'status');
  button.addEventListener('click', async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(code.textContent?.trimEnd() || '');
      status.textContent = 'Copied';
    } catch { status.textContent = 'Select and copy the code manually.'; }
  });
  wrapper.append(button, status);
}

for (const table of document.querySelectorAll<HTMLTableElement>('.docs-article table')) {
  const scroll = document.createElement('div'); scroll.className = 'docs-table'; scroll.tabIndex = 0;
  scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', 'Scrollable reference table');
  table.before(scroll); scroll.append(table);
}
const navigation = document.querySelector<HTMLDetailsElement>('[data-docs-navigation]');
if (navigation && matchMedia('(max-width: 800px)').matches) navigation.open = false;
