import type { ElementContext, ElementTarget } from '../../contracts/src/index.js';
import { bindSelectionInput, type SelectionMode, type SelectionRect } from './selection-input.js';
import type { SelectionControls } from './selection-controls.js';

const limit = 20;
const atomic = 'button,a,input,textarea,select,summary,[role="button"],[role="link"],[contenteditable],svg,img,video,canvas,iframe';
const excluded = 'script,style,template,noscript,link,meta,[hidden],[data-nudgethis-overlay]';

/** Fully enclosed visible targets, with nested button contents and ancestor containers collapsed. */
export function elementsInArea(rect: SelectionRect, host: HTMLElement): Element[] {
  let scanned = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
    acceptNode: node => {
      if (++scanned > 5000) throw new Error('This page is too large for an area scan. Use Select multiple to pick individual elements.');
      const element = node as Element, style = getComputedStyle(element);
      return element.matches(excluded) || style.display === 'none' || Number(style.opacity) === 0 ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    }
  });
  const found = new Set<Element>();
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const element = node as Element;
    if (element.parentElement?.closest(atomic)) continue;
    const bounds = element.getBoundingClientRect();
    if (bounds.width < 4 || bounds.height < 4 || bounds.left < rect.x || bounds.top < rect.y || bounds.right > rect.x + rect.width || bounds.bottom > rect.y + rect.height) continue;
    const style = getComputedStyle(element);
    if (style.visibility !== 'visible' || style.display === 'none' || Number(style.opacity) === 0) continue;
    const hit = document.elementsFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2).find(target => target !== host);
    if (!hit || !element.contains(hit)) continue;
    found.add(element);
  }
  // Retain the most specific visible boxes, except atomic controls already handled above.
  for (const element of [...found]) for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) found.delete(parent);
  if (found.size > limit) throw new Error(`That area contains ${found.size} elements. Select a smaller area (up to ${limit}).`);
  return [...found];
}

const styles = `
.selection-surface{position:fixed;inset:0;pointer-events:auto;touch-action:none;cursor:crosshair;z-index:1}.selection-rectangle{position:fixed;border:2px solid var(--dr-accent);background:color-mix(in srgb,var(--dr-accent) 12%,transparent);pointer-events:none;z-index:2}.selected-outline{z-index:2}.selected-outline span{position:absolute;top:-20px;left:-2px;min-width:20px;padding:1px 4px;font:700 11px/16px var(--dr-font-body);background:var(--dr-accent);color:var(--dr-onAccent)}.overlay-tools{z-index:5}.panel{z-index:6}.pick-notice{z-index:5}.multiple-launcher,.area-launcher{pointer-events:auto;padding:12px;border:1px solid var(--dr-border);border-radius:var(--dr-radius);background:var(--dr-surface);color:var(--dr-text);font:var(--dr-size)/1.5 var(--dr-font-body)}.multiple-launcher[aria-pressed=true],.area-launcher[aria-pressed=true]{background:var(--dr-accent);color:var(--dr-onAccent)}.selection-tray{position:fixed;right:12px;bottom:94px;width:min(330px,calc(100vw - 24px));max-height:calc(100dvh - 170px);overflow:auto;padding:16px;border:1px solid var(--dr-border);border-radius:var(--dr-radius);background:var(--dr-surface);color:var(--dr-text);pointer-events:auto;z-index:5;font:var(--dr-size)/1.5 var(--dr-font-body)}.selection-tray header{display:flex;justify-content:space-between;gap:8px;align-items:center}.selection-tray button,.selection-items button,.edit-selection{padding:6px 9px;border:1px solid var(--dr-border);border-radius:var(--dr-radius);background:var(--dr-surface);color:var(--dr-text);font:inherit}.selection-tray p{font-size:12px;color:var(--dr-muted);margin:10px 0}.selection-tray footer{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}.selection-items{list-style:none;padding:0;margin:8px 0;max-height:175px;overflow:auto}.selection-items li{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--dr-border);font:12px/1.4 var(--dr-font-body)}.selection-items li span{flex:1;min-width:0;overflow-wrap:anywhere}.selection-items li[data-missing=true]{color:var(--dr-danger)}.selection-items button{flex:none}.selection-tray [data-review-selection]{background:var(--dr-accent);color:var(--dr-onAccent);border-color:var(--dr-accent)}.selection-tray [data-selection-error]{color:var(--dr-danger)}.selection-summary{margin-bottom:12px}.edit-selection{font-size:12px}@media(max-width:600px){.selection-tray{bottom:126px;max-height:calc(100dvh - 200px)}.multiple-launcher,.area-launcher{padding:10px}}
`;

export function createElementSelection(options: {
  host: HTMLElement; shadow: ShadowRoot; controls: () => SelectionControls; available: () => boolean;
  capture: (element: Element) => ElementTarget; resolve: (context: ElementTarget) => Element | undefined;
  onChange: () => void; onReview: () => void; onPicking: () => void; onCancel: () => void;
}) {
  const { shadow } = options;
  const markup = document.createElement('div');
  markup.innerHTML = `<style>${styles}</style><div class="selection-surface" hidden></div><div class="selection-rectangle" hidden></div><div class="selected-outlines"></div><section class="selection-tray" aria-label="Selected elements" hidden><header><strong data-selection-count role="status" aria-live="polite">0 selected</strong><button type="button" data-cancel-selection>Cancel</button></header><p>Click or tap to add or remove. Review the group when you are ready.</p><ol class="selection-items"></ol><p data-selection-error role="status"></p><footer><button type="button" data-clear-selection>Clear</button><button type="button" data-review-selection disabled>Review selection</button></footer></section>`;
  shadow.append(markup);
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => shadow.querySelector<T>(selector)!;
  const tray = $('.selection-tray'), surface = $('.selection-surface'), rectangle = $('.selection-rectangle'), outlines = $('.selected-outlines'), hover = $('.outline');
  const summary = $('.selection-summary');
  let items: Array<{ context: ElementTarget; element?: Element }> = [];
  let mode: SelectionMode | null = null, reviewing = false, signature = '';
  const context = (): ElementContext | undefined => items.length ? { ...items[0].context, ...(items.length > 1 ? { elements: items.map(item => item.context) } : {}) } : undefined;
  const valid = () => !!items.length && items.every(item => !!item.element);
  const message = (text: string) => { $('[data-selection-error]').textContent = text; };
  const lists = () => {
    for (const container of [tray, summary]) {
      const list = container.querySelector('ol')!;
      list.replaceChildren(...items.map((item, index) => {
        const row = document.createElement('li'); row.dataset.missing = String(!item.element);
        const label = document.createElement('span'); label.textContent = `${index + 1}. ${item.context.tagName} · ${item.context.text.slice(0, 70) || item.context.ariaLabel || item.context.selector}${item.element ? '' : ' · Select again or remove'}`;
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove element ${index + 1}`);
        remove.onclick = () => { if (!options.available()) return; items.splice(index, 1); render(); (list.querySelectorAll<HTMLButtonElement>('button')[Math.min(index, items.length - 1)] || container.querySelector<HTMLButtonElement>('button'))?.focus(); };
        row.append(label, remove); return row;
      }));
    }
  };
  const place = (element: HTMLElement, rect: SelectionRect) => Object.assign(element.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  const draw = () => {
    outlines.replaceChildren(...items.flatMap((item, index) => {
      if (!item.element) return [];
      const line = document.createElement('div'); line.className = 'outline selected-outline'; place(line, item.element.getBoundingClientRect());
      const number = document.createElement('span'); number.textContent = String(index + 1); line.append(number); return [line];
    }));
  };
  const render = () => {
    signature = items.map(item => !!item.element).join(',');
    $('[data-selection-count]').textContent = `${items.length} selected`;
    $<HTMLButtonElement>('[data-review-selection]').disabled = !valid();
    tray.hidden = reviewing || mode === 'single' || mode === 'area' || (!items.length && mode !== 'multiple');
    summary.hidden = !reviewing;
    lists(); draw(); options.onChange();
  };
  const review = () => {
    refresh(); if (!valid()) return;
    input.cancel(); reviewing = true; render(); options.onReview();
  };
  const change = (targets: Element[], additive: boolean, toggle: boolean) => {
    const next = additive ? [...items] : [];
    for (const target of targets) {
      const element = additive ? target.closest('button,a,summary,[role="button"],[role="link"],[contenteditable]') || target.closest('svg') || target : target;
      if (!element.isConnected || element === options.host || element.closest('[data-nudgethis-overlay]')) continue;
      const index = next.findIndex(item => item.element === element);
      if (index >= 0) { if (toggle) next.splice(index, 1); continue; }
      const captured = options.capture(element);
      if (!captured.selector) { message('That element cannot be identified uniquely. Select a parent or another element.'); return; }
      if (next.some(item => item.context.url !== captured.url)) { message('These elements belong to another page. Clear the selection before starting again.'); return; }
      const prior = next.findIndex(item => item.context.selector === captured.selector);
      if (prior >= 0) next[prior] = { context: captured, element };
      else next.push({ context: captured, element });
    }
    if (next.length > limit) { message(`Select up to ${limit} elements at a time.`); return; }
    if (next.length && new TextEncoder().encode(JSON.stringify({ ...next[0].context, elements: next.map(item => item.context) })).length > 48 * 1024) { message('This selection has too much DOM context. Select fewer elements or disable DOM capture.'); return; }
    items = next; message(''); render();
    if (!additive) review();
  };
  const refresh = () => {
    for (const item of items) item.element = options.resolve(item.context);
    if (signature !== items.map(item => !!item.element).join(',')) render(); else draw();
  };
  const input = bindSelectionInput({
    host: options.host, areaSurface: surface, controls: options.controls, available: options.available,
    select: (element, additive) => change([element], additive, true),
    area: rect => {
      try { const targets = elementsInArea(rect, options.host); if (targets.length) change(targets, true, false); else message('No fully enclosed visible elements. Try a larger rectangle or pick elements individually.'); }
      catch (error) { message(error instanceof Error ? error.message : String(error)); }
    },
    rectangle: rect => { rectangle.hidden = !rect; if (rect) place(rectangle, rect); },
    armed: value => {
      mode = value; surface.hidden = value !== 'area';
      for (const [name, label] of [['single', 'Pick element'], ['multiple', 'Select multiple'], ['area', 'Select area']] as const) {
        const button = $(`.${name === 'single' ? 'pick' : name}-launcher`); button.setAttribute('aria-pressed', String(value === name)); button.textContent = value === name ? (name === 'single' ? 'Cancel picking' : name === 'area' ? 'Cancel area' : 'Picking multiple') : label;
      }
      $('.pick-notice').hidden = !value;
      $('.pick-notice').textContent = value === 'area' ? 'Drag around the elements · Escape to cancel' : value === 'multiple' ? 'Click or tap elements · Review selection when ready' : 'Click or tap an element · Escape to cancel';
      if (value) { reviewing = false; options.onPicking(); }
      render();
    },
    hover: element => { hover.hidden = !element; if (element) place(hover, element.getBoundingClientRect()); }
  });
  const clear = () => { input.cancel(); items = []; reviewing = false; message(''); render(); options.onCancel(); };
  $('[data-review-selection]').onclick = review;
  $('[data-clear-selection]').onclick = () => { items = []; render(); message('Selection cleared. Pick elements to begin again.'); };
  $('[data-cancel-selection]').onclick = clear;
  $('.edit-selection').onclick = () => input.toggle('multiple');
  $('.pick-launcher').onclick = () => input.toggle('single');
  $('.multiple-launcher').onclick = () => input.toggle('multiple');
  $('.area-launcher').onclick = () => input.toggle('area');
  return { context, valid, count: () => items.length, primary: () => items[0]?.element, refresh, clear,
    replace: (element: Element) => change([element], false, false),
    cancel: () => { input.cancel(); reviewing = true; tray.hidden = true; hover.hidden = true; },
    destroy() { input.destroy(); markup.remove(); }
  };
}
