import { icon } from './icons.js';
import { paletteStyles } from './tool-palette-css.js';

const tools = [
  { id: 'color', label: 'Change color', help: 'Choose a color for the selection.', glyph: 'color' },
  { id: 'size', label: 'Make bigger', help: 'Give this element more presence.', glyph: 'size' },
  { id: 'spacing', label: 'Add spacing', help: 'Give the surrounding content room.', glyph: 'spacing' },
  { id: 'corners', label: 'Round corners', help: 'Soften the edges of the selection.', glyph: 'corners' },
  { id: 'same-size', label: 'Same size', help: 'Match the size of selected elements.', glyph: 'multiple' },
  { id: 'text', label: 'Change text', help: 'Write the words you want to see.', glyph: 'text' }
] as const;
const elements = [
  { id: 'button', label: 'Button', help: 'A clear action to click or tap.', sample: '<span class="tp-sample-button">Continue →</span>' },
  { id: 'text', label: 'Text', help: 'A heading and a short explanation.', sample: '<span class="tp-sample-text"><b>A fresh idea.</b><i></i><i></i></span>' },
  { id: 'image', label: 'Image', help: 'A place for a photo or illustration.', sample: '<span class="tp-sample-image">' + icon('image') + '</span>' },
  { id: 'card', label: 'Card', help: 'Related content in one small block.', sample: '<span class="tp-sample-card"><i></i><b>A little more</b><small>All in one place.</small></span>' },
  { id: 'input', label: 'Form field', help: 'A labeled field for user input.', sample: '<span class="tp-sample-input"><small>Your name</small><i>Enter your name</i></span>' },
  { id: 'section', label: 'Section', help: 'A larger group of related content.', sample: '<span class="tp-sample-section"><b>Your next chapter.</b><i></i><i></i></span>' }
] as const;
type ToolId = typeof tools[number]['id'];
type ElementId = typeof elements[number]['id'];
type Preferences = { side: 'left' | 'right'; favorites: string[] };
const ids = new Set([...tools.map(t => `tool:${t.id}`), ...elements.map(e => `element:${e.id}`)]);
const storageKey = 'nudgethis:tool-palette:v1';
const readPreferences = (raw: string | null): Preferences => {
  try {
    const value = raw && raw.length < 2048 ? JSON.parse(raw) : null;
    return { side: value?.side === 'left' ? 'left' : 'right', favorites: Array.isArray(value?.favorites) ? [...new Set<string>(value.favorites.filter((id: unknown) => typeof id === 'string' && ids.has(id)))].slice(0, 12) : [] };
  } catch { return { side: 'right', favorites: [] }; }
};
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') => {
  const value = document.createElement(tag); value.textContent = text; value.className = className; return value;
};

/** Presentation preferences only. Requests use the existing captured-selection review flow. */
export function createToolPalette(options: {
  shadow: ShadowRoot;
  beforeOpen: () => void;
  selection: () => { count: number; valid: boolean; busy: boolean };
  prepare: (request: string) => boolean;
  resume: () => void;
  pick: () => void;
  style: () => void;
  history: () => void;
}) {
  const { shadow } = options;
  const mount = node('div'); mount.innerHTML = `<style>${paletteStyles}</style>
    <section class="tool-palette" aria-label="Tools and elements" hidden>
      <header class="tp-header"><div><small>YOUR WORKBENCH</small><h2>Tools &amp; elements</h2></div><button type="button" class="tp-collapse" aria-label="Collapse palette">${icon('close')}</button></header>
      <div class="tp-tabs" role="tablist" aria-label="Palette category"><button type="button" role="tab" id="tp-tools-tab" aria-controls="tp-tools" aria-selected="true">Tools</button><button type="button" role="tab" id="tp-elements-tab" aria-controls="tp-elements" aria-selected="false" tabindex="-1">Elements</button></div>
      <div class="tp-content"><p class="tp-selection" role="status"></p>
        <div id="tp-tools" role="tabpanel" aria-labelledby="tp-tools-tab"><p class="tp-help">Small adjustments, in your own words. Choose a tool to prepare a request.</p><div class="tp-tool-grid tp-grid"></div></div>
        <div id="tp-elements" role="tabpanel" aria-labelledby="tp-elements-tab" hidden><p class="tp-help">Choose an example, then select where it belongs. Your project’s components and style come first.</p><div class="tp-element-grid tp-grid"></div></div>
        <form class="tp-inspector"><h3></h3><div class="tp-fields"></div><p class="tp-help tp-insertion-note" hidden>One selected element is the reference point. The request asks for a suitable, valid location in your project.</p><p class="tp-help tp-requirement"></p><button type="button" class="tp-pick">Pick a reference element</button><button type="submit" class="tp-prepare">Prepare request</button><p class="tp-error" role="alert"></p></form>
        <div class="tp-shortcuts"><button type="button" class="tp-style">${icon('star')} My Style</button><button type="button" class="tp-history">${icon('queue')} Review changes</button></div>
        <p class="tp-help">Preparing a request does not change your page. Edit it, save a draft or start a conversation, then review the proposed code.</p>
      </div>
      <footer class="tp-footer"><label>Dock side <select aria-label="Palette position"><option value="left">Left</option><option value="right">Right</option></select></label><small>Star favorites to keep them first.</small><p class="tp-storage" role="status" hidden></p></footer>
    </section>`;
  shadow.append(mount);
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => mount.querySelector<T>(selector)!;
  const palette = $('.tool-palette'), trigger = shadow.querySelector<HTMLButtonElement>('.palette-launcher')!;
  const dock = shadow.querySelector<HTMLElement>('.overlay-tools')!;
  for (const [className, glyph, label] of [['pick', 'pointer', 'Pick element'], ['multiple', 'multiple', 'Select multiple'], ['area', 'area', 'Select area'], ['controls', 'controls', 'Selection controls'], ['palette', 'palette', 'Open tools and elements']] as const) {
    const button = dock.querySelector<HTMLButtonElement>(`.${className}-launcher`)!;
    button.classList.add('tp-dock-control'); button.setAttribute('aria-label', label); button.title = label;
    button.innerHTML = `${icon(glyph)}<span>${className === 'controls' ? 'Controls' : className === 'palette' ? 'Palette' : label}</span>`;
  }
  const fields = $('.tp-fields'), prepare = $<HTMLButtonElement>('.tp-prepare');
  const layout = () => {
    const bottom = Math.max(12, innerHeight - dock.getBoundingClientRect().top + 12);
    palette.style.bottom = `${bottom}px`; palette.style.maxHeight = `calc(100dvh - ${bottom + 12}px)`;
    const tray = shadow.querySelector<HTMLElement>('.selection-tray');
    if (tray) { tray.style.bottom = `${bottom}px`; tray.style.maxHeight = `calc(100dvh - ${bottom + 12}px)`; }
  };
  const dockSize = new ResizeObserver(layout); dockSize.observe(dock);
  window.addEventListener('resize', layout);
  let preferences: Preferences;
  try { preferences = readPreferences(localStorage.getItem(storageKey)); } catch { preferences = readPreferences(null); }
  let category: 'tools' | 'elements' = 'tools', tool: ToolId = 'color', component: ElementId = 'button';
  let returnFocus: HTMLElement | null = null;
  const values = { color: '#2147cc', colorPart: 'background', size: '15', spacing: '8', corners: '8', text: '', content: '', placement: 'after' };
  const side = () => {
    palette.dataset.side = preferences.side; dock.dataset.side = preferences.side;
    $<HTMLSelectElement>('.tp-footer select').value = preferences.side;
  };
  const save = () => {
    try { localStorage.setItem(storageKey, JSON.stringify(preferences)); $('.tp-storage').hidden = true; }
    catch { $('.tp-storage').hidden = false; $('.tp-storage').textContent = 'Storage is unavailable. Preferences last until this page closes.'; }
  };
  const close = (focus = false) => {
    palette.hidden = true; trigger.setAttribute('aria-expanded', 'false');
    if (focus) options.resume();
    if (focus) (returnFocus?.isConnected && returnFocus.getClientRects().length ? returnFocus : trigger).focus();
  };
  const sync = () => {
    const selection = options.selection();
    $('.tp-selection').textContent = selection.count ? `${selection.count} ${selection.count === 1 ? 'element' : 'elements'} selected${selection.valid ? '' : ' · select again'}` : 'Start with something on your page.';
    const needsOne = category === 'elements' || tool === 'text';
    const enough = needsOne ? selection.count === 1 : tool === 'same-size' ? selection.count >= 2 : selection.count > 0;
    prepare.disabled = selection.busy || !selection.valid || !enough;
    $('.tp-requirement').textContent = selection.busy ? 'Wait for the current save to finish.' : selection.count && !selection.valid ? 'A selected element changed. Select it again before preparing a request.' : !enough ? needsOne ? 'Select one reference element to continue.' : tool === 'same-size' ? 'Select at least two elements for this tool.' : 'Pick an element or a group to continue.' : '';
    $('.tp-pick').hidden = selection.valid && enough;
    $<HTMLButtonElement>('.tp-pick').disabled = selection.busy;
    $<HTMLButtonElement>('.tp-style').disabled = selection.busy || !!selection.count && !selection.valid;
  };
  const addField = (label: string, key: keyof typeof values, type: string, settings: Record<string, string> = {}) => {
    const wrapper = node('label', label), input = node('input'); input.type = type; input.value = values[key];
    input.required = true; input.setAttribute('aria-label', label);
    for (const [name, value] of Object.entries(settings)) input.setAttribute(name, value);
    input.oninput = () => { values[key] = input.value; };
    wrapper.append(input); fields.append(wrapper);
  };
  const addSelect = (label: string, key: 'placement' | 'colorPart', items: string[][]) => {
    const wrapper = node('label', label), select = node('select'); select.setAttribute('aria-label', label);
    for (const [value, text] of items) { const option = node('option', text); option.value = value; select.append(option); }
    select.value = values[key]; select.onchange = () => { values[key] = select.value; }; wrapper.append(select); fields.append(wrapper);
  };
  const inspector = () => {
    fields.replaceChildren(); $('.tp-error').textContent = ''; $('.tp-insertion-note').hidden = category !== 'elements';
    if (category === 'elements') {
      $('.tp-inspector h3').textContent = `Add ${elements.find(e => e.id === component)!.label.toLowerCase()}`;
      addSelect('Placement', 'placement', [['before', 'Before the selected element'], ['after', 'After the selected element'], ['inside', 'Inside the selected container']]);
      const label = node('label', 'What should it say or do? (optional)'), input = node('textarea');
      input.maxLength = 1000; input.rows = 2; input.value = values.content; input.setAttribute('aria-label', 'Component details'); input.placeholder = 'For example: a button to open the contact form';
      input.oninput = () => { values.content = input.value; }; label.append(input); fields.append(label);
    } else {
      $('.tp-inspector h3').textContent = tools.find(t => t.id === tool)!.label;
      if (tool === 'color') { addField('Color', 'color', 'color'); addSelect('Apply color to', 'colorPart', [['background', 'Background'], ['text', 'Text'], ['border', 'Border']]); }
      if (tool === 'size') addField('Increase size (%)', 'size', 'number', { min: '1', max: '100', step: '1' });
      if (tool === 'spacing') addField('Extra space (px)', 'spacing', 'number', { min: '1', max: '96', step: '1' });
      if (tool === 'corners') addField('Corner radius (px)', 'corners', 'number', { min: '0', max: '96', step: '1' });
      if (tool === 'text') addField('New text', 'text', 'text', { maxlength: '1000' });
      if (tool === 'same-size') fields.append(node('p', 'Use a consistent width and height that fits the content of every selected element.', 'tp-help'));
    }
    sync();
  };
  const renderCards = () => {
    for (const [kind, entries, container] of [['tool', tools, $('.tp-tool-grid')], ['element', elements, $('.tp-element-grid')]] as const) {
      const previous = shadow.activeElement as HTMLElement | null;
      const focusId = container.contains(previous) ? previous?.dataset.favorite || previous?.dataset.choice : undefined;
      const wasFavorite = !!previous?.dataset.favorite;
      container.replaceChildren();
      const sorted = [...entries].sort((a, b) => Number(preferences.favorites.includes(`${kind}:${b.id}`)) - Number(preferences.favorites.includes(`${kind}:${a.id}`)));
      for (const entry of sorted) {
        const id = `${kind}:${entry.id}`, card = node('div', '', 'tp-card'), choose = node('button', '', 'tp-choice');
        choose.type = 'button'; choose.dataset.choice = id; choose.setAttribute('aria-label', entry.label);
        choose.setAttribute('aria-pressed', String(kind === 'tool' ? tool === entry.id : component === entry.id));
        const sample = node('span', '', 'tp-sample'); sample.setAttribute('aria-hidden', 'true');
        sample.innerHTML = 'sample' in entry ? entry.sample : icon(entry.glyph);
        choose.append(sample, node('strong', entry.label), node('small', entry.help));
        choose.onclick = () => {
          if (kind === 'tool') tool = entry.id as ToolId; else component = entry.id as ElementId;
          renderCards(); inspector();
          const heading = $('.tp-inspector h3'); heading.tabIndex = -1; heading.focus({ preventScroll: true });
          heading.scrollIntoView({ block: 'start', behavior: 'instant' });
        };
        const favorite = node('button', '', 'tp-favorite'); favorite.innerHTML = icon('star'); favorite.type = 'button'; favorite.dataset.favorite = id;
        favorite.setAttribute('aria-label', `Favorite ${entry.label}`); favorite.setAttribute('aria-pressed', String(preferences.favorites.includes(id))); favorite.title = `Keep ${entry.label} first`;
        favorite.onclick = () => { preferences.favorites = preferences.favorites.includes(id) ? preferences.favorites.filter(item => item !== id) : [...preferences.favorites, id]; save(); renderCards(); };
        card.append(choose, favorite); container.append(card);
      }
      if (focusId) container.querySelector<HTMLElement>(`[data-${wasFavorite ? 'favorite' : 'choice'}="${focusId}"]`)?.focus();
    }
  };
  const tabs = [...mount.querySelectorAll<HTMLButtonElement>('[role=tab]')];
  const selectTab = (index: number, focus = false) => {
    category = index === 0 ? 'tools' : 'elements';
    tabs.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; });
    $('#tp-tools').hidden = index !== 0; $('#tp-elements').hidden = index !== 1;
    inspector(); $('.tp-content').scrollTop = 0; if (focus) tabs[index].focus();
  };
  tabs.forEach((tab, index) => {
    tab.onclick = () => selectTab(index);
    tab.onkeydown = event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); selectTab(event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index, true);
    };
  });
  $<HTMLFormElement>('.tp-inspector').onsubmit = event => {
    event.preventDefault(); sync(); if (prepare.disabled) return;
    let request: string;
    if (category === 'elements') {
      const label = elements.find(e => e.id === component)!.label.toLowerCase();
      request = `Add a ${label} ${values.placement === 'inside' ? 'inside the selected container' : `${values.placement} the selected element`}. Reuse this project’s existing components, framework and design conventions. Keep the HTML structure valid; if this placement is unsuitable, explain the nearest suitable alternative before changing it.`;
      if (values.content.trim()) request += `\nDetails: ${values.content.trim()}`;
      if (component === 'image') request += '\nUse an existing suitable project asset or a clearly labeled placeholder; do not invent an image URL. Include appropriate alternative text.';
      if (component === 'input') request += '\nInclude an associated label and preserve the form’s validation and behavior.';
      if (component === 'button') request += '\nPreserve existing interactions and use the appropriate button or link semantics.';
    } else {
      const group = options.selection().count > 1 ? 'selected elements' : 'selected element';
      request = ({
        color: `Change the ${values.colorPart} color of the ${group} to ${values.color}. Keep foreground and background readable and explain any contrast issue.`,
        size: `Make the ${group} approximately ${values.size}% bigger, keeping its proportions and fitting surrounding content.`,
        spacing: `Add approximately ${values.spacing}px more space around the ${group}, using the appropriate layout gap, margin or padding without doubling shared gaps.`,
        corners: `Set the corner radius of the ${group} to ${values.corners}px.`,
        'same-size': 'Give all selected elements a consistent width and height that accommodates their content. Do not truncate labels.',
        text: `Replace the visible text of the selected element with ${JSON.stringify(values.text)}. Preserve its behavior and accessible name.`
      })[tool];
    }
    request += '\nPreserve unrelated content and functionality, and keep the result usable on desktop and mobile.';
    if (options.prepare(request)) close(); else $('.tp-error').textContent = 'The selection changed or the request is too long. Review the selection and keep the combined request under 8,000 characters.';
  };
  const open = () => {
    if (options.selection().busy) return;
    returnFocus = shadow.activeElement as HTMLElement | null;
    options.beforeOpen(); palette.hidden = false; trigger.setAttribute('aria-expanded', 'true'); layout(); sync(); tabs[category === 'tools' ? 0 : 1].focus();
  };
  trigger.setAttribute('aria-controls', 'nt-tool-palette'); palette.id = 'nt-tool-palette';
  trigger.onclick = () => palette.hidden ? open() : close(true);
  $('.tp-collapse').onclick = () => close(true);
  palette.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); } });
  $('.tp-pick').onclick = () => { close(); options.pick(); };
  $('.tp-style').onclick = () => { close(); options.style(); };
  $('.tp-history').onclick = () => { close(); options.history(); };
  $<HTMLSelectElement>('.tp-footer select').onchange = () => { preferences.side = $<HTMLSelectElement>('.tp-footer select').value === 'left' ? 'left' : 'right'; side(); save(); };
  const stored = (event: StorageEvent) => { if (event.key !== storageKey) return; preferences = readPreferences(event.newValue); side(); renderCards(); };
  window.addEventListener('storage', stored);
  side(); renderCards(); inspector();
  return { open, close, sync, isOpen: () => !palette.hidden, destroy() { dockSize.disconnect(); window.removeEventListener('resize', layout); window.removeEventListener('storage', stored); trigger.onclick = null; mount.remove(); } };
}
